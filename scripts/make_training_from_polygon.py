#!/usr/bin/env python3
"""
Builds a training CSV from Polygon minute + daily data.

ENV INPUTS
----------
POLYGON_API_KEY  : required
TRAIN_START      : YYYY-MM-DD (inclusive)  e.g. "2023-10-01"
TRAIN_END        : YYYY-MM-DD (inclusive)  e.g. "2023-10-31"
UNIVERSE         : optional comma-separated tickers, e.g. "AAPL,TSLA,AMD,NVDA"
OUT_CSV          : optional; defaults to "training_polygon_v1.csv"

OUTPUT
------
CSV with columns:
  date,ticker,gap_pct,change_open_pct,rsi14m,rvol

Notes
-----
- gap_pct = (first minute open - previous trading day close) / previous close * 100
- change_open_pct is identical to gap_pct (kept for compatibility with older trainer scripts)
- rsi14m is 14-period RSI computed on that day’s minute closes; we take the last RSI value
  available within the session (if fewer than 15 minutes, it will be NaN and the row is dropped).
- rvol is "relative volume" = that day’s total volume / 30-trading-day average daily volume
  (using daily bars prior to the day).
"""

import os
import sys
import time
import math
import json
import datetime as dt
from typing import Dict, Any, List, Optional

import requests
import pandas as pd
import numpy as np
from dateutil import parser as dtparser
from tenacity import (
    retry, stop_after_attempt, wait_exponential, retry_if_exception_type
)
from requests.exceptions import HTTPError, ConnectionError, Timeout

API_BASE = "https://api.polygon.io"
API_KEY = os.environ.get("POLYGON_API_KEY", "").strip()

START = os.environ.get("TRAIN_START", "").strip()
END = os.environ.get("TRAIN_END", "").strip()
UNIVERSE = os.environ.get("UNIVERSE", "").strip()
OUT_CSV = os.environ.get("OUT_CSV", "training_polygon_v1.csv")

# Sensible default universe if none provided
DEFAULT_UNIVERSE = ["AAPL", "TSLA", "AMD", "NVDA"]

if not API_KEY:
    print("ERROR: POLYGON_API_KEY is not set.", file=sys.stderr)
    sys.exit(2)

if not START or not END:
    print("ERROR: TRAIN_START and TRAIN_END must be YYYY-MM-DD.", file=sys.stderr)
    sys.exit(2)

def parse_date(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y-%m-%d").date()

START_DATE = parse_date(START)
END_DATE = parse_date(END)

if START_DATE > END_DATE:
    print(f"ERROR: START {START} is after END {END}.", file=sys.stderr)
    sys.exit(2)

tickers = [t.strip().upper() for t in UNIVERSE.split(",") if t.strip()] or DEFAULT_UNIVERSE

print(f"Universe ({len(tickers)}): {', '.join(tickers)}")
print(f"Window: {START_DATE} → {END_DATE}")

session = requests.Session()
session.params = {"apiKey": API_KEY}


class RetryableHTTPError(HTTPError):
    """Marker for errors that should be retried (e.g., 429, 5xx)."""


def _raise_for_retry(status_code: int, url: str, body: Optional[Dict[str, Any]] = None):
    if status_code in (429, 500, 502, 503, 504):
        err = body.get("error") if isinstance(body, dict) else None
        raise RetryableHTTPError(f"Retryable status {status_code} on {url} ({err})")
    else:
        raise HTTPError(f"HTTP {status_code} on {url}: {body}")


@retry(
    retry=retry_if_exception_type((RetryableHTTPError, ConnectionError, Timeout)),
    stop=stop_after_attempt(7),
    wait=wait_exponential(multiplier=1, min=1, max=60),
    reraise=True,
)
def get_json(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    # Always use date-only {from}/{to} in path for aggs calls
    url = f"{API_BASE}{path}"
    resp = session.get(url, params=params, timeout=30)
    # Handle rate limit back-pressure if present
    if resp.status_code == 429:
        try:
            data = resp.json()
        except Exception:
            data = {"error": "Too Many Requests"}
        # Polygon sometimes sends Retry-After
        ra = resp.headers.get("Retry-After")
        if ra:
            try:
                wait_s = int(ra)
                time.sleep(wait_s)
            except Exception:
                pass
        _raise_for_retry(resp.status_code, url, data)

    if resp.status_code >= 400:
        try:
            data = resp.json()
        except Exception:
            data = {"error": resp.text[:200]}
        _raise_for_retry(resp.status_code, url, data)

    return resp.json()


def daterange(start: dt.date, end: dt.date):
    d = start
    one = dt.timedelta(days=1)
    while d <= end:
        yield d
        d += one


def is_weekend(d: dt.date) -> bool:
    return d.weekday() >= 5  # 5=Sat, 6=Sun


def get_prev_trading_close(ticker: str, day: dt.date) -> Optional[float]:
    """
    Fetch previous trading day close using 1/day aggs over a small back window.
    """
    # look back 15 calendar days to find the last trading day before `day`
    from_date = (day - dt.timedelta(days=20)).strftime("%Y-%m-%d")
    to_date = (day - dt.timedelta(days=1)).strftime("%Y-%m-%d")
    path = f"/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}"
    data = get_json(path, {"adjusted": "true", "sort": "asc", "limit": 50000})
    results = data.get("results", []) or []
    if not results:
        return None
    # last trading day close
    return float(results[-1]["c"])


def fetch_minute_bars(ticker: str, day: dt.date) -> pd.DataFrame:
    """
    Fetch minute bars for a single calendar day using date-only range.
    """
    ds = day.strftime("%Y-%m-%d")
    path = f"/v2/aggs/ticker/{ticker}/range/1/minute/{ds}/{ds}"
    data = get_json(path, {"adjusted": "true", "sort": "asc", "limit": 50000})
    results = data.get("results", []) or []
    if not results:
        return pd.DataFrame(columns=["t", "o", "h", "l", "c", "v"])

    df = pd.DataFrame(results)
    # Polygon uses epoch millis in "t"
    df["ts"] = pd.to_datetime(df["t"], unit="ms", utc=True)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"})
    # Keep only regular trading hours (roughly). Many minute streams include pre/post.
    df = df[(df["ts"].dt.time >= dt.time(13, 30)) & (df["ts"].dt.time <= dt.time(20, 0))]
    df = df.reset_index(drop=True)
    return df[["ts", "open", "high", "low", "close", "volume"]]


def fetch_daily_volume_baseline(ticker: str, day: dt.date) -> Optional[float]:
    """
    30-trading-day average *prior to* `day`.
    """
    to_date = (day - dt.timedelta(days=1))
    from_date = (to_date - dt.timedelta(days=60))  # 60 cal days ≈ 30 trading days
    path = f"/v2/aggs/ticker/{ticker}/range/1/day/{from_date:%Y-%m-%d}/{to_date:%Y-%m-%d}"
    data = get_json(path, {"adjusted": "true", "sort": "asc", "limit": 50000})
    results = data.get("results", []) or []
    if not results:
        return None
    vols = [float(r["v"]) for r in results[-30:]]  # last 30 trading days
    if not vols:
        return None
    return float(np.mean(vols))


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    up = np.where(delta > 0, delta, 0.0)
    down = np.where(delta < 0, -delta, 0.0)
    roll_up = pd.Series(up, index=series.index).ewm(alpha=1/period, adjust=False).mean()
    roll_down = pd.Series(down, index=series.index).ewm(alpha=1/period, adjust=False).mean()
    rs = roll_up / (roll_down.replace(0, np.nan))
    out = 100 - (100 / (1 + rs))
    return out


rows: List[Dict[str, Any]] = []

for day in daterange(START_DATE, END_DATE):
    if is_weekend(day):
        continue

    for ticker in tickers:
        try:
            prev_close = get_prev_trading_close(ticker, day)
            if prev_close is None or prev_close <= 0:
                print(f"SKIP {day} {ticker}: no previous close")
                continue

            mdf = fetch_minute_bars(ticker, day)
            if mdf.empty:
                print(f"SKIP {day} {ticker}: no minute bars (holiday or no data)")
                continue

            # first RTH minute open
            first_open = float(mdf.iloc[0]["open"])
            gap_pct = (first_open - prev_close) / prev_close * 100.0

            # total day volume from minute bars
            day_vol = float(mdf["volume"].sum())

            # 30D baseline daily volume
            base_vol = fetch_daily_volume_baseline(ticker, day)
            if base_vol is None or base_vol <= 0:
                print(f"SKIP {day} {ticker}: no 30D volume baseline")
                continue
            rvol = day_vol / base_vol

            # RSI(14) on minute closes; take last value of the day
            closes = mdf["close"].astype(float)
            rsi14 = rsi(closes, 14).iloc[-1]
            if pd.isna(rsi14):
                print(f"SKIP {day} {ticker}: insufficient minutes for RSI14")
                continue

            rows.append({
                "date": day.strftime("%Y-%m-%d"),
                "ticker": ticker,
                "gap_pct": round(gap_pct, 6),
                "change_open_pct": round(gap_pct, 6),  # kept for trainer compatibility
                "rsi14m": round(float(rsi14), 6),
                "rvol": round(rvol, 6),
            })

        except RetryableHTTPError as e:
            print(f"RETRYABLE {day} {ticker}: {e}")
            # tenacity will handle retries
            raise
        except HTTPError as e:
            print(f"ERR {day} {ticker}: {e}")
            # non-retryable HTTP error — just skip this ticker/day
            continue
        except Exception as e:
            print(f"ERR {day} {ticker}: {type(e).__name__}: {e}")
            continue

if not rows:
    print("No rows produced; nothing to write.")
    sys.exit(0)

df = pd.DataFrame(rows).sort_values(["date", "ticker"]).reset_index(drop=True)

# Final sanity: drop rows with any NaNs
before = len(df)
df = df.dropna(subset=["gap_pct", "change_open_pct", "rsi14m", "rvol"])
after = len(df)
if after < before:
    print(f"Dropped {before - after} rows with NaNs.")

df.to_csv(OUT_CSV, index=False)
print(f"Wrote {len(df)} rows to {OUT_CSV}")
