# scripts/train_ai_score.py
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

TRAIN_PATH_PRIMARY = Path("training_all.csv")
MONTH_DIR = Path("training")

# Column synonyms (we'll lowercase headers first)
SYN = {
    "gap_pct": {"gap_pct", "gappct", "gappctpoly", "gap_pctpoly", "gap_percent"},
    "rvol": {"rvol", "relvol", "relvolpoly", "rel_vol", "volume_ratio"},
    "rsi14m": {"rsi14m", "rsi_14m", "rsi_14", "rsi"},
    "change_open_pct": {
        "change_open_pct",
        "changeopenpct",
        "change_o",          # <— your CSV
        "perf_10m_pct",
        "open_to_10m_pct",
        "open_to_15m_pct",
        "perf10m_pct",
        "perf15m_pct",
    },
    "date": {"date", "day"},
    "ticker": {"ticker", "symbol"},
}

def pick(colset, name):
    keys = SYN[name]
    for k in colset:
        if k in keys:
            return k
    return None

def load_training_df() -> pd.DataFrame:
    """Load training_all.csv or stitch training/*.csv."""
    if TRAIN_PATH_PRIMARY.exists():
        df = pd.read_csv(TRAIN_PATH_PRIMARY)
        print(f"Loaded training_all.csv: {df.shape}")
        return df

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

    # --- normalize headers ---------------------------------------------------
    df.columns = [c.strip().lower() for c in df.columns]

    # optional one-off renames before synonym picking (harmless if absent)
    rename_map = {
        "gappctpoly": "gap_pct",
        "gap_pctpoly": "gap_pct",
        "relvolpoly": "rvol",
        "rsi14m": "rsi14m",
        "rsi14m ": "rsi14m",
        "change_o": "change_open_pct",  # short header from your CSV
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

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

    # --- cast numeric columns safely (fixes the previous error) --------------
    num_cols = [c for c in [c_gap, c_rvol, c_rsi, c_y] if c in df.columns]
    if not num_cols:
        raise RuntimeError("No numeric feature columns found after header normalization.")
    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # --- clip outliers / clean -----------------------------------------------
    df[c_gap] = df[c_gap].clip(-40, 40)
    df[c_rvol] = df[c_rvol].clip(0, 15)
    df[c_rsi] = df[c_rsi].clip(0, 100)

    df = df.dropna(subset=[c_gap, c_rvol, c_rsi, c_y]).reset_index(drop=True)
    if df.empty:
        print("All rows dropped after NA filtering.")
        sys.exit(0)

    # --- sort and split (time-based) -----------------------------------------
    if c_date and pd.api.types.is_string_dtype(df[c_date]):
        try:
            df[c_date] = pd.to_datetime(df[c_date])
        except Exception:
            pass
        df = df.sort_values(c_date).reset_index(drop=True)

    n = len(df)
    cut = int(n * 0.8)
    X_cols = [c_gap, c_rvol, c_rsi]

    y_series = (df[c_y] > 0.0).astype(int)
    X_train, y_train = df.loc[: cut - 1, X_cols], y_series.iloc[:cut]
    X_test,  y_test  = df.loc[cut:, X_cols],    y_series.iloc[cut:]

    # --- model ---------------------------------------------------------------
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=200)),  # solver lbfgs (n_jobs not used)
        ]
    )
    pipe.fit(X_train, y_train)

    def safe_scores(y_true, prob):
        try:
            return {
                "roc_auc": float(roc_auc_score(y_true, prob)),
                "pr_auc": float(average_precision_score(y_true, prob)),
            }
        except Exception:
            return {"roc_auc": None, "pr_auc": None}

    try:
        p_train = pipe.predict_proba(X_train)[:, 1]
        p_test = pipe.predict_proba(X_test)[:, 1]
    except Exception:
        p_train = pipe.decision_function(X_train)
        p_test = pipe.decision_function(X_test)

    metrics = {
        "n_rows": int(n),
        "class_balance": {
            "pos": int(y_series.sum()),
            "neg": int((1 - y_series).sum()),
        },
        "train": safe_scores(y_train, p_train),
        "test": safe_scores(y_test, p_test),
        "features": X_cols,
        "label_column": c_y,
        "positive_def": "change_open_pct > 0.0",
    }

    # --- save ----------------------------------------------------------------
    import joblib

    joblib.dump(pipe, "ai_score.joblib")
    Path("metrics.json").write_text(json.dumps(metrics, indent=2))
    print("Saved model → ai_score.joblib")
    print("Saved metrics → metrics.json")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
