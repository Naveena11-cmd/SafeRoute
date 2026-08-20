"""
core/services/incident_ingest.py

Loads real incident/crime data — a local CSV/JSON file or a remote
http(s) URL, e.g. a city open-data portal export — and normalizes it
into the shape core.models.Incident expects, regardless of what the
source dataset happens to call its columns.

This replaces hand-typing the field names a specific dataset uses:
point INCIDENT_DATA_SOURCE (settings.py / env var) at a real dataset
and this does the column-mapping, type coercion, and validation. If
that dataset is offline, missing, or doesn't parse, ingestion falls
back to the bundled core/data.csv baseline automatically — a bad or
temporarily-down external source should never leave the app with zero
incident data.
"""

import logging
from io import StringIO
from pathlib import Path

import pandas as pd
import requests
from django.conf import settings

from core.models import Incident

logger = logging.getLogger(__name__)

FALLBACK_CSV_PATH = Path(__file__).resolve().parents[2] / "core" / "data.csv"

# Real-world datasets name these columns all kinds of things. Each
# canonical field maps to every alias we'll actually try to match,
# case-insensitively, with underscores/spaces/hyphens normalized away.
FIELD_ALIASES = {
    "latitude": ["latitude", "lat", "y"],
    "longitude": ["longitude", "lon", "lng", "long", "x"],
    "incident_type": ["incident_type", "type", "category", "crime_type", "offense"],
    "severity": ["severity", "risk", "priority", "risk_level"],
    "location_label": ["location_label", "location", "area", "address", "place", "landmark"],
    "description": ["description", "desc", "details", "remarks", "narrative"],
    "reported_at": ["reported_at", "timestamp", "date", "datetime", "occurred_at", "report_date", "date_reported"],
}

# Free-text -> our TYPE_CHOICES. Checked as a substring match against the
# lowercased source value, so "Theft - Bicycle" still maps to "Theft".
TYPE_KEYWORDS = {
    "theft": "Theft", "robbery": "Theft", "burglary": "Theft", "stolen": "Theft",
    "harass": "Harassment", "assault": "Harassment", "stalking": "Harassment",
    "light": "Lighting", "dark": "Lighting",
    "construction": "Construction", "roadwork": "Construction",
    "block": "Road-block", "closure": "Road-block", "obstruction": "Road-block",
}

SEVERITY_KEYWORDS = {
    "high": "High", "severe": "High", "critical": "High",
    "medium": "Medium", "moderate": "Medium",
    "low": "Low", "minor": "Low",
}


def _normalize_col_name(name):
    return str(name).strip().lower().replace(" ", "_").replace("-", "_")


def _build_rename_map(columns):
    """Maps whatever columns the source file actually has onto our
    canonical field names, using FIELD_ALIASES. Columns that don't
    match anything are left alone (and later ignored)."""
    normalized = {_normalize_col_name(c): c for c in columns}
    rename = {}
    for canonical, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                rename[normalized[alias]] = canonical
                break
    return rename


def _classify(value, keywords, choices, default):
    if not isinstance(value, str) or not value.strip():
        return default
    lowered = value.lower()
    for keyword, mapped in keywords.items():
        if keyword in lowered:
            return mapped
    # Exact match against a real choice (case-insensitive), e.g. a
    # dataset that already says "Theft" outright.
    for choice in choices:
        if lowered == choice.lower():
            return choice
    return default


def load_raw_source(source):
    """
    Loads a CSV or JSON incident dataset from a local path or an
    http(s) URL. Returns a raw (un-normalized) DataFrame, or raises —
    callers are expected to catch and fall back (see ingest_incidents).
    """
    is_url = str(source).startswith("http://") or str(source).startswith("https://")

    if is_url:
        response = requests.get(source, timeout=20)
        response.raise_for_status()
        text = response.text
        content_hint = response.headers.get("Content-Type", "")
    else:
        text = Path(source).read_text()
        content_hint = ""

    looks_json = text.lstrip()[:1] in ("[", "{") or "json" in content_hint
    if looks_json:
        return pd.read_json(StringIO(text))
    return pd.read_csv(StringIO(text))


def normalize_incident_df(df):
    """
    Renames columns to our canonical field names, coerces types, and
    drops rows that can't be salvaged (no usable coordinates). Returns
    a DataFrame with exactly: latitude, longitude, incident_type,
    severity, location_label, description, reported_at.
    """
    df = df.rename(columns=_build_rename_map(df.columns))

    for required in ("latitude", "longitude"):
        if required not in df.columns:
            raise ValueError(f"Source data has no recognizable '{required}' column")

    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    before = len(df)
    df = df.dropna(subset=["latitude", "longitude"])
    dropped = before - len(df)
    if dropped:
        logger.warning("Dropped %d rows with missing/invalid coordinates", dropped)

    valid_types = [c[0] for c in Incident.TYPE_CHOICES]
    valid_severities = [c[0] for c in Incident.SEVERITY_CHOICES]

    df["incident_type"] = (
        df["incident_type"].apply(lambda v: _classify(v, TYPE_KEYWORDS, valid_types, "Other"))
        if "incident_type" in df.columns else "Other"
    )
    df["severity"] = (
        df["severity"].apply(lambda v: _classify(v, SEVERITY_KEYWORDS, valid_severities, "Medium"))
        if "severity" in df.columns else "Medium"
    )
    df["location_label"] = df["location_label"].fillna("").astype(str) if "location_label" in df.columns else ""
    df["description"] = df["description"].fillna("").astype(str) if "description" in df.columns else ""

    if "reported_at" in df.columns:
        df["reported_at"] = pd.to_datetime(df["reported_at"], errors="coerce")
        df["reported_at"] = df["reported_at"].fillna(pd.Timestamp.utcnow())
    else:
        df["reported_at"] = pd.Timestamp.utcnow()

    return df[["latitude", "longitude", "incident_type", "severity", "location_label", "description", "reported_at"]]


def ingest_incidents(source=None, source_tag="Historical"):
    """
    Loads + normalizes + writes incidents to the database.

    `source`: local path or http(s) URL. Defaults to
    settings.INCIDENT_DATA_SOURCE if set, else the bundled
    core/data.csv. If a configured/remote source fails to load for any
    reason (offline, 404, unparseable), this automatically falls back
    to core/data.csv rather than leaving the Incident table empty.

    Idempotent: only replaces rows previously tagged with `source_tag`,
    same as the original import_incidents.py behavior.

    Returns a summary dict: {"source_used": ..., "imported": N, "fallback_used": bool}.
    """
    from django.utils import timezone

    configured_source = source or getattr(settings, "INCIDENT_DATA_SOURCE", "") or str(FALLBACK_CSV_PATH)

    fallback_used = False
    try:
        raw_df = load_raw_source(configured_source)
        source_used = configured_source
    except Exception:
        logger.warning(
            "Could not load incident source %r — falling back to bundled data.csv",
            configured_source, exc_info=True,
        )
        raw_df = load_raw_source(str(FALLBACK_CSV_PATH))
        source_used = str(FALLBACK_CSV_PATH)
        fallback_used = True

    df = normalize_incident_df(raw_df)
    logger.info("Ingesting %d normalized incident rows from %s", len(df), source_used)

    deleted, _ = Incident.objects.filter(source=source_tag).delete()
    if deleted:
        logger.info("Cleared %d previously imported '%s' incidents", deleted, source_tag)

    imported = 0
    for _, row in df.iterrows():
        reported_at = row["reported_at"].to_pydatetime() if hasattr(row["reported_at"], "to_pydatetime") else row["reported_at"]
        if timezone.is_naive(reported_at):
            reported_at = timezone.make_aware(reported_at)

        incident = Incident.objects.create(
            incident_type=row["incident_type"],
            severity=row["severity"],
            location_label=row["location_label"] or "Unknown location",
            lat=float(row["latitude"]),
            lon=float(row["longitude"]),
            description=row["description"],
            source=source_tag,
            reported_by=None,
        )
        # created_at has auto_now_add=True, so it must be overwritten via
        # a separate .update() after creation to reflect the dataset's
        # real report date instead of "now" — same reasoning as before.
        Incident.objects.filter(pk=incident.pk).update(created_at=reported_at)
        imported += 1

    logger.info("Imported %d incidents (source=%s, fallback_used=%s)", imported, source_used, fallback_used)
    return {"source_used": source_used, "imported": imported, "fallback_used": fallback_used}
