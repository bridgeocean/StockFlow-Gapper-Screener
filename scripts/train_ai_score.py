# scripts/train_ai_score.py
import os, sys, json
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, accuracy_score
import joblib

CSV_PATH = os.environ.get("TRAINING_CSV", "data/training/training_polygon_v1.csv")
MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)
MODEL_PATH = os.path.join(MODEL_DIR, "ai_score_v1.pkl")
METRICS_PATH = os.path.join(MODEL_DIR, "ai_score_v1_metrics.json")

df = pd.read_csv(CSV_PATH)

# Accept either the new or legacy column names
def first_present(cols):
    for c in cols:
        if c in df.columns:
            return c
    raise KeyError(cols)

feat_gap = first_present(["GapPctPoly","gap_pct"])
feat_rsi = first_present(["RSI14m","rsi14m"])
feat_rvol = first_present(["RelVolPoly","rvol"])
target_col = first_present(["UpClose"])  # 1 if close>open

df = df[[feat_gap, feat_rsi, feat_rvol, target_col]].dropna()
X = df[[feat_gap, feat_rsi, feat_rvol]].values
y = df[target_col].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.25, random_state=42, stratify=y
)

pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(max_iter=200))
])

pipe.fit(X_train, y_train)

y_prob = pipe.predict_proba(X_test)[:,1]
y_pred = (y_prob >= 0.5).astype(int)

metrics = {
    "n_rows": int(len(df)),
    "auc": float(roc_auc_score(y_test, y_prob)),
    "accuracy": float(accuracy_score(y_test, y_pred)),
    "features": [feat_gap, feat_rsi, feat_rvol],
    "target": target_col,
}

joblib.dump(pipe, MODEL_PATH)
with open(METRICS_PATH, "w") as f:
    json.dump(metrics, f, indent=2)

print(f"Saved model → {MODEL_PATH}")
print(json.dumps(metrics, indent=2))
