import { NextResponse } from "next/server";
import Redis from "ioredis";

/**
 * POST /api/news/update
 * Body: { tickers: string[], maxPerTicker?: number }
 *
 * Sources (in order):
 *   1) FINVIZ export (if FINVIZ_NEWS_EXPORT_URL is set)
 *   2) FINVIZ public quote page scrape (no login)
 *   3) Yahoo Finance RSS (per ticker)
 *   4) MarketWatch RSS (per ticker)
 *
 * Stores a merged, de-duplicated set in Redis ("news:payload") for 1h.
 */

const REDIS_URL = process.env.REDIS_URL!;
const FINVIZ_NEWS_EXPORT_URL =
  process.env.FINVIZ_NEWS_EXPORT_URL || process.env.FINVIZ_EXPORT_URL || "";

const redis = new Redis(REDIS_URL);

// --------------------- types ---------------------
type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO
  tag?: string;
};

// ------------------- helpers --------------------
function toISO(d?: string) {
  if (!d) return undefined;
  const ms = Date.parse(d);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function csvSplit(line: string, delim: string) {
  const re = new RegExp(`${delim}(?![^"]*"[^"]*(?:"[^"]*"[^"]*)*$)`);
  return line.split(re).map((s) => s.replace(/^"|"$/g, "").trim());
}

function dedup(items: NewsItem[]) {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key =
      (it.url?.replace(/[#?].*$/, "") || "") +
      "::" +
      (it.headline || "").toUpperCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// ----- Catalyst tagging (headline → compact tag code) -----
function tagFromHeadline(h?: string): string | undefined {
  if (!h) return;
  const t = h.toUpperCase();

  if (/\bFDA\b|PHASE\s?(I|II|III)|TRIAL|DATA READOUT/.test(t)) return "FDA";
  if (/EARNINGS|RESULTS|EPS|REVENUE|GUIDANCE/.test(t)) return "ERN";
  if (/OFFERING|REGISTERED DIRECT|WARRANT|PRICED/.test(t)) return "OFF";
  if (/MERGER|ACQUIR|TAKEOVER|BUYOUT|SPAC/.test(t)) return "MA";
  if (/PARTNERSHIP|COLLABORATION|DEAL|AGREEMENT/.test(t)) return "PRT";
  if (/UPGRADE|DOWNGRADE|INITIAT|PRICE TARGET/.test(t)) return "ANL";
  if (/CONTRACT|PURCHASE ORDER|AWARD/.test(t)) return "CNT";
  if (/LAWSUIT|LITIGATION|SETTLEMENT|SEC INVESTIGATION/.test(t)) return "LEG";

  return undefined;
}

// ------------------ source: Finviz export ------------------
async function fromFinvizExport(tickers: string[]): Promise<NewsItem[]> {
  if (!FINVIZ_NEWS_EXPORT_URL) return [];
  const res = await fetch(FINVIZ_NEWS_EXPORT_URL, { cache: "no-store" as any });
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0];
  const delim =
    (header.match(/;/g)?.length || 0) > (header.match(/,/g)?.length || 0) ? ";" : ",";
  const cols = csvSplit(header, delim).map((h) => h.toLowerCase());
  const key = (s: string) => s.toLowerCase().replace(/\s+|\(|\)|\./g, "");
  const idx: Record<string, number> = {};
  cols.forEach((h, i) => (idx[key(h)] = i));

  const iTicker = idx["ticker"] ?? idx["tickers"] ?? idx["symbol"] ?? idx["symbols"] ?? null;
  const iDate = idx["date"] ?? null;
  const iTime = idx["time"] ?? null;
  const iHead = idx["headline"] ?? idx["title"] ?? null;
  const iSrc = idx["source"] ?? null;
  const iUrl = idx["link"] ?? idx["url"] ?? idx["articleurl"] ?? null;

  const set = new Set(tickers);
  const out: NewsItem[] = [];

  for (let li = 1; li < lines.length; li++) {
    const parts = csvSplit(lines[li], delim);
    const rawTk = iTicker != null ? parts[iTicker] : undefined;
    const headline = iHead != null ? parts[iHead] : undefined;
    const source = iSrc != null ? parts[iSrc] : undefined;
    const url = iUrl != null ? parts[iUrl] : undefined;
    const date = iDate != null ? parts[iDate] : undefined;
    const time = iTime != null ? parts[iTime] : undefined;
    const published = toISO([date, time].filter(Boolean).join(" "));

    let tks: string[] = [];
    if (rawTk) {
      tks = rawTk.split(/[,\s;\/]+/).map((t) => t.toUpperCase().trim()).filter(Boolean);
    } else if (headline) {
      const U = ` ${headline.toUpperCase()} `;
      for (const t of set) {
        if (U.includes(` ${t} `) || U.includes(`(${t})`) || U.includes(`[${t}]`) || U.includes(`:${t}`)) {
          tks.push(t);
        }
      }
    }
    for (const tk of tks) {
      if (!set.has(tk)) continue;
      out.push({
        ticker: tk,
        headline: headline || "",
        url,
        source,
        published,
        tag: tagFromHeadline(headline),
      });
    }
  }
  return out;
}

// ------------- source: Finviz public quote scrape -------------
async function fromFinvizQuote(t: string): Promise<NewsItem[]> {
  const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; StockFlowBot/1.0)" },
    cache: "no-store" as any,
  });
  if (!res.ok) return [];
  const html = await res.text();

  const items: NewsItem[] = [];
  const anchorRe = /<a\s+href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) && items.length < 12) {
    const href = m[1];
    const raw = m[2].replace(/<[^>]+>/g, "").trim();
    if (!raw || /advert|feedback/i.test(raw)) continue;

    // backscan for time/source near anchor
    const chunk = html.slice(Math.max(0, m.index - 500), m.index);
    const time = chunk.match(/(\d{1,2}:\d{2}\s?(?:AM|PM)?)/i)?.[1];
    const published = time ? toISO(`1970-01-01 ${time}`) : undefined;
    const source = chunk.match(/>([A-Za-z][A-Za-z .&-]{1,30})<\/(?:span|small|td|div)>/i)?.[1]?.trim();

    items.push({
      ticker: t,
      headline: raw,
      url: href,
      source,
      published,
      tag: tagFromHeadline(raw),
    });
  }
  return items;
}

// ------------- source: Yahoo RSS (per ticker) -------------
async function fromYahooRSS(t: string): Promise<NewsItem[]> {
  // Yahoo’s RSS endpoint commonly used in practice:
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
    t
  )}&region=US&lang=en-US`;
  const res = await fetch(url, { cache: "no-store" as any });
  if (!res.ok) return [];
  const xml = await res.text();

  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < 10) {
    const block = m[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const link = block.match(/<link>(.*?)<\/link>/i);
    const pub = block.match(/<pubDate>(.*?)<\/pubDate>/i);
    const src = block.match(/<source[^>]*>(.*?)<\/source>/i);

    const headline = (title?.[1] || title?.[2] || "").trim();
    const url = (link?.[1] || "").trim();
    const published = toISO(pub?.[1]);
    const source = (src?.[1] || "Yahoo").trim();

    if (!headline) continue;
    items.push({
      ticker: t,
      headline,
      url,
      source,
      published,
      tag: tagFromHeadline(headline),
    });
  }
  return items;
}

// ----------- source: MarketWatch RSS (per ticker) -----------
async function fromMarketWatchRSS(t: string): Promise<NewsItem[]> {
  const url = `https://feeds.marketwatch.com/marketwatch/stocknews?symbol=${encodeURIComponent(t)}`;
  const res = await fetch(url, { cache: "no-store" as any });
  if (!res.ok) return [];
  const xml = await res.text();

  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < 10) {
    const block = m[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const link = block.match(/<link>(.*?)<\/link>/i);
    const pub = block.match(/<pubDate>(.*?)<\/pubDate>/i);

    const headline = (title?.[1] || title?.[2] || "").trim();
    const url = (link?.[1] || "").trim();
    const published = toISO(pub?.[1]);

    if (!headline) continue;
    items.push({
      ticker: t,
      headline,
      url,
      source: "MarketWatch",
      published,
      tag: tagFromHeadline(headline),
    });
  }
  return items;
}

// ------------------------ handler -------------------------
export async function POST(req: Request) {
  try {
    const { tickers, maxPerTicker } = await req.json();
    const want: string[] = (tickers || [])
      .map((s: string) => s.toUpperCase())
      .filter(Boolean);
    if (!want.length) {
      return NextResponse.json({ ok: false, error: "No tickers provided" }, { status: 400 });
    }
    const MAX = maxPerTicker && maxPerTicker > 0 ? maxPerTicker : 5;

    // 1) Finviz export (bulk)
    let merged: NewsItem[] = [];
    try {
      merged = await fromFinvizExport(want);
    } catch {}

    // 2..4) Per-ticker top-ups until each has MAX
    for (const tk of want) {
      const need = () =>
        merged.filter((n) => n.ticker === tk).length < MAX;

      if (need()) {
        try {
          merged = merged.concat(await fromFinvizQuote(tk));
        } catch {}
      }
      if (need()) {
        try {
          merged = merged.concat(await fromYahooRSS(tk));
        } catch {}
      }
      if (need()) {
        try {
          merged = merged.concat(await fromMarketWatchRSS(tk));
        } catch {}
      }
    }

    // de-dup & cap per ticker
    merged = dedup(merged);
    const byTk: Record<string, NewsItem[]> = {};
    for (const it of merged) (byTk[it.ticker] ??= []).push(it);
    const flat: NewsItem[] = [];
    for (const [tk, arr] of Object.entries(byTk)) {
      arr.sort(
        (a, b) =>
          (Date.parse(b.published || "") || 0) -
          (Date.parse(a.published || "") || 0)
      );
      flat.push(...arr.slice(0, MAX));
    }

    const payload = { generatedAt: new Date().toISOString(), items: flat };
    await redis.set("news:payload", JSON.stringify(payload), "EX", 3600);
    await redis.set("news:updatedAt", payload.generatedAt);

    return NextResponse.json({ ok: true, count: flat.length, generatedAt: payload.generatedAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "bad json" }, { status: 400 });
  }
}
