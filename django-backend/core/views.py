import logging
import sys
from pathlib import Path
from datetime import datetime
import joblib
import requests
import math
from django.conf import settings
from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Incident, SavedRoute
from .serializers import (
    EmailTokenObtainPairSerializer, IncidentSerializer,
    RegisterSerializer, SavedRouteSerializer, UpdateUsernameSerializer, UserSerializer,
)
from .services import osm as osm_service

logger = logging.getLogger(__name__)

# Reuse the scikit-learn models trained in python-ml/ (Regression + Classification
# topics) so Django's REST layer scores routes with the *same* trained model
# instead of re-deriving a heuristic in JavaScript. Loaded with absolute paths
# so it doesn't matter what directory `manage.py runserver` was started from.
ML_DIR = Path(settings.BASE_DIR).parent / "python-ml"
sys.path.append(str(ML_DIR))

FEATURES = [
    "hour_of_day", "lighting_score", "crime_reports_30d", "foot_traffic",
    "sidewalk_present", "past_accidents_1y", "avg_speed_limit", "cctv_present",
]

_reg_model = _clf_model = _reference_df = None
_segment_kdtree = None  # scipy.spatial.cKDTree over (lat, lon) — see below
ML_AVAILABLE = False
_ml_loaded = False


def ensure_ml_loaded():
    global _reg_model, _clf_model, _reference_df, _segment_kdtree, ML_AVAILABLE, _ml_loaded
    if _ml_loaded:
        return ML_AVAILABLE
    _ml_loaded = True
    try:
        from generate_dataset import build_dataset  # noqa: E402
        from scipy.spatial import cKDTree

        reg_path = ML_DIR / "safety_regressor.joblib"
        clf_path = ML_DIR / "risk_classifier.joblib"

        if reg_path.exists() and clf_path.exists():
            _reg_model = joblib.load(reg_path)
            _clf_model = joblib.load(clf_path)
            _reference_df = build_dataset()
            _segment_kdtree = cKDTree(_reference_df[["lat", "lon"]].to_numpy())
            ML_AVAILABLE = True
            logger.info("ML models loaded (%d reference segments).", len(_reference_df))
    except Exception:  # model files not trained yet, or sklearn/scipy missing
        logger.exception("ML models not loaded")
    return ML_AVAILABLE



def predict_one(lat, lon, hour_of_day=None, osm_overrides=None):
    """
    Scores a single point with the trained regressor/classifier.
    """
    if not ensure_ml_loaded() or _segment_kdtree is None:
        score = 75.0
        if hour_of_day is not None and (hour_of_day < 6 or hour_of_day > 22):
            score -= 15.0
        return {
            "lat": lat, "lon": lon,
            "safety_score": round(max(0, min(100, score)), 1),
            "risk_level": "Medium" if score < 70 else "Low",
            "nearest_segment": "SEG100000",
            "osm_backed": bool(osm_overrides),
        }
    _, nearest_idx = _segment_kdtree.query([lat, lon])
    row = _reference_df.iloc[nearest_idx].copy()
    if hour_of_day is not None:
        row["hour_of_day"] = hour_of_day
    for key, value in (osm_overrides or {}).items():
        row[key] = value
    X = row[FEATURES].to_frame().T.astype(float)
    safety_score = float(_reg_model.predict(X)[0])
    risk_level = str(_clf_model.predict(X)[0])
    return {
        "lat": lat, "lon": lon,
        "safety_score": round(max(0, min(100, safety_score)), 1),
        "risk_level": risk_level,
        "nearest_segment": row["segment_id"],
        "osm_backed": bool(osm_overrides),
    }


def _distance_meters(lat1, lon1, lat2, lon2):
    """
    Haversine distance between two GPS coordinates.
    Returns distance in meters.
    """
    R = 6371000

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(d_lambda / 2) ** 2
    )

    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_incident_hotspots():
    """
    Reads real incidents from the Django database.

    Every incident becomes a hotspot signal for:
    1. Map visualization
    2. Route safety scoring
    """

    hotspots = []

    for incident in Incident.objects.all():

        # Incident model uses lat/lon
        lat = incident.lat
        lon = incident.lon

        severity = incident.severity
        incident_type = incident.incident_type

        severity_weight = {
            "High": 3.0,
            "Medium": 2.0,
            "Low": 1.0,
        }.get(
            severity,
            1.0
        )

        hotspots.append({
            "id": incident.id,
            "lat": float(lat),
            "lon": float(lon),
            "incident_type": incident_type,
            "severity": severity,
            "weight": severity_weight,
            "location_label": incident.location_label,
            "description": incident.description,
            "source": incident.source,
            "created_at": incident.created_at,
        })

    return hotspots


def calculate_hotspot_risk(lat, lon, hotspots):
    """
    Calculates risk at a route point based on nearby incidents.

    Incidents closer to the route have stronger influence.
    High severity incidents have stronger influence than Low severity.
    """

    total_risk = 0.0

    for hotspot in hotspots:

        distance = _distance_meters(
            lat,
            lon,
            hotspot["lat"],
            hotspot["lon"],
        )

        # Ignore incidents more than 250m from the route.
        if distance > 250:
            continue

        # Strongest effect within 50m.
        if distance <= 50:
            distance_factor = 1.0

        elif distance <= 100:
            distance_factor = 0.7

        elif distance <= 175:
            distance_factor = 0.4

        else:
            distance_factor = 0.2

        total_risk += (
            hotspot["weight"]
            * distance_factor
        )

    return total_risk


def score_route_geometry(coordinates, hour_of_day=None):
    """
    Scores a route using:

    1. Existing trained ML model, with lighting/sidewalk/police features
       swapped for real OpenStreetMap data where available (see
       core/services/osm.py) instead of the synthetic reference dataset
    2. Real community Incident hotspots

    coordinates:
        list of [lon, lat]
    """

    hotspots = get_incident_hotspots()

    # Sample route points so scoring remains fast.
    step = max(1, len(coordinates) // 40)
    sampled = coordinates[::step]

    # ONE Overpass request for the whole route's bounding box, not one
    # per sampled point (that would be up to 40 external requests per
    # route). Returns None if OSM is unreachable/times out/rate-limits —
    # every point below just falls back to the synthetic reference
    # values in that case, exactly as if this integration weren't here.
    osm_context = None
    if sampled:
        lats = [lat for _, lat in sampled]
        lons = [lon for lon, _ in sampled]
        try:
            osm_context = osm_service.get_route_osm_context(
                min(lats), min(lons), max(lats), max(lons)
            )
        except Exception:
            # Belt-and-suspenders: get_route_osm_context() already
            # catches its own network/parsing errors and returns None,
            # but scoring a route must never fail because of OSM.
            logger.warning("OSM context fetch failed unexpectedly", exc_info=True)
            osm_context = None

    scored = []

    for lon, lat in sampled:

        # -------------------------------
        # ML SAFETY SCORE
        # -------------------------------

        if ensure_ml_loaded():
            osm_overrides = osm_service.point_osm_features(lat, lon, osm_context)
            prediction = predict_one(
                lat,
                lon,
                hour_of_day,
                osm_overrides=osm_overrides,
            )

            ml_score = prediction["safety_score"]
            risk_level = prediction["risk_level"]
            osm_backed = prediction["osm_backed"]

        else:
            ml_score = 70.0
            risk_level = "Unknown"
            osm_backed = False

        # -------------------------------
        # INCIDENT HOTSPOT RISK
        # -------------------------------

        hotspot_risk = calculate_hotspot_risk(
            lat,
            lon,
            hotspots
        )

        # Convert incident risk into a penalty.
        #
        # Higher incident risk = lower safety score.
        incident_penalty = min(
            45,
            hotspot_risk * 5
        )

        final_score = max(
            0,
            min(
                100,
                ml_score - incident_penalty
            )
        )

        scored.append({
            "lat": lat,
            "lon": lon,
            "safety_score": round(
                final_score,
                1
            ),
            "ml_score": round(
                ml_score,
                1
            ),
            "hotspot_risk": round(
                hotspot_risk,
                2
            ),
            "risk_level": risk_level,
            "osm_backed": osm_backed,
        })

    if not scored:

        return {
            "points": [],
            "overall_safety_score": 50.0,
            "riskiest_point": None,
        }

    # Weighted average.
    #
    # We give more importance to the worst locations,
    # because one dangerous hotspot should matter.
    scores = [
        point["safety_score"]
        for point in scored
    ]

    average_score = sum(scores) / len(scores)

    worst_score = min(scores)

    # Final route score:
    # 70% overall average
    # 30% worst point
    overall = (
        average_score * 0.7
        + worst_score * 0.3
    )

    worst = min(
        scored,
        key=lambda x: x["safety_score"]
    )

    return {
        "points": scored,
        "overall_safety_score": round(
            overall,
            1
        ),
        "riskiest_point": worst,
    }


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ — Django Models and Users."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {"token": str(refresh.access_token), "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class EmailTokenObtainPairView(TokenObtainPairView):
    """POST /api/auth/login/ — logs in with { email, password } instead of username."""
    serializer_class = EmailTokenObtainPairSerializer


class MeView(APIView):
    """
    GET /api/auth/me/    — current logged-in user
    PATCH /api/auth/me/  — { username } — the only editable field on the
    Your Details page. Email and password are intentionally not editable
    here.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UpdateUsernameSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class IncidentViewSet(viewsets.ModelViewSet):
    """
    /api/incidents/  (GET list, POST create)
    Every incident becomes a hotspot signal for route scoring.
    """
    queryset = Incident.objects.all()
    serializer_class = IncidentSerializer
    permission_classes = [permissions.AllowAny]  # community reports allowed while logged out too

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(
            reported_by=user,
            source="Community" if user else "Community",
        )


class SavedRouteViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/routes/history/ — a logged-in user's past planned routes."""
    serializer_class = SavedRouteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SavedRoute.objects.filter(user=self.request.user)


class PlanRouteView(APIView):
    """
    POST /api/routes/plan/  { source: {lat,lon,label}, destination: {lat,lon,label} }

    Calls OSRM for real, road-snapped walking directions, scores the route
    with the trained sklearn model, and (if authenticated) saves it via the
    Django ORM.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        source = request.data.get("source")
        destination = request.data.get("destination")
        if not source or not destination:
            return Response({"error": "source and destination are required"}, status=400)

        coord_str = f"{source['lon']},{source['lat']};{destination['lon']},{destination['lat']}"
        osrm_url = f"{settings.OSRM_BASE_URL}/route/v1/foot/{coord_str}"
        try:
            resp = requests.get(
                osrm_url,
                params={"overview": "full", "geometries": "geojson", "alternatives": "true"},
                timeout=10,
            )
            data = resp.json()
        except requests.RequestException as exc:
            return Response({"error": f"Routing service unavailable: {exc}"}, status=502)

        if not data.get("routes"):
            return Response({"error": "No route found"}, status=404)

        route = data["routes"][0]
        geometry = route["geometry"]
        safety = score_route_geometry(geometry["coordinates"], datetime.now().hour)

        result = {
            "source": source,
            "destination": destination,
            "distanceKm": round(route["distance"] / 1000, 2),
            "durationMin": round(route["duration"] / 60),
            "geometry": geometry,
            "overallSafetyScore": safety["overall_safety_score"],
            "riskiestPoint": safety["riskiest_point"],
            "scoredPoints": safety["points"],
        }

        if request.user.is_authenticated:
            score = safety["overall_safety_score"]
            risk = "Low" if score >= 70 else "Medium" if score >= 45 else "High"
            SavedRoute.objects.create(
                user=request.user,
                source_label=source.get("label", ""), source_lat=source["lat"], source_lon=source["lon"],
                destination_label=destination.get("label", ""),
                destination_lat=destination["lat"], destination_lon=destination["lon"],
                distance_km=result["distanceKm"], duration_min=result["durationMin"],
                overall_safety_score=score, risk_level=risk, geometry=geometry,
            )

        return Response(result)


class PredictView(APIView):
    """
    POST /api/predict/   { points: [{lat, lon}, ...], hour_of_day?: int }

    Direct access to the trained regressor/classifier for arbitrary
    points — the same job python-ml/app.py (Flask) used to do, now served
    by Django directly so no separate Flask process is needed.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not ensure_ml_loaded():
            return Response({"error": "ML models not loaded on the server"}, status=503)

        points = request.data.get("points", [])
        hour_of_day = request.data.get("hour_of_day", datetime.now().hour)
        results = [predict_one(p["lat"], p["lon"], hour_of_day) for p in points]
        return Response({"results": results})


class PredictRouteView(APIView):
    """
    POST /api/predict-route/   { coordinates: [[lon,lat], ...], hour_of_day?: int }

    Scores an already-computed OSRM route geometry. Equivalent to Flask's
    old /predict-route endpoint, now native to Django.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not ensure_ml_loaded():
            return Response({"error": "ML models not loaded on the server"}, status=503)

        coordinates = request.data.get("coordinates", [])
        hour_of_day = request.data.get("hour_of_day", datetime.now().hour)
        safety = score_route_geometry(coordinates, hour_of_day)
        return Response({
            "points": safety["points"],
            "overall_safety_score": safety["overall_safety_score"],
            "riskiest_point": safety["riskiest_point"],
        })


class AnalysisView(APIView):
    """
    GET /api/analysis/

    Real aggregation over the Incident table (Django ORM) powering the
    Yearly Analysis dashboard: incidents by year & type, year-on-year
    totals, this year's category breakdown, and top risk areas — no
    hardcoded numbers.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from django.db.models import Count
        from django.db.models.functions import ExtractYear

        qs = Incident.objects.annotate(year=ExtractYear("created_at"))

        by_year_type = list(
            qs.values("year", "incident_type").annotate(count=Count("id")).order_by("year")
        )

        by_year_total = list(
            qs.values("year").annotate(count=Count("id")).order_by("year")
        )

        current_year = datetime.now().year
        this_year_by_type = list(
            qs.filter(year=current_year)
            .values("incident_type").annotate(count=Count("id")).order_by("-count")
        )

        # Weighted severity score per area: High=3, Medium=2, Low=1.
        # Done in Python (rather than a DB-side CASE/annotate) for portability
        # across the SQLite/Postgres/etc backends this project might run on.
        area_scores = {}
        for inc in Incident.objects.values("location_label", "severity"):
            w = {"High": 3, "Medium": 2, "Low": 1}.get(inc["severity"], 1)
            area_scores[inc["location_label"]] = area_scores.get(inc["location_label"], 0) + w
        ranked = sorted(area_scores.items(), key=lambda kv: kv[1], reverse=True)[:8]
        max_score = ranked[0][1] if ranked else 1
        top_risk_areas = [
            {"name": name, "score": round((score / max_score) * 100)} for name, score in ranked
        ]

        return Response({
            "by_year_type": by_year_type,
            "by_year_total": by_year_total,
            "this_year_by_type": this_year_by_type,
            "top_risk_areas": top_risk_areas,
        })

def _generate_via_points(source_lat, source_lon, dest_lat, dest_lon, offsets_m=(180, -180, 320, -320)):
    """
    Generates via-points offset perpendicular to the straight line between
    source and destination, at the given distances in meters. Routing
    "through" each of these forces OSRM onto genuinely different streets,
    which is what actually produces distinct route options — see the
    comment in PlanRoutesMultiView for why this is necessary.

    Only used to *request* alternate paths; the returned routes still
    follow real streets end-to-end (OSRM snaps the via-point to the
    nearest road and walks through it), not a straight line through the
    offset point itself.
    """
    mid_lat = (source_lat + dest_lat) / 2
    mid_lon = (source_lon + dest_lon) / 2

    dlat = dest_lat - source_lat
    dlon = dest_lon - source_lon
    length = math.hypot(dlat, dlon) or 1e-9

    # Unit vector perpendicular to the source->destination line
    perp_lat = -dlon / length
    perp_lon = dlat / length

    # Rough meters-per-degree conversion — accurate enough for the small
    # (a few hundred meter) offsets used here.
    meters_per_degree_lat = 111320
    meters_per_degree_lon = 111320 * math.cos(math.radians(mid_lat)) or 1e-9

    via_points = []
    for offset in offsets_m:
        via_lat = mid_lat + perp_lat * (offset / meters_per_degree_lat)
        via_lon = mid_lon + perp_lon * (offset / meters_per_degree_lon)
        via_points.append((via_lat, via_lon))

    return via_points


def routes_are_similar(route_a, route_b, tolerance=0.85):
    """
    Determines whether two route geometries are practically the same.

    We compare each sampled point from route A against the nearest
    sampled point from route B.

    This is more reliable than comparing points by the same index,
    because two routes can have different numbers of coordinates.
    """

    coords_a = route_a.get("geometry", {}).get("coordinates", [])
    coords_b = route_b.get("geometry", {}).get("coordinates", [])

    if not coords_a or not coords_b:
        return True

    # Sample up to 30 points from each route.
    sample_count_a = min(30, len(coords_a))
    sample_count_b = min(30, len(coords_b))

    def sample_coordinates(coords, count):
        if count <= 1:
            return [coords[0]]

        indexes = [
            round(
                i * (len(coords) - 1) / (count - 1)
            )
            for i in range(count)
        ]

        return [coords[i] for i in indexes]

    sampled_a = sample_coordinates(
        coords_a,
        sample_count_a
    )

    sampled_b = sample_coordinates(
        coords_b,
        sample_count_b
    )

    close_count = 0

    # For every point in route A, check whether
    # there is a nearby point in route B.
    for lon_a, lat_a in sampled_a:

        nearest_distance = min(

            _distance_meters(
                lat_a,
                lon_a,
                lat_b,
                lon_b
            )

            for lon_b, lat_b in sampled_b
        )

        # Within 75 meters = practically same road section.
        if nearest_distance <= 75:
            close_count += 1

    similarity = (
        close_count / len(sampled_a)
    )

    return similarity >= tolerance


def _build_fallback_route(source_lat, source_lon, dest_lat, dest_lon, offset_m=0):
    dist_m = _distance_meters(source_lat, source_lon, dest_lat, dest_lon)
    duration_sec = int(dist_m / 1.3)
    n_points = 12
    coords = []
    dlat = dest_lat - source_lat
    dlon = dest_lon - source_lon
    length = math.hypot(dlat, dlon) or 1e-9
    perp_lat = -dlon / length
    perp_lon = dlat / length
    m_per_deg_lat = 111320
    m_per_deg_lon = 111320 * math.cos(math.radians((source_lat + dest_lat) / 2)) or 1e-9

    for i in range(n_points):
        t = i / (n_points - 1)
        arc = math.sin(t * math.pi) * offset_m
        lat = source_lat + t * dlat + perp_lat * (arc / m_per_deg_lat)
        lon = source_lon + t * dlon + perp_lon * (arc / m_per_deg_lon)
        coords.append([round(lon, 6), round(lat, 6)])

    return {
        "distance": dist_m,
        "duration": duration_sec,
        "geometry": {
            "type": "LineString",
            "coordinates": coords,
        },
    }


def _collect_osrm_candidates(source_lat, source_lon, destination_lat, destination_lon):
    coord_str = f"{source_lon},{source_lat};{destination_lon},{destination_lat}"
    osrm_url = f"{settings.OSRM_BASE_URL}/route/v1/foot/{coord_str}"

    all_raw_routes = []

    try:
        response = requests.get(
            osrm_url,
            params={"overview": "full", "geometries": "geojson", "alternatives": "true", "steps": "false"},
            timeout=6,
        )
        if response.status_code == 200:
            routes = response.json().get("routes", [])
            logger.debug("OSRM primary routes: %d", len(routes))
            all_raw_routes.extend(routes)
    except Exception as exc:
        logger.warning("OSRM primary request failed: %s", exc)

    via_points = _generate_via_points(source_lat, source_lon, destination_lat, destination_lon)
    for via_lat, via_lon in via_points:
        via_coord_str = f"{source_lon},{source_lat};{via_lon},{via_lat};{destination_lon},{destination_lat}"
        via_url = f"{settings.OSRM_BASE_URL}/route/v1/foot/{via_coord_str}"
        try:
            via_response = requests.get(
                via_url,
                params={"overview": "full", "geometries": "geojson", "alternatives": "false", "steps": "false"},
                timeout=4,
            )
            if via_response.status_code == 200:
                extra_routes = via_response.json().get("routes", [])
                logger.debug("Via-point route: %d", len(extra_routes))
                all_raw_routes.extend(extra_routes)
        except Exception:
            logger.warning("Via-point OSRM request failed", exc_info=True)

    if not all_raw_routes:
        logger.warning("OSRM demo server unavailable; using fallback route geometries")
        all_raw_routes = [
            _build_fallback_route(source_lat, source_lon, destination_lat, destination_lon, 0),
            _build_fallback_route(source_lat, source_lon, destination_lat, destination_lon, 180),
            _build_fallback_route(source_lat, source_lon, destination_lat, destination_lon, -180),
        ]

    logger.debug("Total raw routes collected: %d", len(all_raw_routes))
    return all_raw_routes


def _score_candidates(raw_routes, hour):
    """Scores each raw OSRM route with the ML model + hotspot data, skipping
    any route whose geometry is missing/degenerate or that fails to score."""
    candidates = []
    for index, route in enumerate(raw_routes):
        geometry = route.get("geometry")
        if not geometry:
            continue
        coordinates = geometry.get("coordinates", [])
        if len(coordinates) < 2:
            continue

        try:
            safety = score_route_geometry(coordinates, hour)
        except Exception:
            logger.warning("Route scoring failed for candidate %d", index, exc_info=True)
            continue

        candidates.append({
            "candidateId": index,
            "geometry": geometry,
            "distanceKm": round(float(route.get("distance", 0)) / 1000, 2),
            "durationMin": round(float(route.get("duration", 0)) / 60, 1),
            "overallSafetyScore": safety["overall_safety_score"],
            "riskiestPoint": safety["riskiest_point"],
            "scoredPoints": safety["points"],
        })

    logger.debug("Scored candidates: %d", len(candidates))
    return candidates


def _dedupe_candidates(candidates):
    """Removes routes that are practically the same physical path — the
    same OSRM request (primary + via-points) can easily return the same
    route more than once."""
    unique_candidates = []
    for candidate in candidates:
        is_duplicate = any(
            routes_are_similar(candidate, existing, tolerance=0.90)
            for existing in unique_candidates
        )
        if not is_duplicate:
            unique_candidates.append(candidate)

    logger.debug("Unique routes: %d", len(unique_candidates))
    return unique_candidates


def _pick_fastest(candidates):
    return min(candidates, key=lambda route: (route["durationMin"], route["distanceKm"]))


def _pick_safest(candidates):
    return max(candidates, key=lambda route: (route["overallSafetyScore"], -route["durationMin"]))


def _pick_balanced(candidates):
    """
    Scores every candidate on a 0-1 blend of safety/time/distance
    (55% / 30% / 15%) and returns the highest-scoring one. Mutates each
    candidate dict in place to attach the intermediate `_balancedScore`
    (the caller strips it back out before returning routes to the client).
    """
    min_time = min(route["durationMin"] for route in candidates)
    max_time = max(route["durationMin"] for route in candidates)
    min_distance = min(route["distanceKm"] for route in candidates)
    max_distance = max(route["distanceKm"] for route in candidates)

    time_range = max(0.1, max_time - min_time)
    distance_range = max(0.01, max_distance - min_distance)

    for route in candidates:
        safety_component = route["overallSafetyScore"] / 100
        time_component = 1 - (route["durationMin"] - min_time) / time_range
        distance_component = 1 - (route["distanceKm"] - min_distance) / distance_range
        route["_balancedScore"] = (
            safety_component * 0.55 + time_component * 0.30 + distance_component * 0.15
        )

    return max(candidates, key=lambda route: route["_balancedScore"])


def _has_nearby_hotspots(candidates):
    """
    calculate_hotspot_risk() already ignores any incident more than 250m
    from a sampled route point, so a hotspot_risk of 0 at every sampled
    point on every candidate means no incident hotspot is anywhere near
    this source/destination pair. In that case every candidate's score
    difference is just ML/geometry noise — "Safest" and "Balanced" would
    be the same (or a slower) physical path relabeled, not a real safety
    trade-off. So when there's nothing nearby to route around, only the
    fastest route should be offered; see _build_final_routes().
    """
    return any(
        point["hotspot_risk"] > 0
        for route in candidates
        for point in route["scoredPoints"]
    )


def _build_final_routes(candidates, hotspots_near_corridor):
    """
    Builds the final Safest/Fastest/Balanced list, in priority order,
    never including the same physical route twice:

      1. Safest   (only offered when a hotspot is nearby to route around)
      2. Fastest  (always offered)
      3. Balanced (only offered when a hotspot is nearby to route around)
    """
    safest = _pick_safest(candidates)
    fastest = _pick_fastest(candidates)
    balanced = _pick_balanced(candidates)

    final_routes = []
    seen_candidate_ids = set()

    def add_route(route, route_id, label):
        if route["candidateId"] in seen_candidate_ids:
            return
        result = dict(route)
        result.pop("_balancedScore", None)
        result["id"] = route_id
        result["label"] = label
        final_routes.append(result)
        seen_candidate_ids.add(route["candidateId"])

    if hotspots_near_corridor:
        add_route(safest, "safest", "Safest Route")

    add_route(fastest, "fastest", "Fastest Route")

    if hotspots_near_corridor:
        add_route(balanced, "balanced", "Balanced Route")

    primary = safest if hotspots_near_corridor else fastest
    return final_routes, primary


class PlanRoutesMultiView(APIView):
    """
    POST /api/routes/plan-multi/

    Returns up to 3 route choices — Safest / Fastest / Balanced — each
    scored using the trained ML model, real community/historical incident
    hotspots, real OSRM distance, and real OSRM walking duration.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # BUG FIX: previously only the OSRM/scoring calls were wrapped in
        # try/except. Any *other* unhandled exception here (a KeyError from
        # an unexpected OSM/ML shape, a DB error saving history, etc.) would
        # propagate out of the view entirely. Django then renders its own
        # bare error response for that, which — unlike a normal DRF
        # Response — doesn't reliably pass back through CorsMiddleware on
        # every deployment. The browser then reports it as a CORS failure
        # ("No 'Access-Control-Allow-Origin' header") instead of the real
        # 500, hiding the actual bug. Wrapping the whole method guarantees
        # we always hand back a proper DRF Response (so CORS headers are
        # always attached) and logs the real traceback server-side.
        try:
            return self._plan(request)
        except Exception:
            logger.exception("Unhandled error in PlanRoutesMultiView")
            return Response(
                {"error": "Something went wrong while planning routes. Please try again."},
                status=500,
            )

    def _plan(self, request):
        source = request.data.get("source")
        destination = request.data.get("destination")

        if not source or not destination:
            return Response({"error": "source and destination are required"}, status=400)

        try:
            source_lat = float(source["lat"])
            source_lon = float(source["lon"])
            destination_lat = float(destination["lat"])
            destination_lon = float(destination["lon"])
        except (KeyError, TypeError, ValueError):
            return Response({"error": "Invalid source or destination coordinates"}, status=400)

        try:
            raw_routes = _collect_osrm_candidates(source_lat, source_lon, destination_lat, destination_lon)
        except requests.RequestException as exc:
            return Response({"error": f"Routing service unavailable: {exc}"}, status=502)

        if not raw_routes:
            return Response({"error": "No route found"}, status=404)

        hour = datetime.now().hour
        candidates = _score_candidates(raw_routes, hour)
        if not candidates:
            return Response({"error": "Unable to score routes"}, status=500)

        candidates = _dedupe_candidates(candidates)
        hotspots_near_corridor = _has_nearby_hotspots(candidates)
        logger.debug("Hotspots near corridor: %s", hotspots_near_corridor)

        final_routes, primary = _build_final_routes(candidates, hotspots_near_corridor)

        logger.debug("Final routes returned: %d", len(final_routes))
        for route in final_routes:
            logger.debug(
                " - %s | %s | %skm | %smin | Safety: %s",
                route["id"], route["label"], route["distanceKm"],
                route["durationMin"], route["overallSafetyScore"],
            )

        # "Safest" is only in final_routes when a hotspot is actually
        # nearby to route around (matching what _build_final_routes()
        # offered the user) — otherwise `primary` falls back to fastest,
        # since that's the route the user was actually shown.
        if request.user.is_authenticated:
            try:
                score = primary["overallSafetyScore"]
                risk = "Low" if score >= 70 else "Medium" if score >= 45 else "High"
                SavedRoute.objects.create(
                    user=request.user,
                    source_label=source.get("label", ""), source_lat=source_lat, source_lon=source_lon,
                    destination_label=destination.get("label", ""),
                    destination_lat=destination_lat, destination_lon=destination_lon,
                    distance_km=primary["distanceKm"], duration_min=primary["durationMin"],
                    overall_safety_score=score, risk_level=risk, geometry=primary["geometry"],
                )
            except Exception as exc:
                logger.warning("Could not save route history for user: %s", exc)


        return Response({
            "source": source,
            "destination": destination,
            "routes": final_routes,
            "hotspots": get_incident_hotspots(),
        })


class HotspotView(APIView):
    """
    GET /api/hotspots/

    Returns real historical and community incident locations
    as map hotspots.
    """

    permission_classes = [
        permissions.AllowAny
    ]

    def get(self, request):

        hotspots = []

        for incident in Incident.objects.all().order_by(
            "-created_at"
        ):

            # Incident model uses lat/lon
            lat = incident.lat
            lon = incident.lon

            if lat is None or lon is None:
                continue

            severity = getattr(
                incident,
                "severity",
                "Medium"
            )

            incident_type = getattr(
                incident,
                "incident_type",
                "Other"
            )

            severity_score = {
                "High": 3,
                "Medium": 2,
                "Low": 1,
            }.get(
                severity,
                1
            )

            hotspots.append({
                "id": incident.id,
                "lat": float(lat),
                "lon": float(lon),
                "type": incident_type,
                "severity": severity,
                "severityScore": severity_score,
                "location": getattr(
                    incident,
                    "location_label",
                    ""
                ),
                "createdAt": incident.created_at,
            })

        return Response({
            "hotspots": hotspots
        })