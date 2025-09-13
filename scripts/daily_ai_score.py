# scripts/daily_ai_score.py
import os, sys, json, math, time, csv
from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
import numpy as np

# -------------------------
# Config / inputs
# -------------------------
OUT_JSON     = os.getenv("OUT_JSON", "public/today_scores.json")
MODEL_PATH   = os.getenv("MODEL_PATH", "ai_score.joblib")
PRICE_MIN    = float(os.getenv("PRICE_MIN", "1"))
PRICE_MAX    = float(os.getenv("PRICE_MAX", "5"))
DAILY_FALLBACK = os.getenv("DAILY_FALLBACK", "1") == "1"  # allow Finviz-only scoring
POLYGON_API_KEY = os.getenv("POLYGON_API_KEY", "").strip()

# Input files written by fetch_finviz_* steps
CANDIDATES_CSV = Path("public/today_candidates.csv")
TICKERS_TXT    = Path("public/today_tickers.txt")
NEWS_JSON      = Path("public/today_news.json")  # optional, but helps fallback

# -------------------------
# Helper: safe read
# -------------------------
def safe_read_csv(path: Path) -> pd.DataFrame:
    if not path.exists() or path.stat().st_size == 0:
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        try:
            return pd.read_csv(path, encoding="utf-8-sig")
        except Exception:
            return pd.DataFrame()

def load_tickers_from_txt(path: Path):
    if not path.exists() or path.stat().st_size == 0:
        return []
    tickers = []
    for line in path.read_text().splitlines():
        t = line.strip().upper()
        if t: tickers.append(t)
    return sorted(set(tickers))

# -------------------------
# Candidate universe
# -------------------------
def load_candidates():
    df = safe_read_csv(CANDIDATES_CSV)
    if df.empty:
        # fallback to txt if CSV missing
        tickers = load_tickers_from_txt(TICKERS_TXT)
        if not tickers:
            print("❌ No candidate CSV or tickers list. Aborting gracefully.")
            return pd.DataFrame(columns=["Ticker","Price"])
        return pd.DataFrame({"Ticker": tickers, "Price":[np.nan]*len(tickers)})
    # normalize headers
    df.columns = [c.strip() for c in df.columns]
    # Finviz export typically has "Ticker" and "Price"
    must = []
    if "Ticker" not in df.columns:
        # try common variants
        for c in df.columns:
            if c.lower() == "ticker" or c.lower() == "symbol":
                df = df.rename(columns={c: "Ticker"})
                break
    if "Price" not in df.columns:
        for c in df.columns:
            if c.lower().startswith("price"):
                df = df.rename(columns={c: "Price"})
                break
    cols = [c for c in ["Ticker","Price","Change","Volume","Avg Volume"] if c in df.columns]
    if "Ticker" not in df.columns:
        print("❌ today_candidates.csv has no Ticker column. Aborting gracefully.")
        return pd.DataFrame(columns=["Ticker","Price"])
    # price filter (if present)
    if "Price" in df.columns:
        df["Price"] = pd.to_numeric(df["Price"], errors="coerce")
        df = df[(df["Price"] >= PRICE_MIN) & (df["Price"] <= PRICE_MAX)]
    df = df.drop_duplicates(subset=["Ticker"]).reset_index(drop=True)
    return df

# -------------------------
# Optional: news counts (Finviz)
# -------------------------
def load_news_counts():
    if not Path(NEWS_JSON).exists():
        return {}
    try:
        news = json.loads(Path(NEWS_JSON).read_text() or "{}")
        items = news.get("items", [])
        counts = {}
        for it in items:
            # expect {"ticker": "XYZ", ...}
            t = (it.get("ticker") or "").upper()
            if not t: continue
            counts[t] = counts.get(t, 0) + 1
        return counts
    except Exception:
        return {}

# -------------------------
# Polygon helpers (best effort)
# -------------------------
import requests

def _poly_get(url, params, max_retries=5):
    # exponential backoff on 429; bail on 403/401
    for i in range(max_retries):
        r = requests.get(url, params=params, timeout=20)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (401,403):
            raise RuntimeError(f"Polygon auth/plan error {r.status_code}: {r.text}")
        if r.status_code == 429:
            back = 0.8 * (2**i)
            print(f"… backoff {back:.1f}s")
            time.sleep(back)
            continue
        # other errors: one retry then give up
        time.sleep(0.5)
    raise RuntimeError(f"Too many retries on {url}")

def polygon_prev_close_and_today(ticker: str):
    """Return (prev_close, today_open) using /v2/aggs daily.
       If not available, raise."""
    if not POLYGON_API_KEY:
        raise RuntimeError("No POLYGON_API_KEY")
    base = "https://api.polygon.io/v2/aggs/ticker/{}/range/1/day/{}/{}"
    # last 20 sessions window
    end = datetime.now(timezone.utc).date()
    start = end.replace(day=max(1, end.day-20))
    url = base.format(ticker, start.isoformat(), end.isoformat())
    data = _poly_get(url, {"adjusted":"true","sort":"asc","limit":"50","apiKey":POLYGON_API_KEY})
    results = (data or {}).get("results") or []
    if len(results) < 2:
        raise RuntimeError("not enough daily rows")
    # today assumed last, prev_close = prior c, today_open = last o
    prev_close = results[-2].get("c")
    today_open = results[-1].get("o")
    if prev_close is None or today_open is None:
        raise RuntimeError("missing fields")
    return float(prev_close), float(today_open)

# -------------------------
# Scoring
# -------------------------
def ml_score_row(model, gap_pct, rvol, rsi):
    X = np.array([[gap_pct, rvol, rsi]], dtype=float)
    try:
        p = model.predict_proba(X)[:,1][0]
    except Exception:
        p = float(model.decision_function(X)[0])
        # map decision_function to 0..1 approx via logistic
        p = 1.0/(1.0+math.exp(-p))
    return float(np.clip(p, 0, 1))

def finviz_only_score(price, news_count):
    # Simple heuristic: price inside band + news boost
    base = 0.50
    if price is not None and PRICE_MIN <= price <= PRICE_MAX:
        base += 0.08
    base += min(news_count, 5) * 0.05
    return float(np.clip(base, 0, 0.99))

# -------------------------
# Main
# -------------------------
def main():
    cands = load_candidates()
    news_counts = load_news_counts()
    out_rows = []

    # Try to load model (optional). If missing, fallback will still run.
    model = None
    if Path(MODEL_PATH).exists():
        try:
            import joblib
            model = joblib.load(MODEL_PATH)
        except Exception as e:
            print(f"(!) Could not load model: {e}. Will use Finviz-only fallback if needed.")

    used_polygon = False

    for _, row in cands.iterrows():
        tic = str(row["Ticker"]).upper()
        price = None
        if "Price" in row and not pd.isna(row["Price"]):
            try: price = float(row["Price"])
            except: price = None

        # Try full features via Polygon (best effort)
        gap_pct = None; rvol = None; rsi = None
        ml_prob = None

        try:
            if POLYGON_API_KEY and model is not None:
                pc, to = polygon_prev_close_and_today(tic)
                used_polygon = True
                if pc and to:
                    gap_pct = (to - pc) / pc * 100.0
                # rvol/rsi minute features omitted in fallback; set neutral placeholders
                rvol = 1.0
                rsi = 50.0
                ml_prob = ml_score_row(model, gap_pct, rvol, rsi)
        except Exception as e:
            # Log and continue to fallback
            print(f"~ {tic}: polygon/ml path failed: {e}")

        # Fallback score if ml_prob missing
        if ml_prob is None:
            ncount = news_counts.get(tic, 0)
            ml_prob = finviz_only_score(price, ncount)

        out_rows.append({
            "ticker": tic,
            "price": price,
            "score": round(float(ml_prob), 4),
            "news_hits": int(news_counts.get(tic, 0)),
            "source": "ml+polygon" if used_polygon and model is not None else "finviz-fallback"
        })

    out = {
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "count": len(out_rows),
        "scores": sorted(out_rows, key=lambda r: r["score"], reverse=True)
    }
    Path(OUT_JSON).parent.mkdir(parents=True, exist_ok=True)
    Path(OUT_JSON).write_text(json.dumps(out, indent=2))
    print(f"✅ Wrote {OUT_JSON} with {len(out_rows)} tickers.")
    # never hard-fail; empty list is still OK
    return 0

if __name__ == "__main__":
    sys.exit(main())
