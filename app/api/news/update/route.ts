import { NextResponse } from "next/server";
import Redis from "ioredis";

/**
 * POST /api/news/update
 * Body: { tickers?: string[], maxPerTicker?: number }
 *
 * ENV:
 *   - REDIS_URL (required)
 *   - FINVIZ_NEWS_EXPORT_URL (optional; if present we try it first)
 *
 * Behavior:
 *   1) Try Finviz export (CSV). If it returns 0 items for requested tickers,
 *   2) Fallback to scraping each public quote page: https://finviz.com/quote.ashx?t=TICKER
 *      (no login required).
 *   3) Cache into Redis key "news:payload" (TTL 1h).
 */
const REDIS_URL = process.env.REDIS_URL!;
const FINVIZ_NEWS_EXPORT_URL =
  process.env.FINVIZ_NEWS_EXPORT_URL || process.env.FINVIZ_EXPORT_URL || "";

const redis = new Redis(REDIS_URL);

type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO
  tag?: string;
};

function tagFromHeadline(h?: string): string | undefined {
  if (!h) return;
  const t = h.toUpperCase();
  if (/\bFDA\b/.test(t)) return "FDA";
  if (/EARNINGS|EPS|REVENUE|GUIDANCE|RESULTS/.test(t)) return "Earnings";
  if (/OFFERING|PRICED|WARRANT/.test(t)) return "Offering";
  if (/MERGER|ACQUIR|TAKEOVER|BUYOUT/.test(t)) return "M&A";
  if (/PARTNERSHIP|COLLABORATION/.test(t)) return "Partner";
  if (/UPGRADE|DOWNGRADE|INITIAT/.test(t)) return "Analyst";
}

function isoFrom(dateStr?: string, timeStr?: string) {
  if (dateStr && timeStr) {
    const ms = Date.parse(`${dateStr.trim()} ${timeStr.trim()}`);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (timeStr) {
    const hhmm = timeStr.replace(/\s+/g, "");
    const ms2 = Date.parse(`1970-01-01T${hhmm}Z`);
    if (Number.isFinite(ms2)) return new Date(ms2).toISOString();
  }
  return undefined;
}

// --- CSV helpers (export) ---
function splitCSV(line: string, delim: string) {
  const re = new RegExp(`${delim}(?![^"]*"[^"]*(?:"[^"]*"[^"]*)*$)`);
  return line.split(re).map((s) => s.replace(/^"|"$/g, "").trim());
}
async function tryExport(tickers: string[]): Promise<NewsItem[]> {
  if (!FINVIZ_NEWS_EXPORT_URL) return [];
  const res = await fetch(FINVIZ_NEWS_EXPORT_URL, { cache: "no-store" as any });
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0];
  const delim =
    (header.match(/;/g)?.length || 0) > (header.match(/,/g)?.length || 0) ? ";" : ",";
  const cols = splitCSV(header, delim).map((h) => h.toLowerCase());
  const k = (s: string) => s.toLowerCase().replace(/\s+|\(|\)|\./g, "");
  const idx: Record<string, number> = {};
  cols.forEach((h, i) => (idx[k(h)] = i));

  const iTicker =
    idx["ticker"] ?? idx["tickers"] ?? idx["symbol"] ?? idx["symbols"] ?? null;
  const iDate = idx["date"] ?? null;
  const iTime = idx["time"] ?? null;
  const iHead = idx["headline"] ?? idx["title"] ?? null;
  const iSrc = idx["source"] ?? null;
  const iUrl = idx["link"] ?? idx["url"] ?? idx["articleurl"] ?? null;

  const want = (v: any) => (v == null || v === "" ? undefined : String(v));
  const set = new Set(tickers);
  const out: NewsItem[] = [];

  for (let li = 1; li < lines.length; li++) {
    const parts = splitCSV(lines[li], delim);
    const raw = iTicker != null ? want(parts[iTicker]) : undefined;
    const head = iHead != null ? want(parts[iHead]) : undefined;
    const src = iSrc != null ? want(parts[iSrc]) : undefined;
    const url = iUrl != null ? want(parts[iUrl]) : undefined;
    const date = iDate != null ? want(parts[iDate]) : undefined;
    const time = iTime != null ? want(parts[iTime]) : undefined;
    const iso = isoFrom(date, time);

    let tk: string[] = [];
    if (raw) {
      tk = raw.split(/[,\s;\/]+/).map((t) => t.toUpperCase().trim()).filter(Boolean);
    } else if (head && set.size) {
      const U = ` ${head.toUpperCase()} `;
      for (const t of set) {
        if (U.includes(` ${t} `) || U.includes(`(${t})`) || U.includes(`[${t}]`) || U.includes(`:${t}`)) {
          tk.push(t);
        }
      }
    }
    if (!tk.length) continue;

    for (const t of tk) {
      if (set.size && !set.has(t)) continue;
      out.push({ ticker: t, headline: head || "", source: src, url, published: iso, tag: tagFromHeadline(head) });
    }
  }
  return out;
}

// --- Public HTML scrape (fallback, no login) ---
async function scrapeTicker(t: string): Promise<NewsItem[]> {
  const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; StockFlowBot/1.0)" },
    cache: "no-store" as any,
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Finviz renders a news table; headlines are <a href="...">Title</a> near a time cell.
  // We'll grab the latest ~10 anchors and try to find a nearby time string.
  const items: NewsItem[] = [];
  const anchorRe = /<a\s+href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) && items.length < 12) {
    const href = m[1];
    const rawTitle = m[2].replace(/<[^>]+>/g, "").trim();
    if (!rawTitle || /advert|share this|feedback/i.test(rawTitle)) continue;

    // naive backscan for time tag near the anchor (within 400 chars)
    const chunkStart = Math.max(0, m.index - 400);
    const nearby = html.slice(chunkStart, m.index);
    const timeMatch = nearby.match(/(\d{1,2}:\d{2}\s?(?:AM|PM)?)/i);
    const sourceMatch = nearby.match(/>([A-Za-z][A-Za-z .&-]{1,30})<\/(?:span|small|td|div)>/i);
    const iso =
      timeMatch?.[1]
        ? isoFrom(undefined, timeMatch[1].toUpperCase().replace(/\s/g, ""))
        : undefined;
    const source = sourceMatch?.[1]?.trim();

    items.push({
      ticker: t,
      headline: rawTitle,
      url: href,
      source,
      published: iso,
      tag: tagFromHeadline(rawTitle),
    });
  }
  return items;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      tickers?: string[];
      maxPerTicker?: number;
    };

    const tickers = (body.tickers || []).map((s) => s.toUpperCase()).filter(Boolean);
    if (!tickers.length) return NextResponse.json({ ok: false, error: "No tickers provided" }, { status: 400 });

    const maxPer = body.maxPerTicker && body.maxPerTicker > 0 ? body.maxPerTicker : 5;

    // 1) Try export first (if configured)
    let items: NewsItem[] = [];
    try {
      items = await tryExport(tickers);
    } catch {
      items = [];
    }

    // 2) If we got nothing from export, scrape each ticker’s public page
    if (!items.length) {
      const all: NewsItem[] = [];
      for (const t of tickers) {
        try {
          const got = await scrapeTicker(t);
          all.push(...got);
        } catch {
          // ignore ticker failures
        }
      }
      items = all;
    }

    // Cap per ticker and sort newest first
    const byT: Record<string, NewsItem[]> = {};
    for (const n of items) (byT[n.ticker] ??= []).push(n);
    const flat: NewsItem[] = [];
    for (const [t, arr] of Object.entries(byT)) {
      arr.sort(
        (a, b) =>
          (Date.parse(b.published || "") || 0) -
          (Date.parse(a.published || "") || 0)
      );
      flat.push(...arr.slice(0, maxPer));
    }

    const payload = { generatedAt: new Date().toISOString(), items: flat };

    // Cache (1h)
    await redis.set("news:payload", JSON.stringify(payload), "EX", 3600);
    await redis.set("news:updatedAt", payload.generatedAt);

    return NextResponse.json({ ok: true, count: flat.length, generatedAt: payload.generatedAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 400 });
  }
}
