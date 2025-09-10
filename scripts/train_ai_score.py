# scripts/train_ai_score.py
import json, sys, glob
from pathlib import Path
import pandas as pd
import numpy as np

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score
import joblib

TRAIN_PATH = Path("training_all.csv")
MONTH_DIR  = Path("training")

# Column synonyms (everything lowercased)
SYN = {
    "gap_pct": {"gap_pct","gappct","gappctpoly","gap_pctpoly","gap_percent"},
    "rvol": {"rvol","relvol","relvolpoly","rel_vol","volume_ratio"},
    "rsi14m": {"rsi14m","rsi_14m","rsi_14","rsi"},
    "change_open_pct": {
        "change_open_pct","changeopenpct","changeopen","change_o",
        "perf_10m_pct","open_to_10m_pct","perf10m_pct",
        "open_to_15m_pct","perf15m_pct"
    },
    "date": {"date","day"},
    "ticker": {"ticker","symbol"},
}

def pick(cols, key):
    want = SYN[key]
    for c in cols:
        if c in want:
            return c
    return None

def _valid_df(df):
    if df is None or df.empty:
        return False
    if df.shape[1] == 1:
        # A single column is a tell-tale sign of a broken "stitched" file
        return False
    cols = set(df.columns)
    need_any = pick(cols,"gap_pct") and pick(cols,"rvol") and pick(cols,"rsi14m")
    y_ok    = pick(cols,"change_open_pct") is not None
    return bool(need_any and y_ok)

def _read_csv_lower(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    return df

def load_training_df():
    # 1) Try training_all.csv first
    df = None
    if TRAIN_PATH.exists():
        try:
            df = _read_csv_lower(TRAIN_PATH)
            print("Loaded training_all.csv:", df.shape)
        except Exception as e:
            print("Failed to read training_all.csv:", e)

    if not _valid_df(df):
        print("training_all.csv invalid or missing features; falling back to stitches from training/*.csv")
        files = sorted(glob.glob(str(MONTH_DIR / "training_*.csv")))
        if not files:
            print("No monthly files found in training/*.csv. Cannot train.")
            sys.exit(1)

        dfs = []
        for f in files:
            try:
                d = _read_csv_lower(f)
                dfs.append(d)
            except Exception as e:
                print(f"Skip unreadable {f}: {e}")
        if not dfs:
            print("No readable monthly CSVs. Cannot train.")
            sys.exit(1)

        df = pd.concat(dfs, ignore_index=True)
        print("Stitched in-memory from monthlies:", df.shape)

    return df

def main():
    df = load_training_df()
    if df is None or df.empty:
        print("Empty training set.")
        sys.exit(1)

    cols = set(df.columns)
    c_gap = pick(cols,"gap_pct")
    c_rvol= pick(cols,"rvol")
    c_rsi = pick(cols,"rsi14m")
    c_y   = pick(cols,"change_open_pct")
    c_date= pick(cols,"date")
    c_tic = pick(cols,"ticker")

    if not all([c_gap, c_rvol, c_rsi, c_y]):
        print("Missing required feature/label columns. Columns were:", list(df.columns))
        sys.exit(1)

    use_cols = [c for c in [c_date,c_tic,c_gap,c_rvol,c_rsi,c_y] if c]
    df = df[use_cols].copy()

    # coerce numerics
    for c in [c_gap,c_rvol,c_rsi,c_y]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # sanity limits
    df[c_gap] = df[c_gap].clip(-40, 40)
    df[c_rvol]= df[c_rvol].clip(0, 15)
    df[c_rsi] = df[c_rsi].clip(0, 100)

    df = df.dropna(subset=[c_gap,c_rvol,c_rsi,c_y]).reset_index(drop=True)
    if df.empty:
        print("All rows dropped after NA filtering.")
        sys.exit(1)

    # time-based split if date exists
    if c_date and pd.api.types.is_string_dtype(df[c_date]):
        try:
            df[c_date] = pd.to_datetime(df[c_date])
            df = df.sort_values(c_date).reset_index(drop=True)
        except Exception:
            pass

    n = len(df)
    cut = int(n*0.8)
    X_cols = [c_gap,c_rvol,c_rsi]
    X_train, y_train = df.loc[:cut-1, X_cols], (df.loc[:cut-1, c_y] > 0.0).astype(int)
    X_test,  y_test  = df.loc[cut:,   X_cols], (df.loc[cut:,   c_y] > 0.0).astype(int)

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=200))
    ])
    pipe.fit(X_train, y_train)

    def safe_scores(y, p):
        try:
            return {
                "roc_auc": float(roc_auc_score(y, p)),
                "pr_auc":  float(average_precision_score(y, p)),
            }
        except Exception:
            return {"roc_auc": None, "pr_auc": None}

    try:
        p_train = pipe.predict_proba(X_train)[:,1]
        p_test  = pipe.predict_proba(X_test)[:,1]
    except Exception:
        p_train = pipe.decision_function(X_train)
        p_test  = pipe.decision_function(X_test)

    metrics = {
        "n_rows": int(n),
        "features": X_cols,
        "label_column": c_y,
        "positive_def": "change_open_pct > 0.0",
        "train": safe_scores(y_train, p_train),
        "test":  safe_scores(y_test,  p_test),
    }

    joblib.dump(pipe, "ai_score.joblib")
    Path("metrics.json").write_text(json.dumps(metrics, indent=2))
    print("Saved model → ai_score.joblib")
    print("Saved metrics → metrics.json")
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    main()
