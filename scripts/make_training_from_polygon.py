# scripts/make_training_from_polygon.py
# Builds a training CSV from Polygon minute data using date-only paths.
# Features: gap_pct, rsi14m, rvol (first 30 min vs. 30-day avg)
# Label: change_open_pct = (10:00 price - 9:30 open) / 9:30 open

import os, sys, time, math, csv
from datetime import datetime, timedelta, timezone, date
from collections import deque, defaultdict
import requests

API_KEY = os.environ.get("POLYGON_API_KEY")
if not API_KEY:
    print("ERROR: POLYGON_API_KEY not set")
    sys.exit(1)

# Inputs (optional). If unset, we clamp to ~last 2y (Polygon minute limit)
TRAIN_START = os.environ.get("TRAIN_START")  # YYYY-MM-DD
TRAIN_END   = os.environ.get("TRAIN_END")    # YYYY-MM-DD

# Universe (edit if you like, or pass via env TRAIN_TICKERS="AAPL,TSLA,...")
TICKERS = [t.strip() for t in os.environ.get("TRAIN_TICKERS", "AAPL,TSLA,AMD,NVDA").split(",") if t.strip()]

OUT_CSV = "training_polygon_v1.csv"

# Regular-session window (UTC) 13:30–20:00 equals 9:30–16:00 ET
OPEN_UTC = (13, 30)
LABEL_CUTOFF_UTC = (14, 0)      # 10:00 ET label point

BASE = "https://api.polygon.io"

def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()

def clamp_to_two_years(start_d, end_d):
    # Polygon roughly keeps ~2 years of minute data
    limit = date.today() - timedelta(days=730)
    if start_d < limit:
        print(f"Requested TRAIN_START {start_d} is older than ~2y minute-history. Clamping to {limit}.")
        start_d = limit
    if end_d > date.today():
        end_d = date.today()
    return start_d, end_d

if TRAIN_START and TRAIN_END:
    start_d = parse_date(TRAIN_START)
    end_d   = parse_date(TRAIN_END)
else:
    end_d = date.today()
    start_d = end_d - timedelta(days=730)

start_d, end_d = clamp_to_two_years(start_d, end_d)
print(f"Window: {start_d} -> {end_d}")
print(f"Universe ({len(TICKERS)}): {', '.join(TICKERS)}")

# ---------- HTTP w/ backoff ----------
def http_get(url, params=None, max_retries=6, backoff_base=0.8, backoff_cap=60.0):
    if params is None:
        params = {}
    params["apiKey"] = API_KEY
    attempt = 0
    while True:
        attempt += 1
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 429:
                # rate-limited
                delay = min(backoff_cap, backoff_base * (2 ** (attempt - 1)))
                time.sleep(delay)
                continue
            r.raise_for_status()
            return r.json()
        except requests.HTTPError as e:
            # 400s here are usually permanent (bad input). Log + break.
            if 400 <= r.status_code < 500 and r.status_code != 429:
                print(f"HTTP {r.status_code} {url} params={params} -> {r.text[:200]}")
                raise
            delay = min(backoff_cap, backoff_base * (2 ** (attempt - 1)))
            if attempt >= max_retries:
                raise
            time.sleep(delay)
        except Exception:
            delay = min(backoff_cap, backoff_base * (2 ** (attempt - 1)))
            if attempt >= max_retries:
                raise
            time.sleep(delay)

# ---------- Polygon helpers ----------
def fetch_day_minutes(ticker, day):
    # IMPORTANT: v2 aggs requires YYYY-MM-DD (no time-of-day)
    # We then filter the minutes we care about in code.
    url = f"{BASE}/v2/aggs/ticker/{ticker}/range/1/minute/{day}/{day}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000}
    js = http_get(url, params=params)
    results = js.get("results") or []
    return results

def ts_to_dt_utc(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)

# RSI (Wilder’s)
def rsi_wilder(closes, period=14):
    if len(closes) < period + 1:
        return None
    gains = []
    losses = []
    for i in range(1, period + 1):
        chg = closes[i] - closes[i - 1]
        gains.append(max(chg, 0))
        losses.append(max(-chg, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    # For exact first value we already used period changes
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))

def within_session(dt, hhmm_from, hhmm_to):
    h1, m1 = hhmm_from
    h2, m2 = hhmm_to
    t = (dt.hour, dt.minute)
    return (t >= hhmm_from) and (t < hhmm_to)

# Track per-ticker rolling 30-day “first 30min” volume for RelVol
rolling_first30 = {t: deque(maxlen=30) for t in TICKERS}
prev_close = {t: None for t in TICKERS}

rows = []

curr = start_d
while curr <= end_d:
    d_str = curr.isoformat()
    for ticker in TICKERS:
        try:
            bars = fetch_day_minutes(ticker, d_str)
        except Exception as e:
            print(f"ERR {d_str} {ticker}: {e}")
            continue

        if not bars:
            # likely weekend / holiday
            continue

        # Split day into session windows
        # Filter only regular session 13:30–20:00 UTC
        reg = [b for b in bars if within_session(ts_to_dt_utc(b["t"]), OPEN_UTC, (20, 0))]
        if not reg:
            continue

        # First bar open (9:30 ET) and 10:00 price for label
        first_bar = reg[0]
        open_930 = first_bar.get("o")
        # Find bar whose time >= 14:00 UTC (10:00 ET). Use the last bar < 14:01 if exact minute missing.
        label_price = None
        for b in reg:
            dt = ts_to_dt_utc(b["t"])
            if (dt.hour, dt.minute) >= LABEL_CUTOFF_UTC:
                label_price = b.get("c")
                break
        if label_price is None:
            # not enough bars; skip
            continue

        # Compute RSI14m on first 15 closes (0..14 minutes from open)
        first_15 = reg[:15]  # 9:30..9:44 inclusive (15 points => 14 changes)
        closes_15 = [b["c"] for b in first_15]
        rsi14 = rsi_wilder(closes_15, period=14)
        if rsi14 is None:
            continue

        # First 30-min volume
        first_30 = reg[:30]
        vol_30 = sum(b.get("v", 0) for b in first_30)
        # RelVol: today 30min / avg previous 30 sessions 30min
        hist = rolling_first30[ticker]
        rvol = None
        if len(hist) >= 5:  # require a bit of history
            avg_hist = sum(hist) / len(hist)
            if avg_hist > 0:
                rvol = vol_30 / avg_hist
        # store today’s first30 for future days
        hist.append(vol_30)

        # Gap vs prior close
        pc = prev_close.get(ticker)
        gap_pct = None
        if pc and pc > 0 and open_930:
            gap_pct = (open_930 - pc) / pc

        # Update prev close for next day (use last bar’s close of today)
        prev_close[ticker] = reg[-1]["c"]

        # Label: change in first 30 min
        if open_930 and open_930 > 0:
            change_open_pct = (label_price - open_930) / open_930
        else:
            change_open_pct = None

        # Only record rows with all 3 features present
        if gap_pct is None or rsi14 is None or rvol is None or change_open_pct is None:
            continue

        rows.append({
            "Date": d_str,
            "Ticker": ticker,
            "GapPctPoly": f"{gap_pct:.6f}",
            "RSI14m": f"{rsi14:.4f}",
            "RelVolPoly": f"{rvol:.4f}",
            "ChangeOpenPct": f"{change_open_pct:.6f}",
        })

        # be gentle to API
        time.sleep(0.15)

    curr += timedelta(days=1)

# Write CSV
with open(OUT_CSV, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["Date","Ticker","GapPctPoly","RSI14m","RelVolPoly","ChangeOpenPct"])
    writer.writeheader()
    for r in rows:
        writer.writerow(r)

print(f"Wrote {len(rows)} rows to {OUT_CSV}")
