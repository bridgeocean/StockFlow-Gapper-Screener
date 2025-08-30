// lib/polygon.ts
const POLY = process.env.POLYGON_API_KEY!;
type Agg = { t: number; o: number; h: number; l: number; c: number; v: number };

async function polyFetch(path: string): Promise<any> {
  if (!POLY) throw new Error("POLYGON_API_KEY missing");
  const url = `https://api.polygon.io${path}${path.includes("?") ? "&" : "?"}apiKey=${POLY}`;
  const r = await fetch(url, { cache: "no-store" as any });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export async function getPrevClose(ticker: string): Promise<number | null> {
  try { const j = await polyFetch(`/v2/aggs/ticker/${ticker}/prev`); return j?.results?.[0]?.c ?? null; }
  catch { return null; }
}

export async function getDailyAvgVol(ticker: string, days = 30): Promise<number | null> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 40 * 24 * 60 * 60 * 1000);
    const j = await polyFetch(`/v2/aggs/ticker/${ticker}/range/1/day/${ymd(start)}/${ymd(end)}?adjusted=true&sort=desc&limit=120`);
    const arr: Agg[] = (j?.results ?? []).slice(0, days);
    if (!arr.length) return null;
    return arr.reduce((s, a) => s + (a?.v ?? 0), 0) / arr.length;
  } catch { return null; }
}

export async function getTodayMinuteAggs(ticker: string): Promise<Agg[]> {
  try {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const j = await polyFetch(`/v2/aggs/ticker/${ticker}/range/1/min/${ymd(start)}/${ymd(new Date())}?adjusted=true&sort=asc&limit=50000`);
    return j?.results ?? [];
  } catch { return []; }
}
