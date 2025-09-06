# scripts/make_training_from_polygon.py
import os, sys, time, math, random, json
from datetime import datetime, timedelta, timezone
import requests
import pandas as pd
import numpy as np

# ----------------------------
# helpers
# ----------------------------
POLY = "https://api.polygon.io"
API_KEY = os.environ.get("POLYGON_API_KEY", "").strip()
if not API_KEY:
    print("ERR: POLYGON_API_KEY is not set")
    sys.exit(1)

# default window ≈ last 2y (Polygon minute limit)
TRAIN_START = os.environ.get("TRAIN_START", "")
TRAIN_END   = os.environ.get("TRAIN_END", "")
today = datetime.now(timezone.utc).date()

if not TRAIN_END:
    TRAIN_END = today.isoformat()
if not TRAIN_START:
    # ~2y clamp
    TRAIN_START = (today - timedelta(days=730)).isoformat()

start_date = datetime.fromisoformat(TRAIN_START).date()
end_date   = datetime.fromisoformat(TRAIN_END).date()
if (today - start_date).days > 730:
    clamp = (today - timedelta(days=730)).isoformat()
    print(f"Requested TRAIN_START {TRAIN_START} is older than ~2y minute-history. Clamping to {clamp}.")
    start_date = datetime.fromisoformat(clamp).date()

print(f"Window: {start_date} → {end_date}")

def load_universe(path="scripts/universe.txt"):
    if not os.path.exists(path):
        # small default universe
        return ["AAPL", "TSLA", "AMD", "NVDA", "MSFT", "META"]
    with open(path, "r") as f:
        return [ln.strip().upper() for ln in f if ln.strip() and not ln.startswith("#")]

UNIVERSE = load_universe()
print(f"Universe ({len(UNIVERSE)}): {', '.join(UNIVERSE[:20])}{'…' if len(UNIVERSE)>20 else ''}")

session = requests.Session()

def backoff_sleep(attempt):
    # exponential backoff + jitter, capped
    base = min(60, (2 ** attempt))
    time.sleep(base + random.uniform(0, 1.0))

def get_json(path, params=None, max_attempts=8):
    if params is None:
        params = {}
    params["apiKey"] = API_KEY
    url = f"{POLY}{path}"
    attempt = 0
    while True:
        try:
            r = session.get(url, params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            # retry on 429 + 5xx
            if r.status_code in (429, 500, 502, 503, 504):
                attempt += 1
                if attempt >= max_attempts:
                    raise RuntimeError(f"too many retries ({r.status_code})")
                backoff_sleep(attempt)
                continue
            # 400/other: raise immediately with message
            raise RuntimeError(f"{r.status_code} Client Error: {r.text[:180]}")
        except Exception as e:
            attempt += 1
            if attempt >= max_attempts:
                raise
            backoff_sleep(attempt)

def list_business_days(d0, d1):
    cur = d0
    while cur <= d1:
        # crude NYSE weekday filter (skip Sat/Sun); holidays return empty data (we skip later)
        if cur.weekday() < 5:
            yield cur
        cur = cur + timedelta(days=1)

def rsi(series, period=14):
    s = pd.Series(series, dtype="float64")
    delta = s.diff()
    up = delta.clip(lower=0)
    down = -1 * delta.clip(upper=0)
    ma_up = up.rolling(window=period, min_periods=period).mean()
    ma_down = down.rolling(window=period, min_periods=period).mean()
    rs = ma_up / (ma_down.replace(0, np.nan))
    out = 100 - (100 / (1 + rs))
    return out.iloc[-1] if not out.empty else np.nan

def get_prev_close(ticker, the_date):
    # previous trading day's close using Polygon "previous close"
    data = get_json(f"/v2/aggs/ticker/{ticker}/prev", {"adjusted": "true"})
    result = data.get("results", [])
    if not result:
        return np.nan
    return float(result[0].get("c", np.nan))

def get_last_30d_avg_volume(ticker, the_date):
    # daily vols from the 30 sessions prior to the_date (exclude current day)
    end = (the_date - timedelta(days=1)).isoformat()
    start = (the_date - timedelta(days=60)).isoformat()  # wide range, Polygon returns only trading days
    data = get_json(
        f"/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}",
        {"adjusted": "true", "sort": "asc", "limit": 50000},
    )
    res = data.get("results", [])
    vols = [float(x.get("v", 0)) for x in res[-30:]]  # last 30 sessions
    if not vols:
        return np.nan
    return float(np.mean(vols))

def get_minutes_regular(ticker, the_date):
    # 09:30–16:00 ET == 13:30–20:00 UTC
    start = datetime(the_date.year, the_date.month, the_date.day, 13, 30, tzinfo=timezone.utc)
    end   = datetime(the_date.year, the_date.month, the_date.day, 20,  0, tzinfo=timezone.utc)
    data = get_json(
        f"/v2/aggs/ticker/{ticker}/range/1/minute/{start.isoformat().replace('+00:00','Z')}/{end.isoformat().replace('+00:00','Z')}",
        {"adjusted": "true", "sort": "asc", "limit": 50000},
    )
    res = data.get("results", [])
    if not res:
        return []
    # normalize into simple dicts
    out = []
    for r in res:
        out.append({
            "t": int(r.get("t")),         # ms since epoch
            "o": float(r.get("o", np.nan)),
            "h": float(r.get("h", np.nan)),
            "l": float(r.get("l", np.nan)),
            "c": float(r.get("c", np.nan)),
            "v": float(r.get("v", 0.0)),
        })
    return out

def compute_row(ticker, d):
    mins = get_minutes_regular(ticker, d)
    if not mins or len(mins) < 31:  # need at least 30+ bars for 30-min label
        return None

    first = mins[0]
    prev_close = get_prev_close(ticker, d)
    if not (isinstance(prev_close, (int, float)) and prev_close > 0):
        return None

    # gap vs prev close
    gap_pct = ((first["o"] - prev_close) / prev_close) * 100.0

    # rsi on closes (full session)
    rsi14m = rsi([m["c"] for m in mins], 14)

    # relative volume (total day vs 30d avg)
    cum_vol = sum(m["v"] for m in mins)
    avg30   = get_last_30d_avg_volume(ticker, d)
    rvol = (cum_vol / avg30) if (avg30 and avg30 > 0) else np.nan

    # label: first 30 minutes change from open
    # pick minute that ends at 10:00 ET (≈ 14:00 UTC). Use the last bar <= 14:00 utc
    ten_utc = datetime(d.year, d.month, d.day, 14, 0, tzinfo=timezone.utc).timestamp() * 1000.0
    close_10 = None
    for m in mins:
        if m["t"] <= ten_utc:
            close_10 = m["c"]
        else:
            break
    if close_10 is None or first["o"] <= 0:
        return None
    change_open_pct = ((close_10 - first["o"]) / first["o"]) * 100.0

    return {
        "date": d.isoformat(),
        "ticker": ticker,
        "gap_pct": round(gap_pct, 5),
        "rsi14m": round(float(rsi14m), 5) if pd.notna(rsi14m) else np.nan,
        "rvol": round(float(rvol), 5) if pd.notna(rvol) else np.nan,
        "change_open_pct": round(change_open_pct, 5),
    }

# ----------------------------
# main
# ----------------------------
rows = []
skipped = 0

for t in UNIVERSE:
    cur = start_date
    while cur <= end_date:
        if cur.weekday() < 5:
            try:
                row = compute_row(t, cur)
                if row:
                    rows.append(row)
            except Exception as e:
                # keep going; these were the "too many retries" before
                print(f"ERR {cur} {t}: {e}")
        cur += timedelta(days=1)

df = pd.DataFrame(rows)
if df.empty:
    print("Wrote 0 rows to training_polygon_v1.csv (no data).")
    df.to_csv("training_polygon_v1.csv", index=False)
    sys.exit(0)

# drop rows with missing key features/label
df = df.dropna(subset=["gap_pct", "rsi14m", "rvol", "change_open_pct"])
df = df.sort_values(["date", "ticker"])
df.to_csv("training_polygon_v1.csv", index=False)
print(f"Wrote {len(df):,} rows to training_polygon_v1.csv")
