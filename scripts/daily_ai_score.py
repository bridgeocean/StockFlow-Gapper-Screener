# scripts/daily_ai_score.py
# Purpose: load ai_score.joblib, score today's screener candidates,
#          and write public/today_scores.json for the dashboard.

import json
from pathlib import Path
import sys
import pandas as pd
import numpy as np

try:
    import joblib
except Exception as e:
    print("joblib missing. pip install joblib")
    raise

MODEL_PATH = Path("ai_score.joblib")
OUTPUT_PATH = Path("public/today_scores.json")

# Where to look for your daily screener CSV (Finviz/Polygon pre-filtered).
# The FIRST one found will be used.
CANDIDATE_SOURCES = [
    Path("latest_screener.csv"),
    Path("public/latest_screener.csv"),
    Path("data/latest_screener.csv"),
    Path("public/today_candidates.csv"),
]

# Column synonyms (case-insensitive)
SYN = {
    "ticker": {"ticker", "symbol"},
    "gap_pct": {"gap_pct", "gappct", "gappctpoly", "gap_pctpoly", "gap_percent"},
    "rvol": {"rvol", "relvol", "relvolpoly", "rel_vol", "volume_ratio"},
    "rsi14m": {"rsi14m", "rsi_14m", "rsi_14", "rsi"},
    "price": {"price", "last", "close", "last_price"},
}

def pick(colset, name):
    want = SYN[name]
    for c in colset:
        if c.lower() in want:
            return c
    return None

def find_candidates_csv() -> Path:
    for p in CANDIDATE_SOURCES:
        if p.exists():
            return p
    return None

def main():
    if not MODEL_PATH.exists():
        print("❌ ai_score.joblib not found. Run the Train Model workflow first.")
        sys.exit(1)

    src = find_candidates_csv()
    if src is None:
        print("❌ No candidate CSV found. Expected one of:")
        for p in CANDIDATE_SOURCES:
            print(f"   - {p}")
        print("Create one (from your Finviz/Polygon screener) and re-run.")
        sys.exit(1)

    print(f"📥 Loading candidates from: {src}")
    df = pd.read_csv(src)
    if df.empty:
        print("❌ Candidate CSV is empty.")
        sys.exit(1)

    # Normalize columns (keep original names around)
    orig_cols = df.columns.tolist()
    lower_map = {c: c.strip().lower() for c in orig_cols}
    df.columns = [lower_map[c] for c in orig_cols]
    cols = set(df.columns)

    # Pick columns
    c_tic  = pick(cols, "ticker")
    c_gap  = pick(cols, "gap_pct")
    c_rvol = pick(cols, "rvol")
    c_rsi  = pick(cols, "rsi14m")
    c_px   = pick(cols, "price")

    needed = [c_tic, c_gap, c_rvol, c_rsi]
    if not all(needed):
        print("❌ Missing columns. Need at least: ticker, gap_pct, rvol, rsi14m")
        print("   Columns present:", sorted(df.columns.tolist()))
        sys.exit(1)

    # Keep minimal set
    keep = [c for c in [c_tic, c_px, c_gap, c_rvol, c_rsi] if c]
    df = df[keep].copy()

    # Coerce numerics
    for c in [c_gap, c_rvol, c_rsi, c_px]:
        if c and c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    # Basic clips
    df[c_gap] = df[c_gap].clip(-40, 40)
    df[c_rvol] = df[c_rvol].clip(lower=0, upper=15)
    df[c_rsi] = df[c_rsi].clip(0, 100)

    # Drop rows missing required features
    df = df.dropna(subset=[c_gap, c_rvol, c_rsi])

    if df.empty:
        print("❌ No valid rows after cleaning.")
        sys.exit(1)

    # Load model and score
    print("🧠 Loading model:", MODEL_PATH)
    model = joblib.load(MODEL_PATH)

    X = df[[c_gap, c_rvol, c_rsi]].values
    try:
        proba = model.predict_proba(X)[:, 1]
    except Exception:
        proba = model.decision_function(X)
        # Scale to 0..1 with a simple sigmoid for display
        proba = 1 / (1 + np.exp(-proba))

    df["ai_score"] = np.round(proba, 4)

    # Order by score desc
    df = df.sort_values("ai_score", ascending=False).reset_index(drop=True)

    # Prepare output with nice keys the UI expects
    out = []
    for _, r in df.iterrows():
        out.append({
            "ticker": r[c_tic],
            "price": (float(r[c_px]) if c_px and not pd.isna(r[c_px]) else None),
            "gap_pct": float(r[c_gap]),
            "rvol": float(r[c_rvol]),
            "rsi14m": float(r[c_rsi]),
            "ai_score": float(r["ai_score"]),
        })

    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"✅ Wrote {len(out)} rows → {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
