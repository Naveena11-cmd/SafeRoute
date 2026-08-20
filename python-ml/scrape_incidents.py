"""
SafeRoute — web scraping
(covers: Web Scraping, APIs & Data Ingestion)

Scrapes a municipal-style safety bulletin page (an HTML table of incident
reports) and turns it into a clean pandas DataFrame, ready to merge into
the road-segment dataset alongside the synthetic data in
generate_dataset.py. This is deliberately a *different* skill from the
Nominatim/OSRM calls used elsewhere in the project: those are clean JSON
APIs, this is unstructured-HTML scraping — parsing tags, walking the DOM,
and normalizing messy real-world text into structured fields.

Two modes:
  1. Local file (default) — parses sample_incident_bulletin.html shipped
     alongside this script, so the pipeline runs fully offline/reproducibly.
  2. Live URL — pass --url to fetch and scrape a real page instead. Point
     it at your own city's public incident/safety bulletin page; the
     parsing logic will need adjusting to match that page's actual HTML
     structure (this script's parser is written for the sample page's
     table layout as a template to adapt from).

Run:
    python scrape_incidents.py                     # scrapes the local sample page
    python scrape_incidents.py --url https://...    # scrapes a live page instead
"""

import argparse
import re
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

SAMPLE_PAGE = Path(__file__).parent / "sample_incident_bulletin.html"

# Rough lat/lon centroids for the areas named in the bulletin, so scraped
# rows can be plotted/merged with the rest of the geo data. A production
# version would geocode `area` via Nominatim instead of a lookup table.
AREA_COORDS = {
    "kalupur": (23.0292, 72.5811), "ranip": (23.0620, 72.5730),
    "vasna": (23.0100, 72.5470), "nikol": (23.0225, 72.5980),
    "sg highway": (23.0339, 72.5540), "maninagar": (23.0060, 72.5550),
    "chandkheda": (23.0480, 72.5610), "bapunagar": (23.0410, 72.5850),
    "bopal": (23.0210, 72.5290), "isanpur": (22.9990, 72.5490),
    "vejalpur": (23.0325, 72.5455), "naranpura": (23.0390, 72.5700),
    "khokhra": (23.0180, 72.5850), "gota": (23.0555, 72.5330),
}


def fetch_html(url: str | None) -> str:
    if url:
        resp = requests.get(url, timeout=10, headers={"User-Agent": "SafeRoute-scraper/1.0"})
        resp.raise_for_status()
        return resp.text
    return SAMPLE_PAGE.read_text(encoding="utf-8")


def parse_bulletin(html: str) -> pd.DataFrame:
    soup = BeautifulSoup(html, "html.parser")

    rows = []
    for tr in soup.select("table#incident-log tr.incident-row"):
        cells = tr.find_all("td")
        if len(cells) < 5:
            continue

        date_text = cells[0].get_text(strip=True)
        category = cells[1].get_text(strip=True)
        area = cells[2].get_text(strip=True)
        severity = cells[3].get_text(strip=True)
        notes = cells[4].get_text(strip=True)

        try:
            date = datetime.strptime(date_text, "%d-%m-%Y").date()
        except ValueError:
            date = None

        area_key = re.sub(r"\s+", " ", area).strip().lower()
        lat, lon = AREA_COORDS.get(area_key, (None, None))

        rows.append({
            "date": date, "incident_type": category, "area": area,
            "severity": severity, "description": notes, "lat": lat, "lon": lon,
        })

    return pd.DataFrame(rows)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize categories/severities to the same vocabulary used elsewhere
    in the project (Incident model choices, hotspot types in the frontend)."""
    type_map = {
        "theft": "Theft", "harassment": "Harassment", "lighting": "Lighting",
        "construction": "Construction", "road-block": "Road-block", "roadblock": "Road-block",
    }
    sev_map = {"low": "Low", "medium": "Medium", "high": "High"}

    df["incident_type"] = df["incident_type"].str.lower().map(type_map).fillna(df["incident_type"])
    df["severity"] = df["severity"].str.lower().map(sev_map).fillna(df["severity"])

    before = len(df)
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    dropped = before - len(df)
    if dropped:
        print(f"Dropped {dropped} row(s) with an unrecognized area (no coordinates on file).")

    return df


def main():
    parser = argparse.ArgumentParser(description="Scrape a safety-bulletin page into a clean CSV.")
    parser.add_argument("--url", default=None, help="Live page to scrape instead of the local sample.")
    parser.add_argument("--out", default="scraped_incidents.csv", help="Output CSV path.")
    args = parser.parse_args()

    html = fetch_html(args.url)
    df = parse_bulletin(html)
    df = clean(df)

    print(f"Scraped {len(df)} incident rows.")
    print(df.head(10))
    print("\nBy category:\n", df["incident_type"].value_counts())
    print("\nBy severity:\n", df["severity"].value_counts())

    df.to_csv(args.out, index=False)
    print(f"\nSaved -> {args.out}")


if __name__ == "__main__":
    main()
