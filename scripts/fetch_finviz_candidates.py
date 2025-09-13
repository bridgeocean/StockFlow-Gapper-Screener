#!/usr/bin/env python3
import os, sys, io, json
from pathlib import Path
import requests
import pandas as pd

FINVIZ_URL = os.getenv("FINVIZ_EXPORT_URL", "").strip()
OUT_DIR = Path("public"); OUT_DIR.mkdir(parents=True, exist_ok=True)
CSV_PATH = OUT_DIR / "today_candidates.csv"
TICKERS_PATH = OUT_DIR / "today_tickers.txt"

def fail(msg, code=1): print(f"❌ {msg}"); sys.exit(code)

def main():
    if not FINVIZ_URL:
        fail("FINVIZ_EXPORT_URL not set (GitHub secret).")
    try:
        r = requests.get(FINVIZ_URL, timeout=30)
    except Exception as e:
        fail(f"Request error: {e}")
    if r.status_code != 200 or not r.content:
        fail(f"Bad response {r.status_code}: {r.text[:200]}")

    # Handle BOM/encoding
    try: txt = r.content.decode("utf-8-sig")
    except: txt = r.content.decode("latin1")

    CSV_PATH.write_text(txt, encoding="utf-8")
    print(f"✓ Wrote {CSV_PATH}")

    # Extract tickers
    try:
        df = pd.read_csv(io.StringIO(txt))
    except Exception:
        df = pd.read_csv(io.StringIO(txt), sep=";")
    cols = [c.strip().lower() for c in df.columns]
    sym_col = "ticker" if "ticker" in cols else ("symbol" if "symbol" in cols else df.columns[0])
    tickers = (
        df[sym_col].astype(str).str.strip().str.upper().replace("", pd.NA).dropna().unique().tolist()
    )
    TICKERS_PATH.write_text("\n".join(tickers) + "\n", encoding="utf-8")
    print(f"✓ Wrote {TICKERS_PATH} ({len(tickers)} tickers)")

    print(json.dumps({"rows": int(len(df)), "tickers": int(len(tickers))}, indent=2))

if __name__ == "__main__":
    main()
