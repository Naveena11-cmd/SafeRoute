"""
SafeRoute — synthetic road-segment incident dataset generator.

In a real deployment this would be replaced by ingested open data:
city crime APIs, streetlight registries, OSM sidewalk tags, accident
records (this is the "Web Scraping, APIs & Data Ingestion" step of the
pipeline). For a self-contained demo we simulate a realistic dataset
of road segments around a sample city bounding box so the rest of the
pipeline (EDA -> model training -> API) can run end to end offline.
"""

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

# Bounding box covering greater Ahmedabad (old city, SG Highway, Bopal,
# Naroda, the airport, etc.) — matches the extent build_road_graph.py
# actually downloads, so kNN matches in road_graph.py find a genuinely
# nearby reference segment almost everywhere on the real street graph
# instead of only near the old city center.
LAT_MIN, LAT_MAX = 22.9400, 23.1400
LON_MIN, LON_MAX = 72.4400, 72.7000

N_SEGMENTS = 12000


def generate_raw_features(n=N_SEGMENTS) -> pd.DataFrame:
    lat = RNG.uniform(LAT_MIN, LAT_MAX, n)
    lon = RNG.uniform(LON_MIN, LON_MAX, n)

    hour_of_day = RNG.integers(0, 24, n)
    lighting_score = RNG.uniform(0, 10, n)          # 0 = pitch dark, 10 = well lit
    crime_reports_30d = RNG.poisson(2.2, n)          # incidents reported nearby, last 30 days
    foot_traffic = RNG.uniform(0, 10, n)              # 0 = deserted, 10 = very busy
    sidewalk_present = RNG.integers(0, 2, n)          # 0/1
    past_accidents_1y = RNG.poisson(1.1, n)
    avg_speed_limit = RNG.choice([20, 30, 40, 50, 60, 80], n,
                                  p=[0.12, 0.28, 0.25, 0.18, 0.12, 0.05])
    cctv_present = RNG.integers(0, 2, n)

    df = pd.DataFrame({
        "segment_id": [f"SEG{100000+i}" for i in range(n)],
        "lat": lat,
        "lon": lon,
        "hour_of_day": hour_of_day,
        "lighting_score": lighting_score,
        "crime_reports_30d": crime_reports_30d,
        "foot_traffic": foot_traffic,
        "sidewalk_present": sidewalk_present,
        "past_accidents_1y": past_accidents_1y,
        "avg_speed_limit": avg_speed_limit,
        "cctv_present": cctv_present,
    })
    return df


def compute_ground_truth(df: pd.DataFrame) -> pd.DataFrame:
    """
    Derive a synthetic-but-plausible 'true' safety score (0-100, higher = safer)
    from the raw features with a hand-tuned weighted formula + noise. The ML
    models later LEARN this relationship from the raw features alone (as if
    the score were only observed for a labeled subset), rather than having
    the formula hard-coded — that's the point of training a model on it.
    """
    night_penalty = np.where((df.hour_of_day >= 21) | (df.hour_of_day <= 5), 12, 0)

    score = (
        50
        + df.lighting_score * 3.0
        + df.foot_traffic * 2.2
        + df.sidewalk_present * 6
        + df.cctv_present * 5
        - df.crime_reports_30d * 4.5
        - df.past_accidents_1y * 5.5
        - (df.avg_speed_limit / 10) * 2.0
        - night_penalty
        + RNG.normal(0, 5, len(df))
    )
    df["safety_score"] = score.clip(0, 100).round(1)

    def to_level(s):
        if s >= 70:
            return "Low"
        if s >= 45:
            return "Medium"
        return "High"

    df["risk_level"] = df["safety_score"].apply(to_level)
    return df


def build_dataset() -> pd.DataFrame:
    df = generate_raw_features()
    df = compute_ground_truth(df)
    return df


if __name__ == "__main__":
    dataset = build_dataset()
    dataset.to_csv("road_segments.csv", index=False)
    print(f"Generated {len(dataset)} road segments -> road_segments.csv")
    print(dataset.head())
