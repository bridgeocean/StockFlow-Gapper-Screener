import json, pandas as pd, numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score
from sklearn.linear_model import LogisticRegression

CSV = "training_polygon_v1.csv"

df = pd.read_csv(CSV)
df = df.dropna(subset=["change_open_pct","gap_pct","rvol","rsi14m"])
df = df.sort_values("ts")

features = ["change_open_pct","gap_pct","rvol","rsi14m"]
X = df[features].values
y = df["success_30m"].values.astype(int)

tscv = TimeSeriesSplit(n_splits=5)
aucs=[]
for train_idx, test_idx in tscv.split(X):
    Xtr, Xte = X[train_idx], X[test_idx]
    ytr, yte = y[train_idx], y[test_idx]
    clf = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf.fit(Xtr, ytr)
    p = clf.predict_proba(Xte)[:,1]
    auc = roc_auc_score(yte, p)
    aucs.append(auc)
print("CV AUCs:", [round(a,3) for a in aucs], "mean:", round(float(np.mean(aucs)),3))

final = LogisticRegression(max_iter=1000, class_weight="balanced")
final.fit(X, y)

model = {
  "features": features,
  "coef": final.coef_[0].tolist(),
  "intercept": float(final.intercept_[0])
}
with open("model_logreg_v1.json","w") as f:
    json.dump(model, f, indent=2)
print("Saved -> model_logreg_v1.json")
