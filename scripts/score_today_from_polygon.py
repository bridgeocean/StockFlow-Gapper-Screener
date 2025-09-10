# scripts/score_today_from_polygon.py
import os, json, math, time
from pathlib import Path
from datetime import datetime, timedelta, timezone

import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import numpy as np

# Optional: model for ranking
try:
    import joblib
except Exception:
    joblib = None

# -----------------------------
# ENV & helpers
# -----------------------------
API_KEY = os.getenv("POLYGON_API_KEY", "").strip()
if not API_KEY:
    raise SystemExit("POLYGON_API_KEY is required")

UNIVERSE_SOURCE = os.getenv("UNIVERSE_SOURCE", "FINVIZ_FILE").upper()  # FINVIZ_FILE | EXPLICIT | AUTO
FINVIZ_FILE_PATH = os.getenv("FINVIZ_FILE_PATH", "public/finviz_universe.json")
STRICT_FINVIZ = os.getenv("STRICT_FINVIZ", "true").lower() == "true"

PRICE_MIN = float(os.getenv("PRICE_MIN", "1"))
PRICE_MAX = float(os.getenv("PRICE_MAX", "5"))
MAX_TICKERS = int(os.getenv("MAX_TICKERS", "100"))

MODEL_PATH = os.getenv("MODEL_PATH", "models/ai_score.joblib")
OUT_PATH = os.getenv("OUT_PATH", "public/today_scores.json")

SESSION = requests.Session()
BASE = "https://api.polygon.io"

def env_tz_now_utc():
    # Simple UTC "now"
    return datetime.now(timezone.utc)

def last_trading_day_utc(d: datetime) -> datetime:
    # Reduce to a weekday (Mon-Fri)
    dd = d
    while dd.weekday() >= 5:  # 5=Sat, 6=Sun
        dd = dd - timedelta(days=1)
    return dd

def trading_day_bounds_utc(d_utc: datetime):
    """Return (0930ET, nowUTC) as UTC datetimes for the given date."""
    # 09:30 ET = 13:30 UTC when ET is standard time; 13:30 or 13:30? (DST). For robust cron use market calendar.
    # We'll anchor to 13:30 UTC as a reasonable approximation for intraday scoring.
    day = d_utc.date()
    start_utc = datetime(day.year, day.month, day.day, 13, 30, tzinfo=timezone.utc)
    end_utc = d_utc
    if end_utc < start_utc:
        end_utc = start_utc + timedelta(minutes=1)
    return start_utc, end_utc

def date_str(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")

def percent(n):
    if n is None or (isinstance(n, float) and math.isnan(n)): return None
    return float(n) * 100.0

class HttpError(Exception): pass

@retry(
    reraise=True,
    stop=stop_after_attempt(6),
    wait=wait_exponential(multiplier=0.75, min=1, max=40),
    retry=retry_if_exception_type(HttpError),
)
def get_json(path: str, params: dict = None) -> dict:
    url = f"{BASE}{path}"
    qp = params.copy() if params else {}
    qp["apiKey"] = API_KEY
    r = SESSION.get(url, params=qp, timeout=30)
    if r.status_code >= 500:
        raise HttpError(f"5xx from Polygon: {r.status_code}")
    if r.status_code == 429:
        raise HttpError("429 rate limited")
    if not r.ok:
        # Bubble a readable error
        raise HttpError(f"{r.status_code}: {r.text[:200]}")
    return r.json()

# -----------------------------
# Universe resolution
# -----------------------------
def universe_from_finviz_file(path: str) -> list[str]:
    p = Path(path)
    if not p.exists(): return []
    try:
        data = json.loads(p.read_text())
        if isinstance(data, dict) and "tickers" in data:
            arr = data["tickers"] or []
        elif isinstance(data, list):
            arr = data
        else:
            arr = []
        out = []
        for x in arr:
            s = str(x).strip().upper()
            if s:
                out.append(s)
        return out
    except Exception:
        return []

def universe_from_explicit_env() -> list[str]:
    u = os.getenv("UNIVERSE", "").strip()
    if not u: return []
    try:
        if u.startswith("["):  # JSON list
            arr = json.loads(u)
        else:
            arr = [t.strip().upper() for t in u.split(",")]
        return [t for t in arr if t]
    except Exception:
        return []

def resolve_universe() -> list[str]:
    if UNIVERSE_SOURCE == "FINVIZ_FILE":
        arr = universe_from_finviz_file(FINVIZ_FILE_PATH)
        if arr: return arr[:MAX_TICKERS]
    # Fallback to explicit
    arr2 = universe_from_explicit_env()
    if arr2: return arr2[:MAX_TICKERS]
    # Last resort tiny default
    return ["AAPL", "TSLA", "AMD", "NVDA"][:MAX_TICKERS]

# -----------------------------
# Polygon feature building
# -----------------------------
def fetch_prev_close(ticker: str) -> float | None:
    j = get_json(f"/v2/aggs/ticker/{ticker}/prev", params={"adjusted": "true"})
    # Schema: results[0]['c'] is close
    res = j.get("results") or []
    if not res: return None
    return float(res[0].get("c"))

def fetch_minutes_today(ticker: str, start_utc: datetime, end_utc: datetime) -> list[dict]:
    # Use date-only for path bounds (Polygon accepts YYYY-MM-DD)
    j = get_json(
        f"/v2/aggs/ticker/{ticker}/range/1/minute/{date_str(start_utc)}/{date_str(end_utc)}",
        params={"adjusted": "true", "limit": 50000},
    )
    return j.get("results") or []

def fetch_daily_window(ticker: str, start_date: datetime, end_date: datetime) -> list[dict]:
    j = get_json(
        f"/v2/aggs/ticker/{ticker}/range/1/day/{date_str(start_date)}/{date_str(end_date)}",
        params={"adjusted": "true", "limit": 120},
    )
    return j.get("results") or []

def rsi_wilder(closes: np.ndarray, period: int = 14) -> float | None:
    if closes is None or len(closes) < period + 1:
        return None
    diffs = np.diff(closes)
    gains = np.where(diffs > 0, diffs, 0.0)
    losses = np.where(diffs < 0, -diffs, 0.0)
    avg_gain = gains[:period].mean()
    avg_loss = losses[:period].mean()
    if period < len(gains):
        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return float(rsi)

def compute_features_for_ticker(ticker: str, today_utc: datetime) -> dict | None:
    # 1) previous close
    prev_c = fetch_prev_close(ticker)
    if prev_c is None or prev_c <= 0:
        return None

    # 2) minutes from regular session today
    start_utc, end_utc = trading_day_bounds_utc(today_utc)
    mins = fetch_minutes_today(ticker, start_utc, end_utc)
    if not mins:
        return None

    # Convert to arrays
    # Polygon minute: t(ms), o,h,l,c,v
    ts = np.array([int(m["t"]) for m in mins], dtype=np.int64)
    closes = np.array([float(m.get("c", np.nan)) for m in mins], dtype=np.float64)
    opens = np.array([float(m.get("o", np.nan)) for m in mins], dtype=np.float64)
    vols = np.array([float(m.get("v", 0.0)) for m in mins], dtype=np.float64)

    # 2a) first regular minute at/after 13:30 UTC
    # Filter minutes to today's date and >= 13:30 UTC
    # (We fetched day bounds with date-only, but still guard)
    first_open = None
    start_ms = int(start_utc.timestamp() * 1000)
    idx = np.where(ts >= start_ms)[0]
    if idx.size > 0:
        first_i = int(idx[0])
        if 0 <= first_i < len(opens):
            first_open = float(opens[first_i])

    if first_open is None or not np.isfinite(first_open):
        return None

    gap_pct = percent((first_open - prev_c) / prev_c)

    # 2b) RSI(14m) on minute closes (regular session only)
    # Use only minutes >= start
    if idx.size > 0:
        closes_rs = closes[idx[0]:]
    else:
        closes_rs = closes
    closes_rs = closes_rs[np.isfinite(closes_rs)]
    rsi14m = rsi_wilder(closes_rs, period=14)
    if rsi14m is None:  # not enough data, fallback small window
        return None

    # 2c) Relative Volume:
    # Approximate: cum volume so far / (avg daily vol * elapsedMinutes/390)
    elapsed_min = max(1, int((end_utc - start_utc).total_seconds() // 60))
    cum_vol = float(np.nansum(vols[idx[0]:])) if idx.size > 0 else float(np.nansum(vols))
    days30_start = today_utc - timedelta(days=45)
    daily = fetch_daily_window(ticker, days30_start, today_utc)
    dv = [float(d.get("v", 0.0)) for d in daily if d.get("v") is not None]
    avg_dv = float(np.mean(dv)) if dv else 0.0
    expected = (avg_dv * (elapsed_min / 390.0)) if avg_dv > 0 else np.nan
    rvol = float(cum_vol / expected) if expected and expected > 0 else np.nan

    if not np.isfinite(rvol):
        rvol = None

    return {
        "gap_pct": float(gap_pct),
        "rsi14m": float(rsi14m),
        "rvol": None if rvol is None else float(rvol),
        "prev_close": float(prev_c),
        "open_0930": float(first_open),
    }

# -----------------------------
# Model scoring
# -----------------------------
def load_model(path: str):
    if joblib is None:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        return joblib.load(p)
    except Exception:
        return None

def score_rows(model, rows):
    """rows: list of dicts with gap_pct, rvol, rsi14m. Adds 'score' to each; returns sorted by score desc."""
    if not rows:
        return []
    X = []
    keep = []
    for r in rows:
        if r.get("gap_pct") is None or r.get("rvol") is None or r.get("rsi14m") is None:
            continue
        X.append([float(r["gap_pct"]), float(r["rvol"]), float(r["rsi14m"])])
        keep.append(r)

    if not X:
        return []

    X = np.asarray(X, dtype=np.float64)

    # If model missing, do a simple, transparent fallback score
    if model is None:
        # Normalize to 0..1-ish; higher gap, rvol, and rsi near 50 are better
        g = (np.clip(X[:,0], -40, 40) + 40) / 80.0
        v = np.clip(X[:,1], 0, 10) / 10.0
        r = 1.0 - (np.abs(X[:,2] - 50.0) / 50.0)  # peak at 50
        s = 0.5*g + 0.3*v + 0.2*r
    else:
        try:
            if hasattr(model, "predict_proba"):
                s = model.predict_proba(X)[:,1]
            else:
                s = model.decision_function(X)
                # map roughly to 0..1 for readability
                s = 1/(1+np.exp(-s))
        except Exception:
            # very defensive
            s = np.zeros(len(keep), dtype=np.float64)

    for i, r in enumerate(keep):
        r["score"] = float(s[i])

    keep.sort(key=lambda z: z.get("score", 0.0), reverse=True)
    # assign ranks
    for i, r in enumerate(keep, start=1):
        r["rank"] = i
    return keep

# -----------------------------
# Main
# -----------------------------
def main():
    now_utc = env_tz_now_utc()
    today_utc = last_trading_day_utc(now_utc)
    start_utc, end_utc = trading_day_bounds_utc(today_utc)

    tickers = resolve_universe()
    if not tickers:
        print("No universe to score; exiting.")
        return

    # If STRICT_FINVIZ, ignore local price filter
    pmin = float("-inf") if STRICT_FINVIZ else PRICE_MIN
    pmax = float("inf") if STRICT_FINVIZ else PRICE_MAX

    rows = []
    for t in tickers[:MAX_TICKERS]:
        try:
            feats = compute_features_for_ticker(t, today_utc)
            if not feats:
                continue
            prev_close = float(feats["prev_close"])
            if not (pmin <= prev_close <= pmax):
                # price band check
                continue

            rows.append({
                "ticker": t,
                "date": date_str(today_utc),
                "gap_pct": feats["gap_pct"],  # percent units
                "rsi14m": feats["rsi14m"],
                "rvol": feats["rvol"],
            })
        except Exception as e:
            # Keep going per-ticker
            print(f"[WARN] {t}: {e}")

    model = load_model(MODEL_PATH)
    ranked = score_rows(model, rows)

    out = {
        "generated_utc": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "asof_date_utc": date_str(today_utc),
        "universe": len(tickers),
        "rows": ranked
    }

    out_path = Path(OUT_PATH)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote {out_path} with {len(ranked)} rows.")

if __name__ == "__main__":
    main()
