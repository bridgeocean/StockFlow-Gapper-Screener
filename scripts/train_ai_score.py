# scripts/train_ai_score.py
import json, sys
from pathlib import Path
import pandas as pd
import numpy as np

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score

TRAIN_PATH_PRIMARY = Path("training_all.csv")
MONTH_DIR = Path("training")

# Column synonyms (everything will be lowercased first)
SYN = {
    "gap_pct": {"gap_pct", "gappct", "gappctpoly", "gap_pctpoly", "gap_percent"},
    "rvol": {"rvol", "relvol", "relvolpoly", "rel_vol", "volume_ratio"},
    "rsi14m": {"rsi14m", "rsi_14m", "rsi_14", "rsi"},
    "change_open_pct": {
        "change_open_pct", "changeopenpct",
        "perf_10m_pct", "open_to_10m_pct", "open_to_15m_pct",
        "perf10m_pct", "perf15m_pct"
    },
    "date": {"date", "day"},
    "ticker": {"ticker", "symbol"},
}

def pick(colset, name):
    keys = SYN[name]
    for k in colset:
        if k in keys: return k
    return None

def load_training_df():
    if TRAIN_PATH_PRIMARY.exists():
        df = pd.read_csv(TRAIN_PATH_PRIMARY)
        print(f"Loaded training_all.csv: {df.shape}")
        return df

    # Fallback: stitch any month files if training_all.csv missing
    month_files = sorted(MONTH_DIR.glob("training_*.csv"))
    if not month_files:
        print("No training data found (training_all.csv or training/*.csv).")
        sys.exit(0)

    dfs = [pd.read_csv(f) for f in month_files]
    df = pd.concat(dfs, ignore_index=True)
    print(f"Stitched {len(month_files)} month files → {df.shape}")
    return df

def main():
    df = load_training_df()
    if df.empty:
        print("Empty training set.")
        sys.exit(0)

    # normalize headers
    df.columns = [c.strip().lower() for c in df.columns]

    # map synonyms
    cols = set(df.columns)
    c_gap = pick(cols, "gap_pct")
    c_rvol = pick(cols, "rvol")
    c_rsi  = pick(cols, "rsi14m")
    c_y    = pick(cols, "change_open_pct")
    c_date = pick(cols, "date")
    c_tic  = pick(cols, "ticker")

    needed = [c_gap, c_rvol, c_rsi]
    if not all(needed):
        print("Missing required feature columns. Got:", df.columns.tolist())
        sys.exit(1)

    if c_y is None:
        print("No label column (e.g., change_open_pct/perf_10m_pct). Cannot train supervised model.")
        sys.exit(0)

    use_cols = [c for c in [c_date, c_tic, c_gap, c_rvol, c_rsi, c_y] if c]
    df = df[use_cols].copy()

    # Clean types
    for c in [c_gap, c_rvol, c_rsi, c_y]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Basic sanity clips (avoid crazy outliers)
    df[c_gap] = df[c_gap].clip(-40, 40)
    df[c_rvol] = df[c_rvol].clip(0, 15)
    df[c_rsi] = df[c_rsi].clip(0, 100)

    df = df.dropna(subset=[c_gap, c_rvol, c_rsi, c_y]).reset_index(drop=True)
    if df.empty:
        print("All rows dropped after NA filtering.")
        sys.exit(0)

    # Time-based split (train on older 80%, test on newest 20%)
    if c_date and pd.api.types.is_string_dtype(df[c_date]):
        try: df[c_date] = pd.to_datetime(df[c_date])
        except: pass
        df = df.sort_values(c_date).reset_index(drop=True)
    n = len(df)
    cut = int(n * 0.8)

    X_cols = [c_gap, c_rvol, c_rsi]
    X_train, y_train = df.loc[:cut-1, X_cols], (df.loc[:cut-1, c_y] > 0.0).astype(int)
    X_test,  y_test  = df.loc[cut:, X_cols],    (df.loc[cut:,  c_y] > 0.0).astype(int)

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=200, n_jobs=None))
    ])
    pipe.fit(X_train, y_train)

    # Metrics
    def safe_scores(y_true, prob):
        try:
            return {
                "roc_auc": float(roc_auc_score(y_true, prob)),
                "pr_auc": float(average_precision_score(y_true, prob))
            }
        except Exception:
            return {"roc_auc": None, "pr_auc": None}

    try:
        p_train = pipe.predict_proba(X_train)[:,1]
        p_test  = pipe.predict_proba(X_test)[:,1]
    except Exception:
        # For models without predict_proba
        p_train = pipe.decision_function(X_train)
        p_test  = pipe.decision_function(X_test)

    metrics = {
        "n_rows": int(n),
        "train": safe_scores(y_train, p_train),
        "test":  safe_scores(y_test,  p_test),
        "features": X_cols,
        "label_column": c_y,
        "positive_def": "change_open_pct > 0.0",
    }

    # Save
    import joblib
    joblib.dump(pipe, "ai_score.joblib")
    Path("metrics.json").write_text(json.dumps(metrics, indent=2))
    print("Saved model → ai_score.joblib")
    print("Saved metrics → metrics.json")
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    main()
