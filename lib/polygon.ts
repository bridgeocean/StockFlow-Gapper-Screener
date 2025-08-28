const POLY = process.env.POLYGON_API_KEY!;
if (!POLY) {
  console.warn("POLYGON_API_KEY missing – enrichment will be skipped.");
}

type Agg = { t: number; o: number; h: number; l: number; c: number; v: number };

async function polyFetch(path: string): Promise<any> {
  const url = `https://api.polygon.io${path}${path.includes("?") ? "&" : "?"}apiKey=${POLY}`;
  const r = await fetch(url, { cache: "no-store" as any });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function ymd(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfUTCDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

export async function getPrevClose(ticker: string): Promise<number | null> {
  try {
    const j = await polyFetch(`/v2/aggs/ticker/${ticker}/prev`);
    const c = j?.results?.[0]?.c;
    return typeof c === "number" ? c : null;
  } catch { return null; }
}

export async function getDailyAvgVol(ticker: string, days = 30): Promise<number | null> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 40 * 24 * 60 * 60 * 1000);
    const j = await polyFetch(`/v2/aggs/ticker/${ticker}/range/1/day/${ymd(start)}/${ymd(end)}?adjusted=true&sort=desc&limit=120`);
    const arr: Agg[] = (j?.results ?? []).slice(0, days);
    if (!arr.length) return null;
    const avg = arr.reduce((s, a) => s + (a?.v ?? 0), 0) / arr.length;
    return avg || null;
  } catch { return null; }
}

export async function getTodayMinuteAggs(ticker: string): Promise<Agg[]> {
  try {
    const start = startOfUTCDay(); // 00:00 UTC (covers pre/regular)
    const end = new Date();
    const j = await polyFetch(`/v2/aggs/ticker/${ticker}/range/1/min/${ymd(start)}/${ymd(end)}?adjusted=true&sort=asc&limit=50000`);
    return j?.results ?? [];
  } catch { return []; }
}
