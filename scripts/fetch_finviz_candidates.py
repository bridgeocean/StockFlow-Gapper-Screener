# scripts/fetch_finviz_candidates.py
import os
import sys
import io
import json
import requests
import pandas as pd
from pathlib import Path

FINVIZ_EXPORT_URL = os.getenv("FINVIZ_EXPORT_URL", "").strip()
OUT_CSV = Path("public/today_candidates.csv")
OUT_TXT = Path("public/today_tickers.txt")

NEEDED_COLS = ["ticker", "price", "change", "volume", "avg volume"]

def fatal(msg: str, code: int = 1):
    print(f"❌ {msg}")
    sys.exit(code)

def fetch_csv_text(url: str) -> str:
    if not url:
        fatal("FINVIZ_EXPORT_URL not set (GitHub secret).")
    try:
        r = requests.get(url, timeout=60)
        if r.status_code != 200:
            fatal(f"Finviz export HTTP {r.status_code}: {r.text[:200]}")
        return r.text
    except Exception as e:
        fatal(f"Finviz export request failed: {e}")

def read_finviz_csv(csv_text: str) -> pd.DataFrame:
    # handle BOM and odd separators automatically
    bio = io.StringIO(csv_text.lstrip("\ufeff"))
    try:
        df = pd.read_csv(bio, sep=None, engine="python")
    except Exception:
        bio.seek(0)
        df = pd.read_csv(bio)  # fallback default

    # normalize headers (lowercase, strip)
    norm_map = {}
    for c in df.columns:
        cl = c.strip().lower()
        norm_map[c] = cl
    df = df.rename(columns=norm_map)

    # harmonize common variants
    # e.g., "symbol" -> "ticker"; "avg. volume" -> "avg volume"
    rename = {}
    for c in list(df.columns):
        cl = c
        if cl == "symbol":
            rename[c] = "ticker"
        elif cl in ("avg. volume", "average volume", "avgvol", "avg_volume"):
            rename[c] = "avg volume"
        elif cl in ("change %", "change%", "%change"):
            rename[c] = "change"
    if rename:
        df = df.rename(columns=rename)

    return df

def select_and_clean(df: pd.DataFrame) -> pd.DataFrame:
    # Ensure we have a ticker column
    sym_col = None
    for cand in ("ticker", "symbol"):
        if cand in df.columns:
            sym_col = cand
            break
    if sym_col is None:
        # try very defensive search
        for c in df.columns:
            if c.replace(" ", "") in ("ticker", "symbol"):
                sym_col = c
                break
    if sym_col is None:
        fatal(f"today_candidates.csv has no ticker/symbol column. Got columns: {list(df.columns)}")

    # Keep a practical subset if present
    keep = [sym_col]
    for k in ("price", "change", "volume", "avg volume"):
        if k in df.columns:
            keep.append(k)

    df = df[keep].copy()

    # Clean ticker column
    df.rename(columns={sym_col: "ticker"}, inplace=True)
    df["ticker"] = (
        df["ticker"].astype(str).str.strip().str.upper().replace("", pd.NA)
    )
    df = df.dropna(subset=["ticker"]).drop_duplicates(subset=["ticker"]).reset_index(drop=True)

    # Numeric cleanups if columns exist
    for num_col in ("price", "change", "volume", "avg volume"):
        if num_col in df.columns:
            df[num_col] = pd.to_numeric(
                df[num_col]
                    .astype(str)
                    .str.replace(",", "", regex=False)
                    .str.replace("%", "", regex=False),
                errors="coerce"
            )

    return df

def main():
    # fetch
    csv_text = fetch_csv_text(FINVIZ_EXPORT_URL)
    # parse
    df_raw = read_finviz_csv(csv_text)
    if df_raw.empty:
        fatal("Finviz export returned an empty table.", code=0)

    df = select_and_clean(df_raw)

    # Ensure output folder
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)

    # Save CSV
    df_out = df.copy()
    # Order columns: ticker first, then others if present
    cols = ["ticker"] + [c for c in ("price", "change", "volume", "avg volume") if c in df_out.columns]
    df_out = df_out[cols]
    df_out.to_csv(OUT_CSV, index=False)
    print(f"✓ Wrote {OUT_CSV} ({len(df_out)} rows)")

    # Save tickers .txt (one per line)
    tickers = df_out["ticker"].astype(str).tolist()
    OUT_TXT.write_text("\n".join(tickers) + ("\n" if tickers else ""))
    print(f"✓ Wrote {OUT_TXT} ({len(tickers)} tickers)")

if __name__ == "__main__":
    main()
