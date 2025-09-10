# scripts/daily_ai_score.py
import json
from pathlib import Path
import pandas as pd
import joblib

MODEL_PATH = Path("ai_score.joblib")
OUTPUT_PATH = Path("public/today_scores.json")

def main():
    if not MODEL_PATH.exists():
        raise FileNotFoundError("Model not found. Run train_ai_score.py first.")

    model = joblib.load(MODEL_PATH)

    # TODO: Replace with your actual screener feed (Finviz/Polygon/etc.)
    df = pd.read_csv("latest_screener.csv")

    # Minimal features — adjust to match train_ai_score
    features = ["gap_pct", "rvol", "rsi14m"]
    X = df[features]

    probs = model.predict_proba(X)[:,1]
    df["ai_score"] = probs.round(3)

    # Output only relevant fields
    out = df[["ticker", "gap_pct", "rvol", "rsi14m", "ai_score"]].to_dict(orient="records")

    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"✅ Wrote {len(out)} scores to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
