# scripts/train_ai_score.py
import json
import sys
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.ensemble import GradientBoostingRegressor
import joblib

CSV_PATH = Path("training_polygon_v1.csv")
if not CSV_PATH.exists():
    print("ERROR: training_polygon_v1.csv not found")
    sys.exit(1)

df = pd.read_csv(CSV_PATH)

# Harmonize column names if the fetcher produced Poly/camel-case names.
rename_map = {
    "Date": "date",
    "Ticker": "ticker",
    "GapPctPoly": "gap_pct",
    "RSI14m": "rsi14m",
    "RelVolPoly": "rvol",
    # sometimes the label might have been written as ChangeOpenPct
    "ChangeOpenPct": "change_open_pct",
}
df = df.rename(columns=rename_map)

required = ["gap_pct", "rsi14m", "rvol", "change_open_pct"]
missing = [c for c in required if c not in df.columns]
if missing:
    print(f"ERROR: CSV is missing required columns: {missing}")
    print("Make sure scripts/make_training_from_polygon.py wrote: "
          "date,ticker,gap_pct,rsi14m,rvol,change_open_pct")
    sys.exit(1)

# Clean
df = df.dropna(subset=required)
# clip extreme outliers a bit to stabilize training
df["gap_pct"] = df["gap_pct"].clip(-30, 30)
df["rsi14m"] = df["rsi14m"].clip(0, 100)
df["rvol"]   = df["rvol"].clip(0, 15)
df["change_open_pct"] = df["change_open_pct"].clip(-20, 20)

X = df[["gap_pct", "rsi14m", "rvol"]].values
y = df["change_open_pct"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.25, random_state=42
)

model = GradientBoostingRegressor(
    n_estimators=400,
    learning_rate=0.03,
    max_depth=3,
    random_state=42,
    subsample=0.8
)
model.fit(X_train, y_train)

pred = model.predict(X_test)
mae = float(mean_absolute_error(y_test, pred))
r2  = float(r2_score(y_test, pred))

print(f"Eval — MAE: {mae:.4f} | R2: {r2:.4f} | N_test: {len(y_test)}")

# Save model at repo root; workflow will move/commit it.
OUT = Path("ai_score_v1.pkl")
joblib.dump({
    "model": model,
    "features": ["gap_pct", "rsi14m", "rvol"],
    "label": "change_open_pct",
    "meta": {
        "mae": mae,
        "r2": r2,
        "n_rows": int(len(df)),
    }
}, OUT)

print(f"MODEL_SAVED: {OUT}")
