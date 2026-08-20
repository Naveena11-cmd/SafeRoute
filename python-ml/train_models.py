"""
SafeRoute — model training
(covers: Introduction to Machine Learning, Regression - Model Training and
Evaluation, Classification - Model Training and Evaluation)

Trains two models on the road-segment dataset:
  1. Regression  -> predicts a continuous safety_score (0-100)
  2. Classification -> predicts a risk_level bucket (Low / Medium / High)

Both are served later by the Django backend (django-backend/core/views.py,
loaded via joblib directly — no separate ML server process) so the
backend can request a live safety score for any lat/lon segment along
a route instead of relying on the hard-coded generator formula.

For each task we train a few candidate models, evaluate them properly
(cross-validation, not just one lucky/unlucky train-test split), and
actually keep whichever one wins — earlier versions of this script
printed a comparison but always saved the Random Forest regardless of
the numbers, which meant a worse model could end up in production.
"""

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score, classification_report, mean_absolute_error,
    recall_score, r2_score,
)
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

from generate_dataset import build_dataset

FEATURES = [
    "hour_of_day", "lighting_score", "crime_reports_30d", "foot_traffic",
    "sidewalk_present", "past_accidents_1y", "avg_speed_limit", "cctv_present",
]


def prepare_data(df: pd.DataFrame):
    X = df[FEATURES]
    y_reg = df["safety_score"]
    y_clf = df["risk_level"]

    X_train, X_test, y_reg_train, y_reg_test, y_clf_train, y_clf_test = train_test_split(
        X, y_reg, y_clf, test_size=0.2, random_state=42
    )
    return X_train, X_test, y_reg_train, y_reg_test, y_clf_train, y_clf_test


def train_regression(X_train, X_test, y_train, y_test, scaler):
    """
    Trains three regression candidates (Unit 4: Simple/Multiple Linear,
    Polynomial, plus a Random Forest for comparison), scores each with
    5-fold cross-validation on the training set (Unit 3.3: basic
    cross-validation) so the comparison isn't just one train/test split,
    then reports MAE and R2 on the held-out test set and keeps whichever
    model actually performs best there.
    """
    print("\n--- Regression: safety_score ---")

    candidates = {
        "LinearRegression": make_pipeline(StandardScaler(), LinearRegression()),
        "PolynomialRegression(deg=2)": make_pipeline(
            StandardScaler(), PolynomialFeatures(degree=2, include_bias=False), LinearRegression()
        ),
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=200, max_depth=8, random_state=42
        ),
    }

    results = {}

    for name, model in candidates.items():
        cv_mae = -cross_val_score(
            model, X_train, y_train, cv=5, scoring="neg_mean_absolute_error"
        ).mean()

        model.fit(X_train, y_train)
        pred = model.predict(X_test)
        test_mae = mean_absolute_error(y_test, pred)
        test_r2 = r2_score(y_test, pred)

        results[name] = {"model": model, "test_mae": test_mae, "test_r2": test_r2}
        print(f"{name:<28} 5-fold CV MAE={cv_mae:.2f}  |  Test MAE={test_mae:.2f}  Test R2={test_r2:.3f}")

    winner_name = min(results, key=lambda n: results[n]["test_mae"])
    print(f"-> Keeping {winner_name} (lowest test MAE)")

    rf = candidates["RandomForestRegressor"]
    if hasattr(rf, "feature_importances_"):
        importances = pd.Series(rf.feature_importances_, index=FEATURES).sort_values(ascending=False)
        print("RandomForest feature importances (for reference):\n", importances.round(3))

    return results[winner_name]["model"]


def train_classification(X_train, X_test, y_train, y_test, scaler):
    """
    Trains Logistic Regression and Random Forest, both with
    class_weight="balanced" since risk_level is imbalanced (many more
    Medium-risk segments than Low-risk ones in the training data) —
    without it, the models learn to under-predict "Low risk" simply
    because it's the rarest class.   Picks the winner by macro-average
    recall rather than plain accuracy, since accuracy alone can look
    fine while still missing most of the minority (Low-risk) class.
    """
    print("\n--- Classification: risk_level ---")

    candidates = {
        "LogisticRegression": make_pipeline(
            StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced")
        ),
        "RandomForestClassifier": RandomForestClassifier(
            n_estimators=200, max_depth=8, random_state=42, class_weight="balanced"
        ),
    }

    results = {}

    for name, model in candidates.items():
        model.fit(X_train, y_train)
        pred = model.predict(X_test)
        acc = accuracy_score(y_test, pred)
        macro_recall = recall_score(y_test, pred, average="macro")

        results[name] = {"model": model, "accuracy": acc, "macro_recall": macro_recall}
        print(f"{name:<24} accuracy={acc:.3f}  macro-avg recall={macro_recall:.3f}")
        print(classification_report(y_test, pred))

    winner_name = max(results, key=lambda n: results[n]["macro_recall"])
    print(f"-> Keeping {winner_name} (best macro-avg recall, i.e. fairest across Low/Medium/High)")

    return results[winner_name]["model"]


def main():
    df = build_dataset()
    X_train, X_test, y_reg_train, y_reg_test, y_clf_train, y_clf_test = prepare_data(df)

    scaler = StandardScaler().fit(X_train)

    reg_model = train_regression(X_train, X_test, y_reg_train, y_reg_test, scaler)
    clf_model = train_classification(X_train, X_test, y_clf_train, y_clf_test, scaler)

    joblib.dump(reg_model, "safety_regressor.joblib")
    joblib.dump(clf_model, "risk_classifier.joblib")
    joblib.dump(scaler, "scaler.joblib")
    print("\nSaved safety_regressor.joblib, risk_classifier.joblib, scaler.joblib")


if __name__ == "__main__":
    main()
