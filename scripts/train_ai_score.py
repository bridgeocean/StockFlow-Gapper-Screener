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

# Column synonyms (lowercase)
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

def _read_csv_lower(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    return df

def _valid_basic(df):
    if df is None or df.empty: return False
    if df.shape[1] == 1: return False
    return True

def load_training_df():
    # Try training_all.csv
    df = None
    if TRAIN_PATH.exists():
        try:
            df = _read_csv_lower(TRAIN_PATH)
            print("Loaded training_all.csv:", df.shape)
        except Exception as e:
            print("Failed to read training_all.csv:", e)

    if not _valid_basic(df):
        print("training_all.csv invalid; falling back to training/*.csv")
        files = sorted(glob.glob(str(MONTH_DIR / "training_*.csv")))
        if not files:
            print("No monthly files found; cannot train.")
            sys.exit(1)

        dfs = []
        for f in files:
            try:
                d = _read_csv_lower(f)
                dfs.append(d)
            except Exception as e:
                print(f"Skip unreadable {f}: {e}")
        if not dfs:
            print("No readable monthly CSVs; cannot train.")
            sys.exit(1)

        df = pd.concat(dfs, ignore_index=True)
        print("Stitched in-memory from monthlies:", df.shape)

    print("Columns in dataset:", list(df.columns))
    return df

def clean_to_numeric(series: pd.Series) -> pd.Series:
    """Robust string→number cleaner: strips %, commas, spaces, unicode minus."""
    s = series.astype(str)
    s = s.str.strip()
    # Map obvious empties to NaN
    s = s.replace({"": np.nan, "nan": np.nan, "None": np.nan, "null": np.nan})
    # Remove percent signs, commas, spaces
    s = s.str.replace(r"[,%\s]", "", regex=True)
    # Replace unicode minus (−) with hyphen-minus (-)
    s = s.str.replace("−", "-", regex=False)
    # Convert
    return pd.to_numeric(s, errors="coerce")

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

    print("Selected columns →",
          {"gap": c_gap, "rvol": c_rvol, "rsi": c_rsi, "label": c_y, "date": c_date, "ticker": c_tic})

    req = [("gap", c_gap), ("rvol", c_rvol), ("rsi", c_rsi), ("label", c_y)]
    if any(v is None for _, v in req):
        print("Missing required columns. Available:", list(df.columns))
        sys.exit(1)

    use_cols = [c for c in [c_date,c_tic,c_gap,c_rvol,c_rsi,c_y] if c]
    df = df[use_cols].copy()

    # Before-clean counts
    print("Non-null BEFORE cleaning:")
    for name, col in [("gap",c_gap),("rvol",c_rvol),("rsi",c_rsi),("label",c_y)]:
        print(f"  {name:>5}: {df[col].notna().sum()} / {len(df)}")

    # Clean → numeric
    for col in [c_gap, c_rvol, c_rsi, c_y]:
        df[col] = clean_to_numeric(df[col])

    # After-clean counts
    print("Non-null AFTER cleaning:")
    empty_any = False
    for name, col in [("gap",c_gap),("rvol",c_rvol),("rsi",c_rsi),("label",c_y)]:
        nn = df[col].notna().sum()
        print(f"  {name:>5}: {nn} / {len(df)}  dtype={df[col].dtype}")
        if nn == 0:
            print(f"ERROR: Column '{col}' has 0 valid numeric values after cleaning.")
            empty_any = True
    if empty_any:
        print("Aborting because at least one required column is entirely empty after cleaning.")
        sys.exit(1)

    # sanity clips
    df[c_gap] = df[c_gap].clip(-40, 40)
    df[c_rvol]= df[c_rvol].clip(0, 15)
    df[c_rsi] = df[c_rsi].clip(0, 100)

    # Final NA drop on features+label
    before = len(df)
    df = df.dropna(subset=[c_gap,c_rvol,c_rsi,c_y]).reset_index(drop=True)
    after = len(df)
    print(f"Dropped {before-after} rows with NA in required columns; remaining {after} rows.")
    if df.empty:
        print("All rows dropped after NA filtering (even after cleaning).")
        sys.exit(1)

    # time sort (optional)
    if c_date and pd.api.types.is_string_dtype(df[c_date]):
        try:
            df[c_date] = pd.to_datetime(df[c_date])
            df = df.sort_values(c_date).reset_index(drop=True)
        except Exception as e:
            print("Date parse warning:", e)

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
