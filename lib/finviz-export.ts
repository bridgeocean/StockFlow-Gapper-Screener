import Papa from "papaparse";

const EXPORT_URL = process.env.FINVIZ_EXPORT_URL!;
if (!EXPORT_URL) throw new Error("FINVIZ_EXPORT_URL is missing.");

function toNumber(x: any) {
  if (x === null || x === undefined) return undefined;
  const s = String(x).replace(/[%,$ ]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
function key(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

/** Fetches the CSV from Finviz Elite and returns normalized rows. */
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

    rows.push({
      raw: r,
      ticker: o.ticker || o.symbol,
      price: toNumber(o.price),
      change_pct: toNumber(o.change || o.changepct || o.changepercent),
      relative_volume: toNumber(o.relativevolume || o.rvol || o.relvolume),
      float_shares_m: toNumber(o.float || o.sharesfloat || o.floatshares),
      rsi: toNumber(o.rsi || o.rsi14),
      sector: o.sector,
      company: o.company
    });
  }
  return rows;
}
