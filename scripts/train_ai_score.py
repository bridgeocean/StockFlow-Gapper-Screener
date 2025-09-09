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

# Canonical names (case-insensitive) and their synonyms
SYN = {
    "gap_pct": {"gap_pct", "gappct", "gappctpoly", "gap_pctpoly", "gap_percent"},
    "rvol": {"rvol", "relvol", "relvolpoly", "rel_vol", "volume_ratio"},
    "rsi14m": {"rsi14m", "rsi_14m", "rsi_14", "rsi"},
    "change_open_pct": {
        "change_open_pct", "changeopenpct", "change_o",
        "perf_10m_pct", "open_to_10m_pct", "open_to_15m_pct",
        "perf10m_pct", "perf15m_pct",
    },
    "date": {"date", "day"},
    "ticker": {"ticker", "symbol"},
}

NUM_CANONICAL = {"gap_pct", "rvol", "rsi14m", "change_open_pct"}

def load_training_df() -> pd.DataFrame:
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

def _collapse_duplicate_name(df: pd.DataFrame, name: str):
    """Coalesce all columns with the same name into a single column (rowwise first non-null)."""
    idxs = [i for i, c in enumerate(df.columns) if c == name]
    if len(idxs) <= 1:
        return
    parts = [df.iloc[:, i] for i in idxs]
    # Try numeric coalesce first, then fallback to string if all-NaN
    parts_num = [pd.to_numeric(s, errors="coerce") for s in parts]
    merged = pd.concat(parts_num, axis=1).bfill(axis=1).iloc[:, 0]
    if merged.isna().all():
        merged = pd.concat(parts, axis=1).bfill(axis=1).iloc[:, 0]
    df.drop(columns=[name], inplace=True)  # drops all dups with that label
    df[name] = merged

def collapse_all_duplicate_names(df: pd.DataFrame):
    """Find any duplicate-named columns and coalesce them."""
    counts = pd.Series(df.columns).value_counts()
    dups = counts[counts > 1].index.tolist()
    for name in dups:
        _collapse_duplicate_name(df, name)

def find_candidates(cols, keyset):
    return [c for c in cols if c in keyset]

def resolve_canonical(df: pd.DataFrame, canonical: str) -> str | None:
    """
    Build a single canonical column by combining any synonyms present.
    Drops the synonym columns afterward so only the canonical remains.
    """
    keys = SYN[canonical]
    cands = find_candidates(set(df.columns), keys | {canonical})
    if not cands:
        return None

    is_numeric = canonical in NUM_CANONICAL
    parts = []
    for c in cands:
        s = df[c]  # guaranteed Series now (duplicate names were coalesced)
        if is_numeric:
            s = pd.to_numeric(s, errors="coerce")
        parts.append(s)

    merged = pd.concat(parts, axis=1).bfill(axis=1).iloc[:, 0]
    df[canonical] = merged

    to_drop = [c for c in cands if c != canonical]
    if to_drop:
        df.drop(columns=to_drop, inplace=True, errors="ignore")

    print(f"[resolve] {canonical}: candidates={cands} → using single '{canonical}'")
    return canonical

def main():
    df = load_training_df()
    if df.empty:
        print("Empty training set.")
        sys.exit(0)

    # Normalize headers then fix duplicate names once globally
    df.columns = [c.strip().lower() for c in df.columns]
    collapse_all_duplicate_names(df)

    # Resolve all canonicals
    c_gap = resolve_canonical(df, "gap_pct")
    c_rvol = resolve_canonical(df, "rvol")
    c_rsi  = resolve_canonical(df, "rsi14m")
    c_y    = resolve_canonical(df, "change_open_pct")
    c_date = resolve_canonical(df, "date")
    c_tic  = resolve_canonical(df, "ticker")

    needed = [c_gap, c_rvol, c_rsi]
    if not all(needed):
        print("Missing required feature columns. Got:", df.columns.tolist())
        sys.exit(1)

    if c_y is None:
        print("No label column (e.g., change_open_pct/perf_10m_pct). Cannot train supervised model.")
        sys.exit(0)

    use_cols = [c for c in [c_date, c_tic, c_gap, c_rvol, c_rsi, c_y] if c]
    df = df[use_cols].copy()

    # Cast numerics (now these are single Series)
    for col in [c_gap, c_rvol, c_rsi, c_y]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Clip outliers
    df[c_gap] = df[c_gap].clip(-40, 40)
    df[c_rvol] = df[c_rvol].clip(0, 15)
    df[c_rsi]  = df[c_rsi].clip(0, 100)

    df = df.dropna(subset=[c_gap, c_rvol, c_rsi, c_y]).reset_index(drop=True)
    if df.empty:
        print("All rows dropped after NA filtering.")
        sys.exit(0)

    # Time sort & split
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

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=200))
    ])
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
        p_test  = pipe.predict_proba(X_test)[:, 1]
    except Exception:
        p_train = pipe.decision_function(X_train)
        p_test  = pipe.decision_function(X_test)

    metrics = {
        "n_rows": int(n),
        "class_balance": {"pos": int(y_series.sum()), "neg": int((1 - y_series).sum())},
        "train": safe_scores(y_train, p_train),
        "test":  safe_scores(y_test,  p_test),
        "features": X_cols,
        "label_column": c_y,
        "positive_def": "change_open_pct > 0.0",
    }

    import joblib
    joblib.dump(pipe, "ai_score.joblib")
    Path("metrics.json").write_text(json.dumps(metrics, indent=2))

    print("Saved model → ai_score.joblib")
    print("Saved metrics → metrics.json")
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    main()
