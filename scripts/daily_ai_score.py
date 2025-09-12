#!/usr/bin/env python3
import os, sys, json, time, math, io
from pathlib import Path
from datetime import datetime, timedelta, timezone
import requests
import pandas as pd
import numpy as np

# ----------------- config via env -----------------
POLY = os.environ.get("POLYGON_API_KEY", "")
PRICE_MIN = float(os.environ.get("PRICE_MIN", "1"))
PRICE_MAX = float(os.environ.get("PRICE_MAX", "5"))
TICKER_FILE = os.environ.get("TICKER_FILE", "public/today_tickers.txt")  # one ticker per line
OUT_JSON = os.environ.get("OUT_JSON", "public/today_scores.json")
MODEL_PATH = os.environ.get("MODEL_PATH", "ai_score.joblib")
DAILY_FALLBACK = os.environ.get("DAILY_FALLBACK", "1") == "1"  # allow daily fallback if minute blocked
MAX_TICKERS = int(os.environ.get("MAX_TICKERS", "60"))  # safety cap

# ----------------- tiny utils -----------------
def log(msg): print(msg, flush=True)
def utc_today_str(): return datetime.utcnow().strftime("%Y-%m-%d")

def backoff_sleep(i):
    # 0.8, 1.6, 3.2, 6.4, ...
    t = 0.8 * (2 ** i)
    log(f"… backoff {t:.1f}s")
    time.sleep(t)

def poly_get(url, params=None, want_json=True, retries=5):
    if params is None: params = {}
    params["apiKey"] = POLY
    for i in range(retries):
        r = requests.get(url, params=params, timeout=30)
        if r.status_code == 200:
            return r.json() if want_json else r
        if r.status_code in (429, 502, 503, 504):
            backoff_sleep(i)
            continue
        # hard error (403 etc)
        raise RuntimeError(f"Polygon error {r.status_code}: {r.text}")
    raise RuntimeError(f"Too many retries on {url}")

def load_candidates() -> list[str]:
    # Priority: explicit env CANDIDATE_TICKERS, else file, else error
    env_tick = os.environ.get("CANDIDATE_TICKERS","").strip()
    if env_tick:
        t = [x.strip().upper() for x in env_tick.replace(",", " ").split() if x.strip()]
        return list(dict.fromkeys(t))[:MAX_TICKERS]
    p = Path(TICKER_FILE)
    if p.exists():
        t = [ln.strip().upper() for ln in p.read_text().splitlines() if ln.strip() and not ln.startswith("#")]
        return list(dict.fromkeys(t))[:MAX_TICKERS]
    return []

# ----------------- feature builders -----------------
def minute_features(ticker: str, day: str):
    # needs /v2/aggs 1m for the day to approximate RSI14m, gap from first minute, and minute-sum volume
    url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/minute/{day}/{day}"
    js = poly_get(url)
    res = js.get("results") or []
    if not res: raise RuntimeError("no minute data")
    df = pd.DataFrame(res)
    # First minute open
    first_open = float(df.loc[0, "o"])
    # To get prev close, call previous close endpoint
    pc = poly_get(f"https://api.polygon.io/v2/aggs/ticker/{ticker}/prev")["results"][0]["c"]
    gap_pct = (first_open / pc - 1.0) * 100.0

    # RSI14 on 1-min closes
    closes = df["c"].astype(float).values
    delta = np.diff(closes, prepend=closes[0])
    up = np.clip(delta, 0, None)
    down = -np.clip(delta, None, 0)
    roll = 14
    if len(closes) < roll + 1: raise RuntimeError("not enough minutes for rsi")
    avg_gain = pd.Series(up).rolling(roll, min_periods=roll).mean()
    avg_loss = pd.Series(down).rolling(roll, min_periods=roll).mean()
    rs = avg_gain / (avg_loss.replace(0, np.nan))
    rsi = 100 - (100 / (1 + rs))
    rsi14m = float(rsi.iloc[-1]) if not math.isnan(rsi.iloc[-1]) else 50.0

    # daily relative volume using daily endpoint (today vol vs 30d avg)
    rvol = daily_relvol(ticker, day)

    return {
        "ticker": ticker,
        "date": day,
        "gap_pct": float(np.clip(gap_pct, -40, 40)),
        "rsi14m": float(np.clip(rsi14m, 0, 100)),
        "rvol": float(np.clip(rvol, 0, 15)),
        "mode": "minute",
    }

def daily_relvol(ticker: str, day: str) -> float:
    # last ~60 trading days to compute 30d avg vol
    end = day
    start_dt = (datetime.strptime(day, "%Y-%m-%d") - timedelta(days=60)).strftime("%Y-%m-%d")
    url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{start_dt}/{end}"
    js = poly_get(url)
    res = js.get("results") or []
    if not res: raise RuntimeError("no daily data")
    dfd = pd.DataFrame(res)
    dfd["tdate"] = pd.to_datetime(dfd["t"], unit="ms").dt.strftime("%Y-%m-%d")
    dfd = dfd.sort_values("tdate")
    vol_today = float(dfd.loc[dfd["tdate"] == day, "v"].iloc[-1])
    hist = dfd[dfd["tdate"] < day].tail(30)
    if hist.empty: return 1.0
    avg30 = float(hist["v"].mean())
    return vol_today / avg30 if avg30 > 0 else 1.0

def daily_features(ticker: str, day: str):
    # Fall-back when minute data is blocked. Uses daily bars only.
    # Gap: today's OPEN vs prev close. RSI14: daily closes. RelVol: daily volume vs 30d avg.
    end = day
    start_dt = (datetime.strptime(day, "%Y-%m-%d") - timedelta(days=60)).strftime("%Y-%m-%d")
    url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{start_dt}/{end}"
    js = poly_get(url)
    res = js.get("results") or []
    if not res: raise RuntimeError("no daily data")
    dfd = pd.DataFrame(res)
    dfd["tdate"] = pd.to_datetime(dfd["t"], unit="ms").dt.strftime("%Y-%m-%d")
    dfd = dfd.sort_values("tdate").reset_index(drop=True)

    # rows: ... prev_day, today
    if day not in dfd["tdate"].values:
        raise RuntimeError("no today row")
    i_today = int(dfd.index[dfd["tdate"] == day][-1])
    if i_today == 0: raise RuntimeError("no prev day")
    prev_close = float(dfd.loc[i_today-1, "c"])
    today_open = float(dfd.loc[i_today, "o"])
    gap_pct = (today_open / prev_close - 1.0) * 100.0

    # RSI14 on daily closes
    closes = dfd["c"].astype(float).values
    delta = np.diff(closes, prepend=closes[0])
    up = np.clip(delta, 0, None)
    down = -np.clip(delta, None, 0)
    roll = 14
    avg_gain = pd.Series(up).rolling(roll, min_periods=roll).mean()
    avg_loss = pd.Series(down).rolling(roll, min_periods=roll).mean()
    rs = avg_gain / (avg_loss.replace(0, np.nan))
    rsi = 100 - (100 / (1 + rs))
    rsi14 = float(rsi.iloc[i_today]) if not math.isnan(rsi.iloc[i_today]) else 50.0

    rvol = daily_relvol(ticker, day)

    return {
        "ticker": ticker,
        "date": day,
        "gap_pct": float(np.clip(gap_pct, -40, 40)),
        "rsi14m": float(np.clip(rsi14, 0, 100)),  # reuse same feature name so model loads
        "rvol": float(np.clip(rvol, 0, 15)),
        "mode": "daily",
    }

# ----------------- scoring -----------------
def load_model():
    import joblib
    if not Path(MODEL_PATH).exists():
        raise RuntimeError(f"Model not found: {MODEL_PATH}")
    return joblib.load(MODEL_PATH)

def score_rows(rows: list[dict]) -> list[dict]:
    if not rows: return []
    df = pd.DataFrame(rows)
    # model expects columns: gap_pct, rvol, rsi14m
    X = df[["gap_pct", "rvol", "rsi14m"]].copy()
    mdl = load_model()
    try:
        p = mdl.predict_proba(X)[:,1]
    except Exception:
        p = mdl.decision_function(X)
        p = (p - p.min()) / (p.max() - p.min() + 1e-9)
    df["ai_score"] = p
    return df.sort_values("ai_score", ascending=False).to_dict(orient="records")

# ----------------- price filter -----------------
def poly_prev_close(ticker: str, day: str) -> float | None:
    try:
        js = poly_get(f"https://api.polygon.io/v2/aggs/ticker/{ticker}/prev")
        return float(js["results"][0]["c"])
    except Exception:
        return None

# ----------------- main -----------------
def main():
    tickers = load_candidates()
    if not tickers:
        print("❌ No tickers provided. Set env CANDIDATE_TICKERS=... or add public/today_tickers.txt")
        sys.exit(1)

    tickers = tickers[:MAX_TICKERS]
    day = utc_today_str()
    built = []

    # Price filter 1–5 using yesterday close
    filt = []
    for t in tickers:
        pc = poly_prev_close(t, day)
        if pc is None: 
            log(f"~ {t}: skip (no prev close)")
            continue
        if PRICE_MIN <= pc <= PRICE_MAX:
            filt.append(t)
        else:
            log(f"- {t}: filtered by price {pc:.2f}")
    tickers = filt
    if not tickers:
        log("No tickers after price filter.")
    
    for t in tickers:
        try:
            row = minute_features(t, day)
            log(f"✓ {t} minute mode")
        except Exception as e:
            if not DAILY_FALLBACK:
                log(f"× {t} minute failed: {e}")
                continue
            try:
                row = daily_features(t, day)
                log(f"✓ {t} daily fallback")
            except Exception as e2:
                log(f"× {t} daily failed: {e2}")
                continue
        built.append(row)

    if not built:
        print("❌ No usable rows built.")
        sys.exit(2)

    # score
    try:
        scored = score_rows(built)
    except Exception as e:
        print(f"Model scoring failed: {e}")
        sys.exit(3)

    # write JSON
    Path("public").mkdir(parents=True, exist_ok=True)
    data = {"generatedAt": datetime.now(timezone.utc).isoformat(), "scores": scored}
    Path(OUT_JSON).write_text(json.dumps(data, indent=2))
    print(f"✅ Wrote {OUT_JSON} with {len(scored)} rows")

if __name__ == "__main__":
    main()
