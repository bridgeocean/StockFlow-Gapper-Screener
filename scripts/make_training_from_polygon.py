# scripts/make_training_from_polygon.py
import os
import sys
import csv
import math
import time
import json
import datetime as dt
from typing import List, Dict, Any

import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import pandas as pd
from dateutil.relativedelta import relativedelta

API_KEY = os.environ.get("POLYGON_API_KEY")
if not API_KEY:
    print("ERROR: POLYGON_API_KEY env var is required", file=sys.stderr)
    sys.exit(1)

# Inputs (date-only; defaults ≈ last 24 months)
def parse_date(s: str) -> dt.date:
    return dt.date.fromisoformat(s)

TODAY = dt.date.today()
TRAIN_END = parse_date(os.environ.get("TRAIN_END", str(TODAY)))
if TRAIN_END > TODAY:
    TRAIN_END = TODAY
DEFAULT_START = TRAIN_END - relativedelta(months=24)
TRAIN_START = parse_date(os.environ.get("TRAIN_START", str(DEFAULT_START)))

# Universe
raw_tick = (os.environ.get("TICKERS") or "").strip()
if raw_tick:
    UNIVERSE = [t.strip().upper() for t in raw_tick.split(",") if t.strip()]
else:
    UNIVERSE = ["AAPL","TSLA","AMD","NVDA"]  # default starter set; change anytime

BASE = "https://api.polygon.io"
SESSION = requests.Session()

class PolyError(Exception):
    pass

def _raise_for_status(r: requests.Response):
    if r.status_code >= 400:
        try:
            msg = r.json()
        except Exception:
            msg = r.text
        raise PolyError(f"{r.status_code} {r.reason}: {msg}")

@retry(
    reraise=True,
    stop=stop_after_attempt(8),
    wait=wait_exponential(multiplier=1, min=1, max=60),
    retry=retry_if_exception_type((requests.RequestException, PolyError)),
)
def poly_get(path: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
    params = dict(params or {})
    params["apiKey"] = API_KEY
    url = f"{BASE}{path}"
    r = SESSION.get(url, params=params, timeout=30)
    if r.status_code in (429, 502, 503, 504):
        # let tenacity backoff
        raise PolyError(f"Rate/Server error {r.status_code}")
    _raise_for_status(r)
    return r.json()

def trading_days(start: dt.date, end: dt.date) -> List[dt.date]:
    days = []
    d = start
    while d <= end:
        if d.weekday() < 5:  # Mon-Fri
            days.append(d)
        d += dt.timedelta(days=1)
    return days

def compute_rsi(close_series: List[float], period: int = 14) -> float:
    if len(close_series) < period + 1:
        return math.nan
    gains, losses = 0.0, 0.0
    for i in range(1, period + 1):
        diff = close_series[i] - close_series[i - 1]
        if diff >= 0:
            gains += diff
        else:
            losses -= diff
    if losses == 0:
        return 100.0
    rs = gains / losses
    return 100.0 - (100.0 / (1.0 + rs))

def first_last_minute_ohlc(minutes: List[Dict[str, Any]]):
    # Polygon minute agg uses keys: t (ms), o,h,l,c,v
    if not minutes:
        return None
    o = minutes[0]["o"]
    c = minutes[-1]["c"]
    return o, c

def extract_first_14m_closes(minutes: List[Dict[str, Any]]) -> List[float]:
    closes = [m["c"] for m in minutes[:15]]  # need 15 points to compute 14 diffs
    return closes

def get_minute_day(ticker: str, day: dt.date) -> List[Dict[str, Any]]:
    # date-only path fixes 400s
    path = f"/v2/aggs/ticker/{ticker}/range/1/minute/{day.isoformat()}/{day.isoformat()}"
    out = poly_get(path, params={"adjusted": "true", "sort": "asc", "limit": 50000})
    return out.get("results") or []

def get_daily_range(ticker: str, start: dt.date, end: dt.date) -> List[Dict[str, Any]]:
    path = f"/v2/aggs/ticker/{ticker}/range/1/day/{start.isoformat()}/{end.isoformat()}"
    out = poly_get(path, params={"adjusted": "true", "sort": "asc", "limit": 50000})
    return out.get("results") or []

def get_prev_close(ticker: str, day: dt.date) -> float:
    # previous calendar trading day close from daily bars
    prev = day - dt.timedelta(days=7)  # small window
    daily = get_daily_range(ticker, prev, day)
    # pick the daily bar *before* 'day'
    prevbars = [b for b in daily if dt.datetime.utcfromtimestamp(b["t"]/1000).date() < day]
    if not prevbars:
        return math.nan
    return prevbars[-1]["c"]

def rel_vol_30d(ticker: str, day: dt.date) -> float:
    lookback_start = day - relativedelta(days=45)
    bars = get_daily_range(ticker, lookback_start, day)
    # use last 30 trading days prior to 'day'
    rows = []
    for b in bars:
        d = dt.datetime.utcfromtimestamp(b["t"]/1000).date()
        if d < day:
            rows.append(b)
    vols = [b["v"] for b in rows[-30:]] if rows else []
    if not vols:
        return math.nan
    avg30 = sum(vols)/len(vols)
    # today volume (if today's bar exists)
    today_bar = [b for b in bars if dt.datetime.utcfromtimestamp(b["t"]/1000).date() == day]
    if not today_bar:
        return math.nan
    today_vol = today_bar[0]["v"]
    return today_vol/avg30 if avg30 > 0 else math.nan

def build_rows() -> List[Dict[str, Any]]:
    rows = []
    print(f"Window: {TRAIN_START.isoformat()} → {TRAIN_END.isoformat()}")
    print(f"Universe ({len(UNIVERSE)}): {', '.join(UNIVERSE)}")
    for d in trading_days(TRAIN_START, TRAIN_END):
        for t in UNIVERSE:
            try:
                mins = get_minute_day(t, d)
            except Exception as e:
                print(f"ERR {d} {t}: {e}")
                continue
            if not mins:
                # market holiday or no data
                continue

            # open/close from minutes
            oc = first_last_minute_ohlc(mins)
            if oc is None:
                continue
            open_px, close_px = oc

            # prev close for gap
            try:
                prev_c = get_prev_close(t, d)
            except Exception as e:
                print(f"ERR {d} {t} prev_close: {e}")
                prev_c = math.nan

            gap_pct = ((open_px - prev_c) / prev_c * 100.0) if (prev_c and prev_c > 0) else math.nan

            # RSI14m from first 15 closes (needs 15 minutes)
            rsi14m = math.nan
            try:
                closes = extract_first_14m_closes(mins)
                rsi14m = compute_rsi(closes, period=14)
            except Exception:
                pass

            # RelVol 30-day using daily volume
            rvol = math.nan
            try:
                rvol = rel_vol_30d(t, d)
            except Exception as e:
                print(f"WARN {d} {t} rvol: {e}")

            day_ret = ((close_px - open_px) / open_px * 100.0) if open_px else math.nan
            up_close = 1 if (not math.isnan(day_ret) and day_ret > 0) else 0

            row = {
                "Date": d.isoformat(),
                "Ticker": t,
                "GapPctPoly": round(gap_pct, 4) if gap_pct == gap_pct else "",
                "RSI14m": round(rsi14m, 4) if rsi14m == rsi14m else "",
                "RelVolPoly": round(rvol, 4) if rvol == rvol else "",
                "DayReturnPct": round(day_ret, 4) if day_ret == day_ret else "",
                "UpClose": up_close,
                # Back-compat lower-case aliases (if your old training script expects these)
                "gap_pct": round(gap_pct, 4) if gap_pct == gap_pct else "",
                "rsi14m": round(rsi14m, 4) if rsi14m == rsi14m else "",
                "rvol": round(rvol, 4) if rvol == rvol else "",
                "change_open_pct": round(day_ret, 4) if day_ret == day_ret else "",
            }
            rows.append(row)
    return rows

def main():
    rows = build_rows()
    if not rows:
        print("No rows built.")
        return
    out = "training_polygon_v1.csv"
    cols = ["Date","Ticker","GapPctPoly","RSI14m","RelVolPoly","DayReturnPct","UpClose",
            "gap_pct","rsi14m","rvol","change_open_pct"]  # keep aliases last
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Wrote {len(rows)} rows to {out}")

if __name__ == "__main__":
    main()
