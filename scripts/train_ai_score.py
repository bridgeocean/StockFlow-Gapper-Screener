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

def _read_csv_lower(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    return df

def _valid_basic(df):
    return df is not None and not df.empty and df.shape[1] > 1

def load_training_df():
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
    s = s.replace({"": np.nan, "nan": np.nan, "None": np.nan, "null": np.nan})
    s = s.str.replace(r"[,%\s]", "", regex=True)
    s = s.str.replace("−", "-", regex=False)
    return pd.to_numeric(s, errors="coerce")

def choose_best(df: pd.DataFrame, keyset: set, prefer_nonnull_in: str | None):
    """Pick the column in keyset with highest overlap with prefer_nonnull_in (label).
       Returns (best_col, debug_list)."""
    candidates = [c for c in df.columns if c in keyset]
    if not candidates:
        return None, []
    rows = []
    for c in candidates:
        total = df[c].notna().sum()
        if prefer_nonnull_in and prefer_nonnull_in in df.columns:
            overlap = df.loc[df[prefer_nonnull_in].notna(), c].notna().sum()
        else:
            overlap = total
        rows.append((overlap, total, c))
    # sort by overlap, then by total
    rows.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return rows[0][2], rows

def main():
    df = load_training_df()
    if df is None or df.empty:
        print("Empty training set.")
        sys.exit(1)

    # --- choose label first (column with most non-null) ---
    c_y, y_dbg = choose_best(df, SYN["change_open_pct"], prefer_nonnull_in=None)
    print("Label candidates:", y_dbg)
    if c_y is None:
        print("No label column found among", SYN["change_open_pct"])
        sys.exit(1)

    # --- choose features maximizing overlap with label rows ---
    c_gap, gap_dbg = choose_best(df, SYN["gap_pct"], prefer_nonnull_in=c_y)
    c_rvol, rvol_dbg = choose_best(df, SYN["rvol"], prefer_nonnull_in=c_y)
    c_rsi,  rsi_dbg  = choose_best(df, SYN["rsi14m"], prefer_nonnull_in=c_y)

    # optional date/ticker for sorting/diagnostics
    c_date = next((c for c in df.columns if c in SYN["date"]), None)
    c_tic  = next((c for c in df.columns if c in SYN["ticker"]), None)

    print("Selected →", {"gap": c_gap, "rvol": c_rvol, "rsi": c_rsi, "label": c_y, "date": c_date, "ticker": c_tic})
    print("Debug overlap (gap):", gap_dbg)
    print("Debug overlap (rvol):", rvol_dbg)
    print("Debug overlap (rsi) :", rsi_dbg)

    required = [("gap", c_gap), ("rvol", c_rvol), ("rsi", c_rsi), ("label", c_y)]
    if any(v is None for _, v in required):
        print("Missing at least one required concept. Have columns:", list(df.columns))
        sys.exit(1)

    use_cols = [c for c in [c_date, c_tic, c_gap, c_rvol, c_rsi, c_y] if c]
    df = df[use_cols].copy()

    # Show non-null counts overall
    print("Non-null BEFORE cleaning (overall):")
    for name, col in [("gap", c_gap), ("rvol", c_rvol), ("rsi", c_rsi), ("label", c_y)]:
        print(f"  {name:>5}: {df[col].notna().sum()} / {len(df)}")

    # Clean to numeric
    for col in [c_gap, c_rvol, c_rsi, c_y]:
        df[col] = clean_to_numeric(df[col])

    print("Non-null AFTER cleaning (overall):")
    for name, col in [("gap", c_gap), ("rvol", c_rvol), ("rsi", c_rsi), ("label", c_y)]:
        nn = df[col].notna().sum()
        print(f"  {name:>5}: {nn} / {len(df)} dtype={df[col].dtype}")

    # focus on rows where label is present
    labeled = df[df[c_y].notna()].copy()
    print(f"Labeled rows after cleaning: {len(labeled)}")

    if labeled.empty:
        print("No rows with label available after cleaning. Cannot train.")
        sys.exit(1)

    # Show feature coverage *within* labeled rows
    print("Within labeled rows (non-null counts):")
    for name, col in [("gap", c_gap), ("rvol", c_rvol), ("rsi", c_rsi)]:
        print(f"  {name:>5}: {labeled[col].notna().sum()} / {len(labeled)}")

    # Clip and final dropna (only within labeled set)
    labeled[c_gap] = labeled[c_gap].clip(-40, 40)
    labeled[c_rvol]= labeled[c_rvol].clip(0, 15)
    labeled[c_rsi] = labeled[c_rsi].clip(0, 100)

    before = len(labeled)
    labeled = labeled.dropna(subset=[c_gap, c_rvol, c_rsi, c_y]).reset_index(drop=True)
    after = len(labeled)
    print(f"Dropped {before-after} labeled rows with NA in features; remaining {after} rows.")

    if labeled.empty:
        print("Still no usable rows where label and all features overlap.")
        sys.exit(1)

    # Optional time sort
    if c_date and pd.api.types.is_string_dtype(labeled[c_date]):
        try:
            labeled[c_date] = pd.to_datetime(labeled[c_date])
            labeled = labeled.sort_values(c_date).reset_index(drop=True)
        except Exception as e:
            print("Date parse warning:", e)

    # Train/test split
    n = len(labeled)
    cut = int(n * 0.8)
    X_cols = [c_gap, c_rvol, c_rsi]
    X_train, y_train = labeled.loc[:cut-1, X_cols], (labeled.loc[:cut-1, c_y] > 0.0).astype(int)
    X_test,  y_test  = labeled.loc[cut:,   X_cols], (labeled.loc[cut:,   c_y] > 0.0).astype(int)

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=200)),
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
