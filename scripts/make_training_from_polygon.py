import os, math, time, csv, sys
from datetime import datetime, timedelta, timezone
import requests
from pathlib import Path

POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY")
if not POLYGON_API_KEY:
    print("Set POLYGON_API_KEY in your environment")
    sys.exit(1)

BASE = "https://api.polygon.io"

def get_json(u, params=None, sleep=0.25):
    if params is None: params = {}
    params["apiKey"] = POLYGON_API_KEY
    for _ in range(5):
        r = requests.get(u, params=params, timeout=30)
        if r.status_code == 429:
            time.sleep(1.0)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("too many retries")

def polygon_agg_minutes(ticker, start_iso, end_iso):
    url = f"{BASE}/v2/aggs/ticker/{ticker}/range/1/minute/{start_iso}/{end_iso}"
    data = get_json(url, {"adjusted":"true", "sort":"asc", "limit":50000})
    return data.get("results", []) or []

def polygon_agg_days(ticker, start_iso, end_iso, limit=200):
    url = f"{BASE}/v2/aggs/ticker/{ticker}/range/1/day/{start_iso}/{end_iso}"
    data = get_json(url, {"adjusted":"true", "sort":"asc", "limit":limit})
    return data.get("results", []) or []

def dt_utc(y,m,d,h=0,mi=0):
    return datetime(y,m,d,h,mi,tzinfo=timezone.utc)

def iso(d):
    return d.isoformat().replace("+00:00","Z")

def rsi_series(closes, period=14):
    if len(closes) < period+1: return [None]*len(closes)
    gains, losses = [], []
    out = [None]*len(closes)
    for i in range(1, period+1):
        ch = closes[i]-closes[i-1]
        gains.append(max(ch,0)); losses.append(abs(min(ch,0)))
    avg_gain = sum(gains)/period
    avg_loss = sum(losses)/period
    out[period] = 100 - 100/(1 + (avg_gain/(avg_loss if avg_loss>0 else 1e-12)))
    for i in range(period+1, len(closes)):
        ch = closes[i]-closes[i-1]
        gain = max(ch,0); loss = abs(min(ch,0))
        avg_gain = (avg_gain*(period-1)+gain)/period
        avg_loss = (avg_loss*(period-1)+loss)/period
        rs = (avg_gain/(avg_loss if avg_loss>0 else 1e-12))
        out[i] = 100 - 100/(1+rs)
    return out

def build_examples_for_day(ticker, day):
    start = dt_utc(day.year, day.month, day.day, 13, 30)  # 09:30 ET
    end   = dt_utc(day.year, day.month, day.day, 20, 0)   # 16:00 ET
    prev_close_day = day - timedelta(days=1)
    prev_day_start = dt_utc(prev_close_day.year, prev_close_day.month, prev_close_day.day)
    prev_day_end   = dt_utc(prev_close_day.year, prev_close_day.month, prev_close_day.day, 23, 59)

    mins = polygon_agg_minutes(ticker, iso(start), iso(end))
    if not mins: return []

    d0 = day - timedelta(days=40)
    days = polygon_agg_days(ticker, iso(dt_utc(d0.year,d0.month,d0.day)), iso(end))
    vols = [d["v"] for d in days[-20:]] if days else []
    avg_vol20 = sum(vols)/len(vols) if vols else None

    prev_days = polygon_agg_days(ticker, iso(prev_day_start), iso(prev_day_end))
    prev_close = prev_days[-1]["c"] if prev_days else None

    ts = [datetime.fromtimestamp(m["t"]/1000, tz=timezone.utc) for m in mins]
    close = [m["c"] for m in mins]
    high  = [m["h"] for m in mins]
    vol   = [m["v"] for m in mins]

    open0930 = close[0]

    cumv = []
    acc=0
    for v in vol:
        acc += v
        cumv.append(acc)

    rsi14 = rsi_series(close, period=14)

    out=[]
    for i in range(len(mins)):
        j_end = i + 30
        if j_end >= len(mins): break
        if ts[i].minute % 5 != 0: continue

        price_now = close[i]
        elapsed_min = i+1
        rvol = None
        if avg_vol20 and avg_vol20>0:
            rvol = (cumv[i] / (avg_vol20 * max(elapsed_min/390.0, 1e-6)))

        gap_pct = None
        if prev_close and prev_close>0:
            gap_pct = ((open0930 - prev_close)/prev_close)*100.0

        change_open_pct = ((price_now - open0930)/open0930)*100.0 if open0930>0 else None
        rsi_val = rsi14[i] if rsi14[i] is not None else None

        future_max_high = max(high[i:j_end+1])
        success_30m = 1 if price_now>0 and (future_max_high/price_now - 1.0) >= 0.02 else 0

        out.append({
            "ticker": ticker,
            "ts": ts[i].isoformat().replace("+00:00","Z"),
            "price": price_now,
            "change_open_pct": change_open_pct,
            "gap_pct": gap_pct,
            "rvol": rvol,
            "rsi14m": rsi_val,
            "success_30m": success_30m
        })
    return out

def main():
    # read tickers
    tickers = []
    path = Path("scripts/universe.txt")
    if path.exists():
        tickers = [x.strip().upper() for x in path.read_text().splitlines() if x.strip()]
    if not tickers:
        tickers = ["AAPL","TSLA","AMD","NVDA"]

    # read date window from env (UTC)
    start_env = os.environ.get("TRAIN_START", "2025-06-01")
    end_env   = os.environ.get("TRAIN_END",   "2025-08-30")
    start_date = datetime.fromisoformat(start_env).replace(tzinfo=timezone.utc)
    end_date   = datetime.fromisoformat(end_env).replace(tzinfo=timezone.utc)

    all_rows=[]
    day = start_date
    while day <= end_date:
        if day.weekday() < 5:
            for t in tickers:
                try:
                    rows = build_examples_for_day(t, day)
                    all_rows.extend(rows)
                    print(f"{day.date()} {t}: +{len(rows)}")
                except Exception as e:
                    print(f"ERR {day.date()} {t}: {e}")
                    time.sleep(0.2)
        day += timedelta(days=1)

    out = "training_polygon_v1.csv"
    with open(out,"w",newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "ticker","ts","price","change_open_pct","gap_pct","rvol","rsi14m","success_30m"
        ])
        w.writeheader()
        for r in all_rows:
            w.writerow(r)
    print(f"Wrote {len(all_rows)} rows -> {out}")

if __name__=="__main__":
    main()
