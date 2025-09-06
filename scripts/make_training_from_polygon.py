#!/usr/bin/env python3
import os
import sys
import time
import math
import random
import csv
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

import requests

# ---------------------------------------------------------------------
# Config via env (with safe defaults)
# ---------------------------------------------------------------------
API_KEY = os.environ.get("POLYGON_API_KEY", "").strip()
if not API_KEY:
    print("ERROR: POLYGON_API_KEY is not set.", file=sys.stderr)
    sys.exit(1)

TRAIN_START = os.environ.get("TRAIN_START", "").strip()
TRAIN_END = os.environ.get("TRAIN_END", "").strip()

# If not provided by the workflow, default to last ~2 years (Polygon minute history limit)
today_utc = datetime.utcnow().date()
if not TRAIN_END:
    TRAIN_END = today_utc.strftime("%Y-%m-%d")
if not TRAIN_START:
    TRAIN_START = (today_utc - timedelta(days=730)).strftime("%Y-%m-%d")

UNIVERSE_FILE = os.environ.get("UNIVERSE_FILE", "scripts/universe.txt").strip()
OUTPUT_CSV = os.environ.get("OUTPUT_CSV", "training_polygon_v1.csv").strip()

# Regular US session in *UTC* (13:30–20:00)
REG_OPEN_UTC = (13, 30)  # 09:30 ET
REG_CLOSE_UTC = (20, 0)  # 16:00 ET

# Requests / Retry Settings
MAX_RETRIES = 8
BASE_SLEEP = 1.0   # seconds
MAX_SLEEP = 30.0   # cap any single backoff sleep
SESSION = requests.Session()
SESSION.headers.update({"Authorization": f"Bearer {API_KEY}"})


# ---------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------
def iso_date(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def daterange_utc(start: datetime, end: datetime) -> Iterable[datetime]:
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def with_jitter(seconds: float) -> float:
    # Full jitter
    return seconds * (0.5 + random.random())


def api_get(url: str, params: Dict) -> Optional[dict]:
    """GET with exponential backoff on 429/5xx. Returns parsed JSON or None."""
    attempt = 0
    while True:
        attempt += 1
        try:
            resp = SESSION.get(url, params=params, timeout=30)
        except requests.RequestException as e:
            if attempt >= MAX_RETRIES:
                return None
            sleep = min(MAX_SLEEP, with_jitter(BASE_SLEEP * (2 ** (attempt - 1))))
            time.sleep(sleep)
            continue

        # Fast path
        if resp.status_code == 200:
            try:
                return resp.json()
            except Exception:
                return None

        # Respect Retry-After
        if resp.status_code in (429, 503, 502, 504):
            if attempt >= MAX_RETRIES:
                return None
            retry_after = resp.headers.get("Retry-After")
            if retry_after:
                try:
                    sleep = float(retry_after)
                except ValueError:
                    sleep = BASE_SLEEP
            else:
                sleep = min(MAX_SLEEP, with_jitter(BASE_SLEEP * (2 ** (attempt - 1))))
            time.sleep(sleep)
            continue

        # 400 typically means out-of-range day (holiday), pre-IPO, etc. Don't retry forever.
        if resp.status_code == 400:
            return None

        # Other client errors - don't loop forever.
        if 400 <= resp.status_code < 500:
            return None

        # Last resort for odd server codes
        if attempt >= MAX_RETRIES:
            return None
        sleep = min(MAX_SLEEP, with_jitter(BASE_SLEEP * (2 ** (attempt - 1))))
        time.sleep(sleep)


def rsi(values: List[float], period: int = 14) -> Optional[float]:
    """Classic RSI over a list of prices (>= period+1)."""
    if values is None or len(values) < period + 1:
        return None
    gains = []
    losses = []
    for i in range(1, len(values)):
        diff = values[i] - values[i - 1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    # Wilder's smoothing
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    if avg_loss == 0 and avg_gain == 0:
        return 50.0
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    rsi_val = 100.0 - (100.0 / (1.0 + rs))
    # continue smoothing over remainder
    for i in range(period, len(gains)):
        avg_gain = ((avg_gain * (period - 1)) + gains[i]) / period
        avg_loss = ((avg_loss * (period - 1)) + losses[i]) / period
        if avg_loss == 0 and avg_gain == 0:
            smoothed = 50.0
        elif avg_loss == 0:
            smoothed = 100.0
        else:
            rs = avg_gain / avg_loss
            smoothed = 100.0 - (100.0 / (1.0 + rs))
        rsi_val = smoothed
    return float(rsi_val)


# ---------------------------------------------------------------------
# Polygon helpers
# ---------------------------------------------------------------------
def minute_aggs_one_day(ticker: str, day: datetime) -> List[dict]:
    """Fetch minute bars for a single UTC day, but constrained to regular session."""
    # Session window in UTC
    start_dt = day.replace(hour=REG_OPEN_UTC[0], minute=REG_OPEN_UTC[1], second=0, microsecond=0, tzinfo=timezone.utc)
    end_dt = day.replace(hour=REG_CLOSE_UTC[0], minute=REG_CLOSE_UTC[1], second=0, microsecond=0, tzinfo=timezone.utc)

    url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/minute/{start_dt.isoformat()}/{end_dt.isoformat()}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000}
    data = api_get(url, params)
    if not data or "results" not in data:
        return []
    return data["results"]


def daily_aggs(ticker: str, start: datetime, end: datetime) -> List[dict]:
    """Fetch daily bars between start and end (inclusive)."""
    url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{start.date().isoformat()}/{end.date().isoformat()}"
    params = {"adjusted": "true", "sort": "desc", "limit": 5000}
    data = api_get(url, params)
    if not data or "results" not in data:
        return []
    return data["results"]


def prev_close_and_avgvol30(ticker: str, day: datetime, cache: Dict[str, Dict]) -> Tuple[Optional[float], Optional[float]]:
    """
    Get previous day's close and average daily volume over the last up-to-30 trading days ending *before* `day`.
    Uses a small cache per ticker for efficiency.
    """
    key = f"{ticker}"
    store = cache.setdefault(key, {})
    # Pull a 90-day window ending the day before to be safe
    end_d = (day - timedelta(days=1))
    start_d = end_d - timedelta(days=90)

    # Avoid re-fetch if we already have a range that covers this end date
    # (simple cache: store by last end date used)
    rng_key = store.get("_range_key")
    want_key = f"{start_d.date()}:{end_d.date()}"
    if rng_key != want_key:
        dailies = daily_aggs(ticker, start_d, end_d)
        store["_range_key"] = want_key
        store["dailies"] = dailies
    else:
        dailies = store.get("dailies", [])

    if not dailies:
        return (None, None)

    # dailies sorted desc (we asked sort=desc)
    prev_close = None
    vols = []
    closes = []

    for bar in dailies:
        # bar fields: t (ms), o, h, l, c, v
        closes.append(bar.get("c"))
        v = bar.get("v")
        if isinstance(v, (int, float)):
            vols.append(v)

    # previous close is the most recent daily close in this window
    prev_close = closes[0] if closes else None

    # avg vol of up to last 30 daily vols
    avgvol30 = None
    if vols:
        take = vols[:30]
        if take:
            avgvol30 = sum(take) / float(len(take))

    return (prev_close, avgvol30)


# ---------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------
def load_universe(path: str) -> List[str]:
    if not os.path.exists(path):
        return ["AAPL", "TSLA", "AMD", "NVDA"]
    with open(path, "r", encoding="utf-8") as f:
        syms = [ln.strip().upper() for ln in f if ln.strip() and not ln.strip().startswith("#")]
    return syms or ["AAPL"]


def main():
    start_date = datetime.strptime(TRAIN_START, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_date = datetime.strptime(TRAIN_END, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if end_date < start_date:
        print(f"ERROR: TRAIN_END {TRAIN_END} < TRAIN_START {TRAIN_START}", file=sys.stderr)
        sys.exit(1)

    # Safety clamp (minute history ~2y on most plans)
    cutoff = datetime.utcnow().replace(tzinfo=timezone.utc) - timedelta(days=730)
    if start_date < cutoff:
        print(f"Requested TRAIN_START {TRAIN_START} is older than ~2y minute-history. Clamping to {iso_date(cutoff)}.")
        start_date = cutoff

    universe = load_universe(UNIVERSE_FILE)
    print(f"Universe ({len(universe)}): {', '.join(universe)}")
    print(f"Window: {iso_date(start_date)} → {iso_date(end_date)}")

    rows_out: List[Dict] = []
    cache_daily: Dict[str, Dict] = {}

    for ticker in universe:
        # Pre-warm daily cache once (speeds up)
        _ = prev_close_and_avgvol30(ticker, start_date, cache_daily)

        for day in daterange_utc(start_date, end_date):
            # Fetch prev close & avgvol30 as of this day
            prev_close, avgvol30 = prev_close_and_avgvol30(ticker, day, cache_daily)
            if prev_close is None:
                # Likely pre-IPO or we don't have history yet
                # Not an error.
                # print(f"SKIP {iso_date(day)} {ticker}: no prev close", file=sys.stderr)
                continue

            mins = minute_aggs_one_day(ticker, day)
            if not mins:
                # Weekend/holiday/early-API return. Not an error.
                continue

            # First minute open (regular session) → gap %
            first_open = mins[0].get("o")
            if not isinstance(first_open, (int, float)) or prev_close is None or prev_close <= 0:
                # malformed; skip
                continue
            gap_pct = (first_open - prev_close) / prev_close * 100.0

            # RSI(14) on minute closes (regular session)
            closes = [m.get("c") for m in mins if isinstance(m.get("c"), (int, float))]
            rsi14m = rsi(closes, 14)

            # Relative volume = today's total volume / avg daily volume (last up-to-30 sessions)
            today_vol = 0.0
            for m in mins:
                v = m.get("v")
                if isinstance(v, (int, float)):
                    today_vol += v
            relvol = None
            if avgvol30 and avgvol30 > 0:
                relvol = today_vol / avgvol30

            rows_out.append({
                "Date": iso_date(day),
                "Ticker": ticker,
                "GapPctPoly": round(gap_pct, 6),
                "RSI14m": round(rsi14m, 6) if rsi14m is not None else "",
                "RelVolPoly": round(relvol, 6) if relvol is not None else "",
            })

    if not rows_out:
        print("No rows were built. Check date window and universe.", file=sys.stderr)
        # Still write an empty file with headers so downstream steps don't crash
        headers = ["Date", "Ticker", "GapPctPoly", "RSI14m", "RelVolPoly"]
        with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers)
            w.writeheader()
        sys.exit(0)

    # Sort by date, ticker
    rows_out.sort(key=lambda r: (r["Date"], r["Ticker"]))

    headers = ["Date", "Ticker", "GapPctPoly", "RSI14m", "RelVolPoly"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        w.writerows(rows_out)

    print(f"Wrote {len(rows_out)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
