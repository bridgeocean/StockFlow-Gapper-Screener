import { NextResponse } from "next/server";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL!;
const FINVIZ_NEWS_EXPORT_URL =
  process.env.FINVIZ_NEWS_EXPORT_URL || process.env.FINVIZ_EXPORT_URL;

const redis = new Redis(REDIS_URL);

type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO
  tag?: string;
};

type Payload = { generatedAt: string | null; items: NewsItem[] };

function splitCSV(line: string, delim: string) {
  const re = new RegExp(`${delim}(?![^"]*"[^"]*(?:"[^"]*"[^"]*)*$)`);
  return line.split(re).map((s) => s.replace(/^"|"$/g, "").trim());
}
function tagFromHeadline(h?: string) {
  if (!h) return;
  const t = h.toUpperCase();
  if (/\bFDA\b/.test(t)) return "FDA";
  if (/EARNINGS|EPS|REVENUE|GUIDANCE|RESULTS/.test(t)) return "Earnings";
  if (/OFFERING|PRICED|WARRANT/.test(t)) return "Offering";
  if (/MERGER|ACQUIR|TAKEOVER|BUYOUT/.test(t)) return "M&A";
  if (/PARTNERSHIP|COLLABORATION/.test(t)) return "Partner";
  if (/UPGRADE|DOWNGRADE|INITIAT/.test(t)) return "Analyst";
}
function parseTime(dateStr?: string, timeStr?: string) {
  if (dateStr && timeStr) {
    const s = `${dateStr.trim()} ${timeStr.trim()}`;
    const ms = Date.parse(s);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (timeStr) {
    const hhmm = timeStr.replace(/\s+/g, "");
    const ms2 = Date.parse(`1970-01-01T${hhmm}Z`);
    if (Number.isFinite(ms2)) return new Date(ms2).toISOString();
  }
  return undefined;
}

async function fetchFinviz(tickers: string[]): Promise<NewsItem[]> {
  if (!FINVIZ_NEWS_EXPORT_URL) return [];
  const res = await fetch(FINVIZ_NEWS_EXPORT_URL, { cache: "no-store" as any });
  if (!res.ok) return [];

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0];
  const delim =
    (header.match(/;/g)?.length || 0) > (header.match(/,/g)?.length || 0)
      ? ";"
      : ",";
  const cols = splitCSV(header, delim).map((h) => h.toLowerCase());
  const key = (s: string) => s.toLowerCase().replace(/\s+|\(|\)|\./g, "");
  const idx: Record<string, number> = {};
  cols.forEach((h, i) => (idx[key(h)] = i));

  const iTicker =
    idx["ticker"] ?? idx["tickers"] ?? idx["symbol"] ?? idx["symbols"] ?? null;
  const iDate = idx["date"] ?? null;
  const iTime = idx["time"] ?? null;
  const iHead = idx["headline"] ?? idx["title"] ?? null;
  const iSrc = idx["source"] ?? null;
  const iUrl = idx["link"] ?? idx["url"] ?? idx["articleurl"] ?? null;

  const want = (v: any) => (v == null || v === "" ? undefined : String(v));
  const set = new Set(tickers.map((t) => t.toUpperCase()));
  const out: NewsItem[] = [];

  for (let li = 1; li < lines.length; li++) {
    const parts = splitCSV(lines[li], delim);
    const rawTickers = iTicker != null ? want(parts[iTicker]) : undefined;
    const head = iHead != null ? want(parts[iHead]) : undefined;
    const src = iSrc != null ? want(parts[iSrc]) : undefined;
    const url = iUrl != null ? want(parts[iUrl]) : undefined;
    const date = iDate != null ? want(parts[iDate]) : undefined;
    const time = iTime != null ? want(parts[iTime]) : undefined;
    const iso = parseTime(date, time);

    let tk: string[] = [];
    if (rawTickers) {
      tk = rawTickers
        .split(/[,\s;\/]+/)
        .map((t) => t.toUpperCase().trim())
        .filter(Boolean);
    } else if (head && set.size) {
      const U = ` ${head.toUpperCase()} `;
      for (const t of set) {
        if (
          U.includes(` ${t} `) ||
          U.includes(`(${t})`) ||
          U.includes(`[${t}]`) ||
          U.includes(`:${t}`)
        ) {
          tk.push(t);
        }
      }
    }
    if (!tk.length) continue;

    for (const t of tk) {
      if (set.size && !set.has(t)) continue;
      out.push({
        ticker: t,
        headline: head || "",
        url,
        source: src,
        published: iso,
        tag: tagFromHeadline(head),
      });
    }
  }

  // cap per ticker: newest 5
  const byT: Record<string, NewsItem[]> = {};
  for (const n of out) (byT[n.ticker] ??= []).push(n);
  const flat: NewsItem[] = [];
  for (const [t, arr] of Object.entries(byT)) {
    arr.sort(
      (a, b) =>
        (Date.parse(b.published || "") || 0) -
        (Date.parse(a.published || "") || 0)
    );
    flat.push(...arr.slice(0, 5));
  }
  return flat;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tickersParam = url.searchParams.get("tickers") || "";
    const tickers = tickersParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const raw = (await redis.get("news:payload")) || "";
    const payload: Payload = raw
      ? JSON.parse(raw)
      : { generatedAt: null, items: [] };

    let items = payload.items;
    if (tickers.length) {
      const set = new Set(tickers);
      items = items.filter((n) => set.has((n.ticker || "").toUpperCase()));
    }

    // On-demand fallback if nothing cached for the requested tickers
    if (tickers.length && items.length === 0) {
      const fresh = await fetchFinviz(tickers);
      if (fresh.length) {
        // merge into cache (best effort)
        const merged = { generatedAt: new Date().toISOString(), items: fresh };
        await redis.set("news:payload", JSON.stringify(merged), "EX", 3600);
        items = fresh;
      }
    }

    return NextResponse.json({
      generatedAt: payload.generatedAt || new Date().toISOString(),
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { generatedAt: null, items: [], error: e?.message || "news error" },
      { status: 200 }
    );
  }
}
