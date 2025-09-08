#!/usr/bin/env python3
"""
Build a monthly training CSV from Polygon with safe rate limiting.

Outputs: training_polygon_v1.csv with columns:
  Date, Ticker, GapPctPoly, RSI14m, RelVolPoly

Reads from env:
  POLYGON_API_KEY        (required)
  TRAIN_START            (YYYY-MM-DD, inclusive)
  TRAIN_END              (YYYY-MM-DD, inclusive)
  UNIVERSE               (comma-separated tickers, default: AAPL,TSLA,AMD,NVDA)
  RATE_LIMIT_RPM         (requests per minute throttle, default: 4)
  MAX_RETRY_MINUTES      (per-request patience, default: 12)
"""

import os
import sys
import time
import math
import random
import requests
import pandas as pd
from datetime import datetime, timedelta, timezone

# ---------- CONFIG / ENV ----------
API_KEY = os.environ.get("POLYGON_API_KEY")
if not API_KEY:
    print("ERROR: POLYGON_API_KEY is missing in env.", file=sys.stderr)
    sys.exit(1)

TRAIN_START = os.environ.get("TRAIN_START")  # YYYY-MM-DD
TRAIN_END   = os.environ.get("TRAIN_END")    # YYYY-MM-DD
if not TRAIN_START or not TRAIN_END:
    print("ERROR: TRAIN_START/TRAIN_END are required (YYYY-MM-DD).", file=sys.stderr)
    sys.exit(1)

UNIVERSE = [t.strip().upper() for t in os.environ.get("UNIVERSE", "AAPL,TSLA,AMD,NVDA").split(",") if t.strip()]
RATE_LIMIT_RPM = max(1, int(os.getenv("RATE_LIMIT_RPM", "4")))
MAX_RETRY_MINUTES = int(os.getenv("MAX_RETRY_MINUTES", "12"))

BASE = "https://api.polygon.io"
SESSION = requests.Session()

_MIN_INTERVAL = 60.0 / RATE_LIMIT_RPM
_last_call_ts = 0.0

def _throttle():
    global _last_call_ts
    now = time.time()
    wait = (_last_call_ts + _MIN_INTERVAL) - now
    if wait > 0:
        time.sleep(wait)
    _last_call_ts = time.time()

def _get_json(path_or_url: str, params: dict | None = None) -> dict:
    """GET JSON with throttle + Retry-After + capped exponential backoff."""
    if params is None:
        params = {}
    # accept either a full URL (next_url) or a path that we'll prefix
    if path_or_url.startswith("http"):
        url = path_or_url
        # next_url already has query; just add apiKey if missing
        if "apiKey=" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}apiKey={API_KEY}"
    else:
        url = f"{BASE}{path_or_url}"
        params = {**params, "apiKey": API_KEY}

    deadline = time.time() + MAX_RETRY_MINUTES * 60
    attempt = 0
    while True:
        _throttle()
        resp = SESSION.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            return resp.json()

        if resp.status_code in (429, 502, 503, 504):
            ra = resp.headers.get("Retry-After")
            if ra:
                try:
                    sleep_s = float(ra)
                except Exception:
                    sleep_s = 1.0
            else:
                sleep_s = min(2 ** attempt, 60) + random.uniform(0, 1)
            print(f"RETRYABLE {resp.status_code} on {url} — sleeping {sleep_s:.1f}s")
            if time.time() + sleep_s > deadline:
                resp.raise_for_status()
            time.sleep(sleep_s)
            attempt += 1
            continue

        resp.raise_for_status()

def _to_yyyymmdd(ms_utc: int) -> str:
    return datetime.fromtimestamp(ms_utc / 1000, tz=timezone.utc).strftime("%Y-%m-%d")

def _to_ny_dt(ms_utc: int) -> pd.Timestamp:
    # UTC → America/New_York
    return (pd.to_datetime(ms_utc, unit="ms", utc=True)
              .tz_convert("America/New_York"))

# ---------- DATA FETCH ----------
def fetch_daily(ticker: str, start_date: str, end_date: str, back_days: int = 60) -> pd.DataFrame:
    """Daily bars starting from (start_date - back_days) to end_date."""
    start_dt = datetime.fromisoformat(start_date)
    pre_dt = (start_dt - timedelta(days=back_days)).strftime("%Y-%m-%d")
    path = f"/v2/aggs/ticker/{ticker}/range/1/day/{pre_dt}/{end_date}"
    j = _get_json(path, {"adjusted": "true", "sort": "asc", "limit": 50000})
    results = j.get("results", []) or []
    if not results:
        return pd.DataFrame(columns=["t","o","h","l","c","v"])

    df = pd.DataFrame(results)
    # t=ms, v=volume, o/h/l/c
    df["date"] = df["t"].apply(_to_yyyymmdd)
    return df[["date", "o", "h", "l", "c", "v"]]

def fetch_minutes_month(ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
    """All minute bars for the month (handles pagination via next_url)."""
    path = f"/v2/aggs/ticker/{ticker}/range/1/minute/{start_date}/{end_date}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000}

    all_rows = []
    j = _get_json(path, params)
    all_rows.extend(j.get("results", []) or [])

    next_url = j.get("next_url")
    while next_url:
        j = _get_json(next_url)
        all_rows.extend(j.get("results", []) or [])
        next_url = j.get("next_url")

    if not all_rows:
        return pd.DataFrame(columns=["t","o","h","l","c","v","n"])

    df = pd.DataFrame(all_rows)
    # convert to NY time, add local date and time-of-day
    df["dt_ny"] = df["t"].apply(_to_ny_dt)
    df["date"] = df["dt_ny"].dt.strftime("%Y-%m-%d")
    df["tod"] = df["dt_ny"].dt.strftime("%H:%M")
    return df

# ---------- FEATURES ----------
def rsi14_from_first_15m(min_df_for_day: pd.DataFrame) -> float | None:
    """RSI(14) on first 15 closes (09:30..09:44). Returns None if insufficient data."""
    # Keep 9:30–9:44 inclusive (15 bars = 14 periods)
    mask = min_df_for_day["tod"].between("09:30", "09:44", inclusive="both")
    sub = min_df_for_day.loc[mask]
    if len(sub) < 15:
        return None
    closes = sub["c"].astype(float).reset_index(drop=True)
    delta = closes.diff().dropna()
    gains = delta.clip(lower=0).sum() / 14.0
    losses = (-delta.clip(upper=0)).sum() / 14.0
    if losses == 0:
        return 100.0
    rs = gains / losses
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return float(rsi)

def build_rows_for_ticker(ticker: str, start_date: str, end_date: str) -> list[dict]:
    day_df = fetch_daily(ticker, start_date, end_date, back_days=60)
    min_df = fetch_minutes_month(ticker, start_date, end_date)

    # rolling 30-day avg daily volume for RelVol
    day_df["vol30"] = day_df["v"].rolling(30).mean()
    day_df["prev_close"] = day_df["c"].shift(1)

    # index by date for quick lookup
    min_by_date = dict(tuple(min_df.groupby("date")))

    rows = []
    for _, row in day_df.iterrows():
        d = row["date"]
        if d < start_date or d > end_date:
            continue  # only export inside the requested month

        prev_c = row["prev_close"]
        if pd.isna(prev_c) or prev_c <= 0:
            continue

        # gap % = (today open - prev close)/prev close * 100
        gap_pct = (float(row["o"]) - float(prev_c)) / float(prev_c) * 100.0

        # rsi14 from first 15 minutes
        rsi14 = None
        if d in min_by_date:
            rsi14 = rsi14_from_first_15m(min_by_date[d])

        # relative volume = day volume / 30d avg volume
        vol = float(row["v"])
        vol30 = float(row["vol30"]) if not pd.isna(row["vol30"]) else None
        rvol = (vol / vol30) if (vol30 and vol30 > 0) else None

        if rsi14 is None or rvol is None:
            continue  # drop incomplete rows

        rows.append({
            "Date": d,
            "Ticker": ticker,
            "GapPctPoly": round(gap_pct, 6),
            "RSI14m": round(rsi14, 6),
            "RelVolPoly": round(rvol, 6),
        })
    return rows

# ---------- MAIN ----------
def main():
    print(f"Window: {TRAIN_START} → {TRAIN_END}")
    print(f"Universe ({len(UNIVERSE)}): {', '.join(UNIVERSE)}")

    all_rows: list[dict] = []
    for t in UNIVERSE:
        try:
            rows = build_rows_for_ticker(t, TRAIN_START, TRAIN_END)
            all_rows.extend(rows)
        except requests.HTTPError as e:
            print(f"ERR {TRAIN_START}..{TRAIN_END} {t}: HTTPError {e}", file=sys.stderr)
        except Exception as e:
            print(f"ERR {TRAIN_START}..{TRAIN_END} {t}: {e}", file=sys.stderr)

    if not all_rows:
        print("No rows created for this chunk (likely too few prior days for RVOL/RSI).")
        # still write an empty CSV with headers so the workflow continues sanely
        pd.DataFrame(columns=["Date","Ticker","GapPctPoly","RSI14m","RelVolPoly"]).to_csv(
            "training_polygon_v1.csv", index=False
        )
        return

    out = pd.DataFrame(all_rows, columns=["Date","Ticker","GapPctPoly","RSI14m","RelVolPoly"])
    out.sort_values(["Date","Ticker"], inplace=True)
    out.to_csv("training_polygon_v1.csv", index=False)
    print(f"Wrote {len(out)} rows to training_polygon_v1.csv")

if __name__ == "__main__":
    main()
