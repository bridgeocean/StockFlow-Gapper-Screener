# scripts/build_candidates_from_polygon.py
# Build latest_screener.csv by fetching features from Polygon for today's tickers.
# Sources of tickers (first that exists):
#   - env CANDIDATE_TICKERS="AAPL,TSLA,AMD"
#   - public/today_tickers.txt  (one ticker per line)

import os, sys, time, math, json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
import pandas as pd
import numpy as np

API_KEY = os.getenv("POLYGON_API_KEY")
if not API_KEY:
    print("❌ POLYGON_API_KEY is missing.")
    sys.exit(1)

OUT_PATH = Path("latest_screener.csv")
TICKERS_FILE = Path("public/today_tickers.txt")

BASE = "https://api.polygon.io"

def get_tickers():
    env = os.getenv("CANDIDATE_TICKERS", "").strip()
    if env:
        return [t.strip().upper() for t in env.split(",") if t.strip()]
    if TICKERS_FILE.exists():
        return [ln.strip().upper() for ln in TICKERS_FILE.read_text().splitlines() if ln.strip()]
    return []

def req(url, params=None, max_retries=5):
    p = params.copy() if params else {}
    p["apiKey"] = API_KEY
    b = 0.75
    for i in range(max_retries):
        r = requests.get(url, params=p, timeout=30)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 502, 503):
            sleep = (2 ** i) * b
            print(f"… backoff {sleep:.1f}s on {r.status_code} {url}")
            time.sleep(sleep)
            continue
        # hard error
        txt = r.text[:300]
        raise RuntimeError(f"Polygon error {r.status_code}: {txt}")
    raise RuntimeError(f"Too many retries on {url}")

def last_two_trading_days_ohlc(ticker):
    # daily aggs for last ~10 days, pick last two results
    to = datetime.now(timezone.utc).date()
    frm = to - timedelta(days=14)
    url = f"{BASE}/v2/aggs/ticker/{ticker}/range/1/day/{frm}/{to}"
    js = req(url, {"adjusted": "true", "limit": 250})
    res = (js or {}).get("results", []) or []
    if len(res) < 2:
        return None, None
    res = sorted(res, key=lambda r: r["t"])
    prev, today = res[-2], res[-1]
    return prev, today

def today_minute_aggs(ticker):
    # minute bars for today (UTC date); includes pre/post if available
    to = datetime.now(timezone.utc).date()
    frm = to
    url = f"{BASE}/v2/aggs/ticker/{ticker}/range/1/minute/{frm}/{to}"
    js = req(url, {"adjusted": "true", "limit": 50000})
    res = (js or {}).get("results", []) or []
    res = sorted(res, key=lambda r: r["t"])
    return res

def compute_rsi(closes, period=14):
    closes = np.asarray(closes, dtype=float)
    if closes.size < period + 1:
        return np.nan
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    # Wilder's smoothing
    avg_gain = gains[:period].mean()
    avg_loss = losses[:period].mean()
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return float(rsi)

def avg_daily_volume_30d(ticker):
    to = datetime.now(timezone.utc).date()
    frm = to - timedelta(days=60)
    url = f"{BASE}/v2/aggs/ticker/{ticker}/range/1/day/{frm}/{to}"
    js = req(url, {"adjusted": "true", "limit": 250})
    res = (js or {}).get("results", []) or []
    if not res:
        return np.nan
    res = sorted(res, key=lambda r: r["t"])
    vols = [r.get("v", 0) for r in res[-30:]] if len(res) >= 30 else [r.get("v", 0) for r in res]
    if not vols:
        return np.nan
    return float(np.mean(vols))

def main():
    tickers = get_tickers()
    if not tickers:
        print("❌ No tickers provided. Set env CANDIDATE_TICKERS=... or add public/today_tickers.txt")
        sys.exit(1)

    rows = []
    for tic in tickers:
        try:
            prev, today = last_two_trading_days_ohlc(tic)
            if not prev or not today:
                print(f"Skip {tic}: not enough daily data.")
                continue
            prev_close = float(prev.get("c", np.nan))
            if not np.isfinite(prev_close) or prev_close <= 0:
                print(f"Skip {tic}: bad prev_close.")
                continue

            mins = today_minute_aggs(tic)
            if not mins:
                print(f"Skip {tic}: no minute data today.")
                continue

            # First minute open today for gap
            first_o = float(mins[0].get("o", np.nan))
            if not np.isfinite(first_o):
                print(f"Skip {tic}: first minute open missing.")
                continue
            gap_pct = (first_o - prev_close) / prev_close * 100.0

            # Price = last minute close (so far)
            last_c = float(mins[-1].get("c", np.nan))
            price = last_c if np.isfinite(last_c) else first_o

            # RSI(14) on minute closes so far today
            closes = [m.get("c", np.nan) for m in mins if "c" in m]
            rsi14m = compute_rsi(closes, period=14)

            # RelVol approximation = today's cum vol / 30d avg daily vol
            cum_vol = float(sum([m.get("v", 0.0) for m in mins]))
            v30 = avg_daily_volume_30d(tic)
            rvol = float(cum_vol / v30) if (v30 and v30 > 0) else np.nan

            rows.append({
                "Ticker": tic,
                "Price": round(price, 4) if np.isfinite(price) else "",
                "GapPct": round(gap_pct, 4) if np.isfinite(gap_pct) else "",
                "RelVol": round(rvol, 4) if np.isfinite(rvol) else "",
                "RSI14m": round(rsi14m, 2) if np.isfinite(rsi14m) else "",
            })
            print(f"✓ {tic}: gap={rows[-1]['GapPct']} rvol={rows[-1]['RelVol']} rsi14m={rows[-1]['RSI14m']}")
        except Exception as e:
            print(f"× {tic}: {e}")

    if not rows:
        print("❌ No usable rows built.")
        sys.exit(2)

    df = pd.DataFrame(rows)
    df.to_csv(OUT_PATH, index=False)
    print(f"✅ Wrote {OUT_PATH} with {len(df)} rows")

if __name__ == "__main__":
    main()
