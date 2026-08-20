"""
core/services/osm.py

Pulls real street-level safety signals from OpenStreetMap via the public
Overpass API, to replace three of the synthetic columns predict_one()
used to read straight from python-ml/generate_dataset.py's fake data:

    lighting_score    <- density of `node[highway=street_lamp]`
    sidewalk_present  <- presence of a `highway=footway`/`sidewalk=*` way
    cctv_present      <- proxied by nearby `amenity=police` (see note below)

Design notes
------------
* ONE Overpass request per route, not one per scored point. A route gets
  sampled to ~40 points (see score_route_geometry()); hitting a public,
  rate-limited API 40 times for a single "plan a route" click would be
  slow and likely to get us throttled. Instead get_route_osm_context()
  fetches every streetlight/sidewalk/police node inside the route's
  bounding box in a single query, and per-point lookups
  (`point_osm_features()`) are then pure in-memory distance checks.

* Caching. Overpass responses are cached via Django's cache framework,
  keyed off the bbox rounded to a coarse grid (~1.1km cells) so nearby
  routes reuse the same cached fetch instead of re-querying for a bbox
  that's shifted by a few hundred metres. Default TTL is 24h (street
  infrastructure doesn't change minute to minute) — override with
  OSM_CACHE_TTL_SECONDS.

* Fallback. Every public function here returns `None` (not a partial or
  fake result) on any failure — network error, timeout, non-200,
  malformed JSON. Callers (score_route_geometry / predict_one) are
  expected to treat `None` as "no override available" and quietly keep
  using the synthetic reference value for that feature, exactly as
  before this integration existed. Nothing here ever raises out to the
  request/response cycle.

CCTV proxy caveat: OSM has no reliable, widely-tagged "there is a CCTV
camera here" layer for most cities (surveillance camera tagging is
sparse). Presence of a police post within range is used as a rough
proxy for "this area has some active safety presence" instead. This is
a deliberate simplification, not a claim that police posts have visible
cameras — worth revisiting if a better local data source shows up.
"""

import logging
import math

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

OVERPASS_URL = getattr(settings, "OVERPASS_URL", "https://overpass-api.de/api/interpreter")
REQUEST_TIMEOUT_S = getattr(settings, "OSM_REQUEST_TIMEOUT_SECONDS", 12)
CACHE_TTL_S = getattr(settings, "OSM_CACHE_TTL_SECONDS", 24 * 60 * 60)

# Radii used when turning "features near this point" into the same 0-10 /
# 0-1 scales the ML model was trained on (see FEATURES in core/views.py).
STREETLIGHT_RADIUS_M = 120
SIDEWALK_RADIUS_M = 35
POLICE_RADIUS_M = 400

# A streetlight roughly every ~25-30m is "well lit" (score 10); zero
# lights nearby is "pitch dark" (score 0). This is a rough calibration,
# not a cited standard — tune STREETLIGHTS_FOR_MAX_SCORE if it feels off
# against real areas once this is live.
STREETLIGHTS_FOR_MAX_SCORE = 6


def _grid_key(min_lat, min_lon, max_lat, max_lon, grid_deg=0.01):
    """Rounds a bbox onto a coarse (~1.1km) grid so nearby routes share
    a cache entry instead of each making its own Overpass request."""
    r = lambda v: round(v / grid_deg) * grid_deg
    return f"osm_bbox:{r(min_lat):.3f}:{r(min_lon):.3f}:{r(max_lat):.3f}:{r(max_lon):.3f}"


def _distance_meters(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(a)))


def _fetch_overpass(query):
    """Low-level Overpass POST. Returns the parsed `elements` list, or
    None on any failure. Never raises."""
    try:
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=REQUEST_TIMEOUT_S)
        response.raise_for_status()
        return response.json().get("elements", [])
    except requests.RequestException:
        logger.warning("Overpass request failed", exc_info=True)
        return None
    except (ValueError, KeyError):
        logger.warning("Overpass response could not be parsed", exc_info=True)
        return None


def get_route_osm_context(min_lat, min_lon, max_lat, max_lon, pad_deg=0.003):
    """
    Fetches streetlights, sidewalk-tagged ways, and police posts inside
    a padded bounding box, in a single Overpass request. Returns:

        {
          "streetlights": [(lat, lon), ...],
          "sidewalks":    [(lat, lon), ...],   # node-level footway/sidewalk points
          "police":       [(lat, lon), ...],
        }

    or None if the query failed for any reason (network/timeout/rate
    limit/malformed response) — callers must treat None as "no OSM data
    available for this route" and fall back to synthetic values.
    """
    min_lat, max_lat = min_lat - pad_deg, max_lat + pad_deg
    min_lon, max_lon = min_lon - pad_deg, max_lon + pad_deg
    bbox = f"{min_lat},{min_lon},{max_lat},{max_lon}"

    cache_key = _grid_key(min_lat, min_lon, max_lat, max_lon)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    query = f"""
        [out:json][timeout:{REQUEST_TIMEOUT_S}];
        (
          node["highway"="street_lamp"]({bbox});
          way["highway"="footway"]["footway"!="crossing"]({bbox});
          way["sidewalk"]({bbox});
          node["amenity"="police"]({bbox});
          way["amenity"="police"]({bbox});
        );
        out center;
    """
    elements = _fetch_overpass(query)
    if elements is None:
        return None  # Overpass failed — do NOT cache a failure.

    streetlights, sidewalks, police = [], [], []
    for el in elements:
        # Nodes have lat/lon directly; ways return a "center" point when
        # requested with `out center` instead of a full geometry, which
        # is all we need for proximity checks.
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue

        tags = el.get("tags", {})
        if tags.get("highway") == "street_lamp":
            streetlights.append((lat, lon))
        elif tags.get("amenity") == "police":
            police.append((lat, lon))
        elif tags.get("highway") == "footway" or "sidewalk" in tags:
            sidewalks.append((lat, lon))

    context = {"streetlights": streetlights, "sidewalks": sidewalks, "police": police}
    cache.set(cache_key, context, CACHE_TTL_S)
    logger.info(
        "Overpass fetch OK: %d streetlights, %d sidewalk points, %d police posts",
        len(streetlights), len(sidewalks), len(police),
    )
    return context


def point_osm_features(lat, lon, osm_context):
    """
    Turns the raw OSM context (from get_route_osm_context) into
    ML-feature-ready overrides for a single point: {lighting_score,
    sidewalk_present, cctv_present}. Returns {} (no overrides) if
    osm_context is None, so callers can unconditionally do
    `row.update(point_osm_features(...))` without a None-check.
    """
    if not osm_context:
        return {}

    nearby_lights = sum(
        1 for (la, lo) in osm_context["streetlights"]
        if _distance_meters(lat, lon, la, lo) <= STREETLIGHT_RADIUS_M
    )
    lighting_score = min(10.0, (nearby_lights / STREETLIGHTS_FOR_MAX_SCORE) * 10)

    sidewalk_present = 1 if any(
        _distance_meters(lat, lon, la, lo) <= SIDEWALK_RADIUS_M
        for (la, lo) in osm_context["sidewalks"]
    ) else 0

    cctv_present = 1 if any(
        _distance_meters(lat, lon, la, lo) <= POLICE_RADIUS_M
        for (la, lo) in osm_context["police"]
    ) else 0

    return {
        "lighting_score": round(lighting_score, 2),
        "sidewalk_present": sidewalk_present,
        "cctv_present": cctv_present,
    }
