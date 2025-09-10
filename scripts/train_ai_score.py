# scripts/train_ai_score.py
import json, sys
from pathlib import Path
import numpy as np
import pandas as pd

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score

TRAIN_PATH_PRIMARY = Path("training_all.csv")
MONTH_DIR = Path("training")
OUT_DIR = Path("models"); OUT_DIR.mkdir(parents=True, exist_ok=True)

SYN = {
    "gap_pct": {"gap_pct","gappct","gappctpoly","gap_pctpoly","gap_percent"},
    "rvol": {"rvol","relvol","relvolpoly","rel_vol","volume_ratio"},
    "rsi14m": {"rsi14m","rsi_14m","rsi_14","rsi"},
    "change_open_pct": {
        "change_open_pct","changeopenpct",
        "perf_10m_pct","open_to_10m_pct","open_to_15m_pct",
        "perf10m_pct","perf15m_pct"
    },
    "date": {"date","day"},
    "ticker": {"ticker","symbol"},
}

def pick(colset, name):
    keys = SYN[name]
    for c in colset:
        if c in keys: return c
    return None

def load_training_df() -> pd.DataFrame:
    if TRAIN_PATH_PRIMARY.exists():
        df = pd.read_csv(TRAIN_PATH_PRIMARY)
        print(f"Loaded training_all.csv: {df.shape}")
        return df

    files = sorted(MONTH_DIR.glob("training_*.csv"))
    if not files:
        print("No training data found (training_all.csv or training/*.csv).")
        sys.exit(0)
    dfs = [pd.read_csv(f) for f in files]
    df = pd.concat(dfs, ignore_index=True)
    print(f"Stitched {len(files)} month files -> {df.shape}")
    return df

def resolve_canonical(df: pd.DataFrame, logical_name: str) -> str | None:
    cols = [c.strip().lower() for c in df.columns]
    mapping = {c.lower(): c for c in df.columns}
    hit = pick(set(cols), logical_name)
    return mapping.get(hit) if hit else None

def to_num(series: pd.Series) -> pd.Series:
    # robust numeric coercion
    return pd.to_numeric(series, errors="coerce")

def main():
    df = load_training_df()
    if df.empty: 
        print("Empty training set."); sys.exit(0)

    # normalize header case, keep original names for selection
    df.columns = [c.strip() for c in df.columns]

    c_gap  = resolve_canonical(df, "gap_pct")
    c_rvol = resolve_canonical(df, "rvol")
    c_rsi  = resolve_canonical(df, "rsi14m")
    c_y    = resolve_canonical(df, "change_open_pct")
    c_date = resolve_canonical(df, "date")
    c_tic  = resolve_canonical(df, "ticker")

    if not all([c_gap, c_rvol, c_rsi, c_y]):
        print("Missing required columns. Found:", df.columns.tolist())
        sys.exit(1)

    use_cols = [c for c in [c_date, c_tic, c_gap, c_rvol, c_rsi, c_y] if c]
    df = df[use_cols].copy()

    # numeric coercion
    for c in [c_gap, c_rvol, c_rsi, c_y]:
        df[c] = to_num(df[c])

    # sanity clips
    df[c_gap]  = df[c_gap].clip(-40, 40)        # percent points
    df[c_rvol] = df[c_rvol].clip(lower=0, upper=15)
    df[c_rsi]  = df[c_rsi].clip(0, 100)

    df = df.dropna(subset=[c_gap, c_rvol, c_rsi, c_y]).reset_index(drop=True)
    if df.empty:
        print("All rows dropped after NA filtering.")
        sys.exit(0)

    # time split
    if c_date and df[c_date].dtype == object:
        try:
            df[c_date] = pd.to_datetime(df[c_date])
        except Exception:
            pass
        df = df.sort_values(c_date).reset_index(drop=True)

    n = len(df)
    cut = max(1, int(n*0.8))
    X_cols = [c_gap, c_rvol, c_rsi]

    y = (df[c_y] > 0.0).astype(int)
    X_train, y_train = df.loc[:cut-1, X_cols], y.loc[:cut-1]
    X_test,  y_test  = df.loc[cut:,  X_cols], y.loc[cut:]

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=200))
    ])
    pipe.fit(X_train, y_train)

    def safe_scores(y_true, prob):
        try:
            return {
                "roc_auc": float(roc_auc_score(y_true, prob)),
                "pr_auc": float(average_precision_score(y_true, prob))
            }
        except Exception:
            return {"roc_auc": None, "pr_auc": None}

    try:
        p_tr = pipe.predict_proba(X_train)[:,1]
        p_te = pipe.predict_proba(X_test)[:,1] if len(X_test) else np.array([])
    except Exception:
        p_tr = pipe.decision_function(X_train)
        p_te = pipe.decision_function(X_test) if len(X_test) else np.array([])

    metrics = {
        "n_rows": int(n),
        "features": X_cols,
        "label_column": c_y,
        "positive_def": "change_open_pct > 0.0",
        "train": safe_scores(y_train, p_tr),
        "test": safe_scores(y_test, p_te) if len(X_test) else {"roc_auc": None, "pr_auc": None},
    }

    import joblib
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipe, OUT_DIR / "ai_score.joblib")
    Path("metrics.json").write_text(json.dumps(metrics, indent=2))
    print("Saved models/ai_score.joblib and metrics.json")
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    main()
