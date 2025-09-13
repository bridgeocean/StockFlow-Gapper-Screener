#!/usr/bin/env python3
import os, sys, io, json
from pathlib import Path
import requests
import pandas as pd

OUT_DIR = Path("public"); OUT_DIR.mkdir(parents=True, exist_ok=True)
CSV_PATH = OUT_DIR / "today_filings.csv"
JSON_PATH = OUT_DIR / "today_filings.json"

URL_SINGLE = os.getenv("FINVIZ_FILINGS_EXPORT_URL", "").strip()
URL_TPL    = os.getenv("FINVIZ_FILINGS_EXPORT_TEMPLATE", "").strip()  # must contain {ticker}

def fail(msg, code=1): print(f"❌ {msg}"); sys.exit(code)

def load_csv_from_text(txt: str) -> pd.DataFrame:
    try: return pd.read_csv(io.StringIO(txt))
    except Exception: return pd.read_csv(io.StringIO(txt), sep=";")

def normalize_df(df: pd.DataFrame) -> pd.DataFrame:
    # Common Finviz filings columns: Ticker, Filing, Title, Link, FilingDate
    cols = {c.lower(): c for c in df.columns}
    out = pd.DataFrame()
    out["ticker"] = df[cols.get("ticker", list(df.columns)[0])].astype(str).str.upper().str.strip()
    out["filing"] = df[cols.get("filing", cols.get("form", ""))] if cols.get("filing") or cols.get("form") else ""
    out["title"]  = df[cols.get("title", "")] if cols.get("title") else ""
    out["link"]   = df[cols.get("link", cols.get("url",""))] if cols.get("link") or cols.get("url") else ""
    out["date"]   = df[cols.get("filingdate", cols.get("date",""))] if cols.get("filingdate") or cols.get("date") else ""
    return out

def fetch_url(u: str) -> pd.DataFrame:
    r = requests.get(u, timeout=30)
    if r.status_code != 200 or not r.content:
        raise RuntimeError(f"Bad response {r.status_code}: {r.text[:200]}")
    try: txt = r.content.decode("utf-8-sig")
    except: txt = r.content.decode("latin1")
    return load_csv_from_text(txt)

def main():
    if not URL_SINGLE and not URL_TPL:
        print("No filings URL configured. Set FINVIZ_FILINGS_EXPORT_URL or FINVIZ_FILINGS_EXPORT_TEMPLATE.")
        sys.exit(0)

    frames = []
    if URL_SINGLE:
        try:
            df = fetch_url(URL_SINGLE)
            frames.append(df)
            print("✓ Fetched global filings feed")
        except Exception as e:
            fail(f"Filings request error: {e}")

    elif URL_TPL and "{ticker}" in URL_TPL:
        tickers_path = Path("public/today_tickers.txt")
        if not tickers_path.exists():
            fail("today_tickers.txt not found; run candidates first.")
        tickers = [t.strip().upper() for t in tickers_path.read_text().splitlines() if t.strip()]
        for t in tickers[:150]:  # safety cap to avoid hammering
            u = URL_TPL.replace("{ticker}", t)
            try:
                df = fetch_url(u)
                df["Ticker"] = t  # ensure ticker column present
                frames.append(df)
            except Exception as e:
                print(f"… skip {t}: {e}")

    if not frames:
        fail("No filings pulled.")

    big = pd.concat(frames, ignore_index=True)
    norm = normalize_df(big)

    CSV_PATH.write_text(norm.to_csv(index=False), encoding="utf-8")
    print(f"✓ Wrote {CSV_PATH} ({len(norm)} rows)")

    # Simple JSON
    items = norm.to_dict(orient="records")
    payload = { "count": len(items), "items": items }
    JSON_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"✓ Wrote {JSON_PATH}")

if __name__ == "__main__":
    main()
