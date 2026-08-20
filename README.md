# SafeRoute

A pedestrian safety-routing app for Ahmedabad. Real road-network routing
(OpenStreetMap + OSRM) is scored for safety using scikit-learn models
trained on road-segment features and real reported incident data, with
routes classified as **Safest / Fastest / Balanced** by a trained
classifier rather than sorted by a single metric.

## Stack

```
saferoute/
├── python-ml/       # pandas EDA + regression/classification model training (no server)
└── django-backend/  # THE backend — Models/Users/REST APIs/ML, powers the app
└── frontend/        # React + Leaflet app (Vite) — the only client
```

One backend, one frontend. `django-backend/` serves auth, incidents,
route planning, route history, yearly analysis, and ML scoring — all in
one process, loading the trained scikit-learn models directly via
`joblib.load` rather than calling out to a separate service.

## 1. Python ML — train the models (no server here)

```bash
cd python-ml
pip install -r requirements.txt
python generate_dataset.py   # synthetic road-segment dataset -> road_segments.csv
python eda.py                # optional: EDA plots (correlation, distributions...)
python train_models.py       # trains + saves safety_regressor.joblib, risk_classifier.joblib, scaler.joblib
```

This step only produces trained model files on disk. `django-backend/`
loads them directly — run this at least once before starting Django.

**Web scraping** (a different skill from the clean JSON APIs used
elsewhere — this is real unstructured-HTML parsing):

```bash
python scrape_incidents.py                      # scrapes sample_incident_bulletin.html (local, offline)
python scrape_incidents.py --url https://...     # scrapes a live page instead
```

Uses `requests` + `BeautifulSoup` to parse an HTML table of incident
reports into a clean CSV — normalizing category/severity text and
mapping named areas to coordinates.

## 2. Django backend

```bash
cd django-backend
pip install -r requirements.txt
python manage.py migrate           # applies migrations AND auto-imports core/data.csv
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver 8000    # http://localhost:8000
```

**`migrate` automatically loads `core/data.csv`** (real, hand-curated
incident records) into the database the first time — see
`core/apps.py`'s `post_migrate` hook. It only imports when the Incident
table is empty, so it's safe to run on every `migrate` without
duplicating data. This is what makes hotspots show up on the map and
feed route safety scoring immediately on a fresh clone, with no manual
step to remember.

Optional: `python manage.py seed_data` adds a larger synthetic baseline
on top (more hotspots, 5 years of synthetic history for the analysis
charts) if you want denser demo data. `python import_incidents.py`
re-runs the CSV import manually (e.g. after editing `data.csv`).

**Configuration:** all secrets/host config now come from environment
variables instead of being hardcoded — see `django-backend/.env.example`
for the full list (`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`,
`DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `OSRM_BASE_URL`).
None of these are required for local dev — copy `.env.example` to `.env`
and fill values in only when deploying somewhere real. `DEBUG` defaults
to `True` and CORS defaults to allow-all locally so the Vite dev server
just works out of the box; set `DJANGO_DEBUG=false` plus the two
allow-list vars for any real deployment.

**Endpoints:**

- `POST /api/auth/register/` — creates a `SafeRouteUser`, returns a JWT
- `POST /api/auth/login/` — JWT login by email (djangorestframework-simplejwt)
- `GET  /api/auth/me/` — current user
- `PATCH /api/auth/me/` — update username
- `GET/POST /api/incidents/` — community incident reports
- `GET  /api/hotspots/` — every incident as a map hotspot (real data from `data.csv` + any community reports)
- `POST /api/routes/plan/` — single real OSRM route + safety score
- `POST /api/routes/plan-multi/` — up to 3 route alternatives, each classified **Safest / Fastest / Balanced** by a trained model, scored against real hotspot data
- `GET  /api/routes/history/` — a logged-in user's past routes
- `GET  /api/analysis/` — real aggregation over the Incident table (year-by-type, year-on-year totals, top risk areas) — not hardcoded numbers
- `POST /api/predict/`, `POST /api/predict-route/` — direct access to the trained safety models
- `/admin/` — Django admin, browse everything directly

**Real-world data sources (replacing synthetic defaults):**

Route scoring (`score_route_geometry` -> `predict_one`) still uses the
trained model + its synthetic reference dataset (`python-ml/road_segments.csv`)
as a baseline, but three of its inputs — `lighting_score`,
`sidewalk_present`, `cctv_present` (proxied by nearby police posts) —
are now overridden with real OpenStreetMap data per route, fetched
once per request from the Overpass API and cached (`core/services/osm.py`).
If Overpass is unreachable, rate-limited, or times out, scoring
silently falls back to the synthetic values — nothing breaks, it just
loses that real-data boost for that request.

Incident data (`core/data.csv`) can be replaced with a real open
dataset — set `INCIDENT_DATA_SOURCE` to a local path or an http(s) URL
(any city open-data CSV/JSON export) and re-run:

```bash
python manage.py ingest_incidents --source https://example.gov/open-data/incidents.csv
```

Column names are auto-detected (e.g. `Lat`/`Latitude`, `Category`/`Type`,
`Priority`/`Severity` all map correctly) — see
`core/services/incident_ingest.py` for the full alias list. If the
configured source is offline or fails to parse, ingestion automatically
falls back to the bundled `core/data.csv` rather than leaving the
Incident table empty.

## 3. React frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Defaults to `http://localhost:8000/api` (Django) via `VITE_API_URL`.
Django must be running first.

A real routed multi-page app (`react-router-dom`):

- `/` — landing page
- `/signup`, `/login` — real accounts via Django JWT, login by email
- `/app` — Route & Safety: search, up to 3 ranked real-road routes
  labeled by category, live hotspot markers
- `/app/history` — a logged-in user's past planned routes; **click one
  to view that exact route back on the main map**
- `/app/analysis` — charts fed by real Django-side aggregation
- `/app/alerts` — live incident feed
- `/app/report` — incident report form; submissions immediately show up
  in Alerts and as a new hotspot on the map
- `/app/settings` — change your username

## Why routes follow real roads

Route planning calls **OSRM** (`/route/v1/foot/...` with
`overview=full&geometries=geojson&alternatives=true`, plus via-point
requests offset to either side of the direct path to force genuinely
different route alternatives), which snaps start/end points to the
actual street graph and returns full turn-by-turn geometry — so the
drawn line follows real streets, not a straight line between two
coordinates. The public `router.project-osrm.org` server is fine for
demos; for production, self-host OSRM or use a service like Mapbox
Directions / OpenRouteService with an API key.
