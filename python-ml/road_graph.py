"""
Graph-based pedestrian router for SafeRoute.

This replaces the old "generate a handful of OSRM candidate routes, then
score each one after the fact" pipeline with the flow the app is actually
supposed to follow:

    ML predicts every road segment
            |
            v
    Road graph gets weighted with that prediction
            |
            v
    Routing algorithm (NetworkX/Dijkstra) searches the graph using
    the ML weights
            |
            v
    Routes are generated (safest / fastest / balanced are three
    different weight functions over the SAME graph, not three
    different post-hoc labels on the same handful of OSRM paths)

Where this maps onto the FCSP-II syllabus:
    Unit 1 (Pandas)         -> reference dataset lookup for segment features
    Unit 2.4 (NetworkX)      -> the street graph + shortest_path search
    Unit 4 (Regression)     -> safety_regressor scores every edge
    Unit 5 (kNN)            -> nearest-neighbour match of an edge to the
                                closest labelled reference segment

Prerequisite: run `python build_road_graph.py` once (needs internet
access to the Overpass API) to download Ahmedabad's walking network and
cache it to ahmedabad_walk_graph.graphml. This module only ever reads
that cached file - it never calls Overpass itself.
"""

import math
import sys
from datetime import datetime
from pathlib import Path

import joblib
import networkx as nx
import osmnx as ox
from sklearn.neighbors import NearestNeighbors

ML_DIR = Path(__file__).resolve().parent
GRAPH_PATH = ML_DIR / "ahmedabad_walk_graph.graphml"

sys.path.append(str(ML_DIR))
from generate_dataset import build_dataset  # noqa: E402

FEATURES = [
    "hour_of_day", "lighting_score", "crime_reports_30d", "foot_traffic",
    "sidewalk_present", "past_accidents_1y", "avg_speed_limit", "cctv_present",
]

AVG_WALK_SPEED_MPS = 1.34  # ~4.8 km/h, used to turn distance into an ETA

# --------------------------------------------------------------------
# Lazily-loaded singletons: the trained regressor, the labelled
# reference segments (for kNN feature lookup), and the raw street
# graph. Loaded once per process, same pattern as core.views.predict_one.
# --------------------------------------------------------------------
_reg_model = None
_reference_df = None
_knn = None
_raw_graph = None
_baseline_score = None

# If the nearest labelled reference segment is further than this from
# a real road-graph edge, treat it as "no coverage here" rather than
# scoring the edge off a match that isn't actually nearby.
MAX_MATCH_DISTANCE_M = 700

# Weighted graphs are cached per time-of-day bucket, since re-scoring
# every edge is the expensive step and "day" vs "night" is the feature
# that actually swings a segment's safety score the most.
_weighted_cache = {}

GRAPH_AVAILABLE = GRAPH_PATH.exists()


def _load_ml():
    global _reg_model, _reference_df, _knn, _baseline_score
    if _reg_model is not None:
        return
    _reg_model = joblib.load(ML_DIR / "safety_regressor.joblib")
    _reference_df = build_dataset()
    _knn = NearestNeighbors(n_neighbors=1).fit(_reference_df[["lat", "lon"]].to_numpy())
    _baseline_score = float(_reference_df["safety_score"].mean())


def _load_raw_graph():
    global _raw_graph
    if _raw_graph is None:
        _raw_graph = ox.load_graphml(GRAPH_PATH)
    return _raw_graph


def _predict_segment_safety(lat, lon, hour_of_day):
    """
    STEP 1 of the desired flow: 'ML predicts every road segment'.

    Match this segment (a road-graph edge) to its nearest labelled
    reference segment with kNN (Unit 5), then score it with the
    trained regression model (Unit 4). Returns a 0-100 safety score.

    If the nearest labelled segment is too far away to be meaningful
    (this edge is somewhere our sample data doesn't really cover),
    falls back to the dataset's overall average instead of borrowing
    a distant, likely-irrelevant match.
    """
    _load_ml()
    dist, idx = _knn.kneighbors([[lat, lon]])

    # Rough degrees->metres conversion, just for this coverage check
    # (not precise, but we only need to know "is this nearby or not").
    match_distance_m = float(dist[0][0]) * 111_320
    if match_distance_m > MAX_MATCH_DISTANCE_M:
        return _baseline_score

    row = _reference_df.iloc[idx[0][0]].copy()
    row["hour_of_day"] = hour_of_day
    X = row[FEATURES].to_frame().T.astype(float)
    score = float(_reg_model.predict(X)[0])
    return max(0.0, min(100.0, score))


def _distance_meters(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _hotspot_penalty(lat, lon, hotspots):
    """Optional: fold real community-reported incidents (already
    collected via the Web Scraping/APIs unit) into the same edge score,
    so a road doesn't just look risky in theory - it also gets pulled
    down if incidents were actually reported nearby."""
    if not hotspots:
        return 0.0
    penalty = 0.0
    for h in hotspots:
        d = _distance_meters(lat, lon, h["lat"], h["lon"])
        if d > 250:
            continue
        factor = 1.0 if d <= 50 else 0.7 if d <= 100 else 0.4 if d <= 175 else 0.2
        penalty += h.get("weight", 1.0) * factor
    return min(45.0, penalty * 5)


def _time_bucket(hour_of_day):
    return "night" if (hour_of_day >= 21 or hour_of_day <= 5) else "day"


def _weight_graph(G, hour_of_day, hotspots):
    """
    STEP 2 of the desired flow: 'Road graph gets weighted'.

    Every edge gets a safety_score from the ML model, then two routing
    costs derived from it:
      - risk_weight:      distance cost inflated up to 5x for unsafe
                           edges. Dijkstra minimising this = SAFEST route.
      - balanced_weight:  distance cost inflated up to 3x. A middle
                           ground between fastest and safest.
    Plain edge `length` (already present from OSMnx) is used unchanged
    for the FASTEST route.
    """
    for u, v, k, data in G.edges(keys=True, data=True):
        length = data.get("length") or 1.0
        mid_lat = (G.nodes[u]["y"] + G.nodes[v]["y"]) / 2
        mid_lon = (G.nodes[u]["x"] + G.nodes[v]["x"]) / 2

        safety = _predict_segment_safety(mid_lat, mid_lon, hour_of_day)
        safety = max(0.0, safety - _hotspot_penalty(mid_lat, mid_lon, hotspots))

        risk = (100 - safety) / 100  # 0 = perfectly safe, 1 = worst case
        data["safety_score"] = round(safety, 1)
        data["risk_weight"] = length * (1 + risk * 4)
        data["balanced_weight"] = length * (1 + risk * 2)
    return G


def get_weighted_graph(hour_of_day, hotspots=None):
    bucket = _time_bucket(hour_of_day)
    if bucket not in _weighted_cache:
        raw = _load_raw_graph()
        G = raw.copy()
        _weighted_cache[bucket] = _weight_graph(G, hour_of_day, hotspots)
    return _weighted_cache[bucket]


def _edge_data_for(G, u, v, weight_key):
    """The parallel edge NetworkX would have picked for this hop under
    `weight_key` (streets can have more than one edge between the same
    two nodes, e.g. a divided road)."""
    parallel = G.get_edge_data(u, v)
    return min(parallel.values(), key=lambda d: d.get(weight_key, d.get("length", 1.0)))


def _path_to_route(G, path, weight_key, route_id, label):
    coords = [[G.nodes[n]["x"], G.nodes[n]["y"]] for n in path]  # GeoJSON = [lon, lat]

    edges = [_edge_data_for(G, u, v, weight_key) for u, v in zip(path[:-1], path[1:])]
    length_m = sum(e.get("length") or 0.0 for e in edges)
    scores = [e["safety_score"] for e in edges if "safety_score" in e]
    overall = round(sum(scores) / len(scores), 1) if scores else 70.0
    worst = min(scores) if scores else overall

    return {
        "id": route_id,
        "label": label,
        "candidateId": tuple(path),
        "geometry": {"type": "LineString", "coordinates": coords},
        "distanceKm": round(length_m / 1000, 2),
        "durationMin": round((length_m / AVG_WALK_SPEED_MPS) / 60, 1),
        "overallSafetyScore": overall,
        "riskiestSegmentScore": round(worst, 1),
    }


def find_routes(source_lat, source_lon, dest_lat, dest_lon, hour_of_day=None, hotspots=None):
    """
    STEP 3 of the desired flow: 'Routing algorithm searches using ML
    weights' -> STEP 4: 'Routes are generated'.

    Runs Dijkstra (via networkx.shortest_path) three times over the
    SAME safety-weighted graph, once per weight function, and returns
    whichever of the resulting paths are actually distinct.
    """
    if hour_of_day is None:
        hour_of_day = datetime.now().hour

    G = get_weighted_graph(hour_of_day, hotspots)

    orig = ox.distance.nearest_nodes(G, source_lon, source_lat)
    dest = ox.distance.nearest_nodes(G, dest_lon, dest_lat)

    fastest_path = nx.shortest_path(G, orig, dest, weight="length")
    safest_path = nx.shortest_path(G, orig, dest, weight="risk_weight")
    balanced_path = nx.shortest_path(G, orig, dest, weight="balanced_weight")

    fastest = _path_to_route(G, fastest_path, "length", "fastest", "Fastest Route")
    safest = _path_to_route(G, safest_path, "risk_weight", "safest", "Safest Route")
    balanced = _path_to_route(G, balanced_path, "balanced_weight", "balanced", "Balanced Route")

    routes = [fastest]
    if safest_path != fastest_path:
        routes.append(safest)
    if balanced_path != fastest_path and balanced_path != safest_path:
        routes.append(balanced)

    return routes
