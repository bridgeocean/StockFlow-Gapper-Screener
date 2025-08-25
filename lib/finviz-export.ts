// lib/finviz-export.ts
import Papa from "papaparse";

const EXPORT_URL = process.env.FINVIZ_EXPORT_URL!;
if (!EXPORT_URL) throw new Error("FINVIZ_EXPORT_URL is missing.");

function key(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function parseNumberLoose(x: any) {
  if (x === null || x === undefined) return undefined;
  let s = String(x).trim();

  // 9.54M, 825.3K, 1.2B, etc.
  const m = s.match(/^(-?\d+(?:\.\d+)?)([kmbt])$/i);
  if (m) {
    const n = parseFloat(m[1]);
    const suf = m[2].toUpperCase();
    const mult = suf === "K" ? 1e3 : suf === "M" ? 1e6 : suf === "B" ? 1e9 : 1e12;
    return n * mult;
  }

  // strip commas, %, $, spaces
  s = s.replace(/[,%$\s,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Your CSV columns: ticker,price,change,relativevolume,float,rsi,performance,Gap,sector,company
 */
export async function fetchFinvizExport(): Promise<Array<any>> {
  const res = await fetch(EXPORT_URL, { cache: "no-store" as any });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Finviz export failed: ${res.status} ${txt?.slice(0,200)}`);
  }

  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) throw new Error("CSV parse error: " + parsed.errors[0].message);

  const rows: any[] = [];
  for (const r of parsed.data as any[]) {
    const o: any = {};
    for (const k of Object.keys(r)) o[key(k)] = r[k];

    const price            = parseNumberLoose(o.price);
    const change_pct       = parseNumberLoose(o.change);       // daily %
    const gap_pct          = parseNumberLoose(o.gap);          // "Gap" column
    const perf_today_pct   = parseNumberLoose(o.performance);  // today performance
    const relative_volume  = parseNumberLoose(o.relativevolume);
    const float_shares     = parseNumberLoose(o.float);        // absolute shares
    const rsi              = parseNumberLoose(o.rsi);

    rows.push({
      raw: r,
      ticker: o.ticker || o.symbol,
      price,
      change_pct,
      gap_pct,
      perf_today_pct,
      relative_volume,
      float_shares,
      rsi,
      sector: o.sector,
      company: o.company
    });
  }
  return rows;
}
