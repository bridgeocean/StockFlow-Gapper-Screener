# scripts/score_today_from_csv.py
import argparse, json, sys
from pathlib import Path
import pandas as pd
import joblib

SYN = {
  "gap_pct": {"gap_pct", "gappct", "gappctpoly", "gap_pctpoly", "gap_percent"},
  "rvol": {"rvol", "relvol", "relvolpoly", "rel_vol", "volume_ratio"},
  "rsi14m": {"rsi14m", "rsi_14m", "rsi_14", "rsi"},
  "date": {"date", "day"},
  "ticker": {"ticker", "symbol"},
}

def pick(colset, keys):
    for k in colset:
        if k in keys: return k
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="training_polygon_v1.csv")
    ap.add_argument("--model", default="models/ai_score.joblib")
    ap.add_argument("--out_json", default="data/today_scores.json")
    ap.add_argument("--top", type=int, default=50)
    args = ap.parse_args()

    mpath = Path(args.model)
    if not mpath.exists():
        print("No model found; skipping scoring.")
        return 0

    df = pd.read_csv(args.csv)
    if df.empty:
        print("No rows in today's features CSV; skipping scoring.")
        return 0

    df.columns = [c.strip().lower() for c in df.columns]
    cols = set(df.columns)

    c_gap = pick(cols, SYN["gap_pct"])
    c_rvol = pick(cols, SYN["rvol"])
    c_rsi  = pick(cols, SYN["rsi14m"])
    c_date = pick(cols, SYN["date"])
    c_tic  = pick(cols, SYN["ticker"])

    req = [c_gap, c_rvol, c_rsi]
    if not all(req):
        print("Missing required columns to score. Got:", df.columns.tolist()); return 0

    model = joblib.load(mpath)

    X = df[[c_gap, c_rvol, c_rsi]].copy()
    for c in [c_gap, c_rvol, c_rsi]:
        X[c] = pd.to_numeric(X[c], errors="coerce")
    X = X.dropna()
    prob = model.predict_proba(X)[:,1] if hasattr(model, "predict_proba") else model.decision_function(X)

    out = df.loc[X.index, [c for c in [c_date, c_tic, c_gap, c_rvol, c_rsi] if c]].copy()
    out["ai_score"] = prob

    # Present nicely
    rename = {}
    if c_date: rename[c_date] = "Date"
    if c_tic:  rename[c_tic]  = "Ticker"
    rename.update({c_gap:"gap_pct", c_rvol:"rvol", c_rsi:"rsi14m"})
    out = out.rename(columns=rename)

    out = out.sort_values("ai_score", ascending=False).head(args.top)
    out["ai_score"] = (out["ai_score"] * 100).round(2)
    for c in ["gap_pct", "rvol", "rsi14m"]:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce").round(3)

    Path("data").mkdir(parents=True, exist_ok=True)
    Path(args.out_json).write_text(json.dumps(out.to_dict(orient="records"), indent=2))
    print(f"Wrote {len(out)} rows → {args.out_json}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
