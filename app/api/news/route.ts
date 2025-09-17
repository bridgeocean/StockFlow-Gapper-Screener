import { NextResponse } from "next/server";
import Redis from "ioredis";

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
  const key = (s: string) => s.toLowerCase().replace(/\s+|\(|\)|\./g, "");
  const idx: Record<string, number> = {};
  cols.forEach((h, i) => (idx[key(h)] = i));

  const iTicker = idx["ticker"] ?? idx["tickers"] ?? idx["symbol"] ?? idx["symbols"] ?? null;
  const iDate = idx["date"] ?? null;
  const iTime = idx["time"] ?? null;
  const iHead = idx["headline"] ?? idx["title"] ?? null;
  const iSrc  = idx["source"] ?? null;
  const iUrl  = idx["link"] ?? idx["url"] ?? idx["articleurl"] ?? null;

  const want = (v: any) => (v == null || v === "" ? undefined : String(v));
  const set = new Set(tickers);
  const out: NewsItem[] = [];

  for (let li = 1; li < lines.length; li++) {
    const parts = splitCSV(lines[li], delim);
    const raw = iTicker != null ? want(parts[iTicker]) : undefined;
    const head = iHead != null ? want(parts[iHead]) : undefined;
    const src  = iSrc  != null ? want(parts[iSrc])  : undefined;
    const url  = iUrl  != null ? want(parts[iUrl])  : undefined;
    const date = iDate != null ? want(parts[iDate]) : undefined;
    const time = iTime != null ? want(parts[iTime]) : undefined;
    const iso  = isoFrom(date, time);

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
      out.push({ ticker: t, headline: head || "", url, source: src, published: iso, tag: tagFromHeadline(head) });
    }
  }
  return out;
}

async function scrapeTicker(t: string): Promise<NewsItem[]> {
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
    const rawTitle = m[2].replace(/<[^>]+>/g, "").trim();
    if (!rawTitle || /advert|share this|feedback/i.test(rawTitle)) continue;
    const chunkStart = Math.max(0, m.index - 400);
    const nearby = html.slice(chunkStart, m.index);
    const timeMatch = nearby.match(/(\d{1,2}:\d{2}\s?(?:AM|PM)?)/i);
    const sourceMatch = nearby.match(/>([A-Za-z][A-Za-z .&-]{1,30})<\/(?:span|small|td|div)>/i);
    const iso = timeMatch?.[1] ? isoFrom(undefined, timeMatch[1].toUpperCase().replace(/\s/g, "")) : undefined;
    const source = sourceMatch?.[1]?.trim();
    items.push({ ticker: t, headline: rawTitle, url: href, source, published: iso, tag: tagFromHeadline(rawTitle) });
  }
  return items;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tickersParam = url.searchParams.get("tickers") || "";
    const tickers = tickersParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

    // read cache
    const raw = await redis.get("news:payload");
    const payload: Payload = raw ? JSON.parse(raw) : { generatedAt: null, items: [] };

    let items = payload.items;
    if (tickers.length) {
      const set = new Set(tickers);
      items = items.filter((n) => set.has((n.ticker || "").toUpperCase()));
    }

    // if cache miss for requested tickers → fetch on demand now
    if (tickers.length && items.length === 0) {
      let fresh: NewsItem[] = [];
      try {
        fresh = await tryExport(tickers);
      } catch {}
      if (!fresh.length) {
        for (const t of tickers) {
          try { fresh.push(...await scrapeTicker(t)); } catch {}
        }
      }
      if (fresh.length) {
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
    return NextResponse.json({ generatedAt: null, items: [], error: e?.message || "news error" }, { status: 200 });
  }
}
