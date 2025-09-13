#!/usr/bin/env python3
import os, sys, io, json, datetime as dt
from pathlib import Path
import requests
import pandas as pd

NEWS_URL = os.getenv("FINVIZ_NEWS_EXPORT_URL", "").strip()
OUT_DIR = Path("public"); OUT_DIR.mkdir(parents=True, exist_ok=True)
CSV_PATH = OUT_DIR / "today_news.csv"
JSON_PATH = OUT_DIR / "today_news.json"

def fail(m, c=1): print(f"❌ {m}"); sys.exit(c)

def parse_time(s):
    # Finviz news_export returns Date, Time columns (e.g., 09/10/2025, 08:33AM)
    try:
        return dt.datetime.strptime(s, "%m/%d/%Y %I:%M%p").isoformat() + "Z"
    except:
        return None

def main():
    if not NEWS_URL:
        fail("FINVIZ_NEWS_EXPORT_URL not set (GitHub secret).")
    try:
        r = requests.get(NEWS_URL, timeout=30)
    except Exception as e:
        fail(f"Request error: {e}")
    if r.status_code != 200 or not r.content:
        fail(f"Bad response {r.status_code}: {r.text[:200]}")

    try: txt = r.content.decode("utf-8-sig")
    except: txt = r.content.decode("latin1")
    CSV_PATH.write_text(txt, encoding="utf-8")
    print(f"✓ Wrote {CSV_PATH}")

    # Try comma, then semicolon
    try:
        df = pd.read_csv(io.StringIO(txt))
    except Exception:
        df = pd.read_csv(io.StringIO(txt), sep=";")

    cols = {c.lower(): c for c in df.columns}
    # Expected columns commonly: Ticker, Date, Time, Headline, Source, Link
    tcol = cols.get("ticker") or cols.get("symbol") or list(df.columns)[0]
    dcol = cols.get("date")
    ctim = cols.get("time")
    hcol = cols.get("headline") or cols.get("title") or None
    scol = cols.get("source") or None
    lcol = cols.get("link") or cols.get("url") or None

    items = []
    for _, row in df.iterrows():
        ticker = str(row.get(tcol, "")).strip().upper()
        date_s = str(row.get(dcol, "")).strip() if dcol else ""
        time_s = str(row.get(ctim, "")).strip() if ctim else ""
        headline = (str(row.get(hcol, "")) if hcol else "").strip()
        source = (str(row.get(scol, "")) if scol else "").strip()
        link = (str(row.get(lcol, "")) if lcol else "").strip()
        ts = parse_time(f"{date_s} {time_s}") if (date_s and time_s) else None
        items.append({
            "ticker": ticker,
            "headline": headline,
            "source": source or None,
            "link": link or None,
            "datetime": ts
        })

    payload = {
        "generatedAt": dt.datetime.utcnow().isoformat() + "Z",
        "count": len(items),
        "items": items
    }
    JSON_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"✓ Wrote {JSON_PATH} ({len(items)} items)")

if __name__ == "__main__":
    main()
