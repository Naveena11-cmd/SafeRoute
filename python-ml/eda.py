"""
SafeRoute — Exploratory Data Analysis
(covers: Data Analysis with Pandas & EDA, Data Visualization with Python)

Run after generate_dataset.py. Produces summary stats and a handful of
plots that would inform feature selection for the models in train_models.py.
"""

import matplotlib
matplotlib.use("Agg")  # headless rendering

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from generate_dataset import build_dataset


def run_eda(df: pd.DataFrame, out_dir: str = "."):
    print("=== shape ===")
    print(df.shape)

    print("\n=== dtypes ===")
    print(df.dtypes)

    print("\n=== summary statistics ===")
    print(df.describe())

    print("\n=== missing values ===")
    print(df.isna().sum())

    print("\n=== risk_level distribution ===")
    print(df["risk_level"].value_counts(normalize=True).round(3))

    numeric_cols = [
        "lighting_score", "crime_reports_30d", "foot_traffic",
        "sidewalk_present", "past_accidents_1y", "avg_speed_limit",
        "cctv_present", "safety_score",
    ]

    # 1. Correlation heatmap — which features actually move the safety score
    fig, ax = plt.subplots(figsize=(8, 6))
    corr = df[numeric_cols].corr()
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="RdYlGn", center=0, ax=ax)
    ax.set_title("Feature correlation with safety_score")
    fig.tight_layout()
    fig.savefig(f"{out_dir}/correlation_heatmap.png", dpi=140)
    plt.close(fig)

    # 2. Distribution of safety scores
    fig, ax = plt.subplots(figsize=(7, 4))
    sns.histplot(df["safety_score"], bins=30, kde=True, color="#2F6F4F", ax=ax)
    ax.set_title("Distribution of safety_score across segments")
    fig.tight_layout()
    fig.savefig(f"{out_dir}/safety_score_distribution.png", dpi=140)
    plt.close(fig)

    # 3. Risk level counts
    fig, ax = plt.subplots(figsize=(6, 4))
    order = ["Low", "Medium", "High"]
    sns.countplot(data=df, x="risk_level", hue="risk_level", order=order,
                   palette=["#2F6F4F", "#D98E2C", "#C0503E"], legend=False, ax=ax)
    ax.set_title("Segment counts by risk level")
    fig.tight_layout()
    fig.savefig(f"{out_dir}/risk_level_counts.png", dpi=140)
    plt.close(fig)

    # 4. Safety score vs lighting, colored by hour-of-day bucket
    fig, ax = plt.subplots(figsize=(7, 5))
    df["is_night"] = ((df.hour_of_day >= 21) | (df.hour_of_day <= 5))
    sns.scatterplot(
        data=df, x="lighting_score", y="safety_score",
        hue="is_night", alpha=0.4, palette={True: "#2C5F8A", False: "#D98E2C"}, ax=ax
    )
    ax.set_title("Lighting vs safety score (night vs day)")
    fig.tight_layout()
    fig.savefig(f"{out_dir}/lighting_vs_safety.png", dpi=140)
    plt.close(fig)

    print(f"\nSaved 4 plots to {out_dir}/")


if __name__ == "__main__":
    df = build_dataset()
    run_eda(df)
