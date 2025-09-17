import { NextResponse } from "next/server";
import Redis from "ioredis";

/**
 * POST /api/news/update
 * Body: { tickers?: string[], source?: 'finviz', maxPerTicker?: number }
 *
 * ENV:
 *   - REDIS_URL
 *   - FINVIZ_NEWS_EXPORT_URL  (your .../news_export.ashx?v=1&auth=XXXX link)
 */
const REDIS_URL = process.env.REDIS_URL!;
const FINVIZ_NEWS_EXPORT_URL = process.env.FINVIZ_NEWS_EXPORT_URL || process.env.FINVIZ_EXPORT_URL;
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
  return undefined;
}

function parseTime(dateStr?: string, timeStr?: string) {
  // Finviz: Date="09/16/2025", Time="08:33AM" or "21:25:00"
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

async function getFinvizText(): Promise<string> {
  if (!FINVIZ_NEWS_EXPORT_URL) throw new Error("FINVIZ_NEWS_EXPORT_URL not set");
  const res = await fetch(FINVIZ_NEWS_EXPORT_URL, { cache: "no-store" as any });
  if (!res.ok) throw new Error(`Finviz export failed: ${res.status}`);
  return await res.text();
}

// split by the detected delimiter, but respect quotes
function splitCSV(line: string, delim: string) {
  const re = new RegExp(`${delim}(?![^"]*"[^"]*(?:"[^"]*"[^"]*)*$)`);
  return line.split(re).map((s) => s.replace(/^"|"$/g, "").trim());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      tickers?: string[];
      source?: string;
      maxPerTicker?: number;
    };

    const reqSet = new Set((body.tickers || []).map((s) => s.toUpperCase()));
    const maxPer = body.maxPerTicker && body.maxPerTicker > 0 ? body.maxPerTicker : 10;

    const text = await getFinvizText();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("Finviz export returned no rows");

    // detect delimiter from header
    const headerLine = lines[0];
    const delim =
      (headerLine.match(/;/g)?.length || 0) > (headerLine.match(/,/g)?.length || 0)
        ? ";"
        : ",";

    const headers = splitCSV(headerLine, delim).map((h) => h.toLowerCase());
    const keyify = (s: string) => s.toLowerCase().replace(/\s+|\(|\)|\./g, "");

    const idx: Record<string, number> = {};
    headers.forEach((h, i) => (idx[keyify(h)] = i));

    // try multiple header names
    const iTicker =
      idx["ticker"] ??
      idx["tickers"] ??
      idx["symbol"] ??
      idx["symbols"] ??
      null;

    const iDate = idx["date"] ?? null;
    const iTime = idx["time"] ?? null;
    const iHead = idx["headline"] ?? idx["title"] ?? null;
    const iSrc  = idx["source"] ?? null;
    const iUrl  = idx["link"] ?? idx["url"] ?? idx["articleurl"] ?? null;

    const want = (val: any) => (val == null || val === "" ? undefined : String(val));

    const byTicker: Record<string, NewsItem[]> = {};

    for (let li = 1; li < lines.length; li++) {
      const parts = splitCSV(lines[li], delim);
      const rawTickers = iTicker != null ? want(parts[iTicker]) : undefined;
      const head = iHead != null ? want(parts[iHead]) : undefined;
      const src  = iSrc  != null ? want(parts[iSrc])  : undefined;
      const url  = iUrl  != null ? want(parts[iUrl])  : undefined;
      const date = iDate != null ? want(parts[iDate]) : undefined;
      const time = iTime != null ? want(parts[iTime]) : undefined;
      const iso  = parseTime(date, time);

      // collect tickers:
      let tickers: string[] = [];
      if (rawTickers) {
        // could be "AAPL MSFT" or "AAPL,MSFT" or "AAPL; MSFT"
        tickers = rawTickers
          .split(/[,\s;\/]+/)
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean);
      }

      // if export has no explicit ticker column, derive from requested tickers by title hit
      if ((!tickers.length && reqSet.size && head)) {
        const U = ` ${head.toUpperCase()} `;
        for (const t of reqSet) {
          if (U.includes(` ${t} `) || U.includes(`(${t})`) || U.includes(`[${t}]`) || U.includes(`:${t}`)) {
            tickers.push(t);
          }
        }
        // last resort: still include, we’ll let the panel filter later
      }

      // if we still have none, skip (no way to map)
      if (!tickers.length) continue;

      for (const t of tickers) {
        // apply request filter if provided
        if (reqSet.size && !reqSet.has(t)) continue;

        const item: NewsItem = {
          ticker: t,
          headline: head || "",
          source: src,
          url,
          published: iso,
          tag: tagFromHeadline(head),
        };
        (byTicker[t] ||= []).push(item);
      }
    }

    // cap by ticker and flatten
    const items: NewsItem[] = [];
    for (const [t, arr] of Object.entries(byTicker)) {
      arr.sort(
        (a, b) =>
          (Date.parse(b.published || "") || 0) -
          (Date.parse(a.published || "") || 0)
      );
      items.push(...arr.slice(0, maxPer));
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      items,
    };

    await redis.set("news:payload", JSON.stringify(payload), "EX", 60 * 60);
    await redis.set("news:updatedAt", payload.generatedAt);

    return NextResponse.json({ ok: true, generatedAt: payload.generatedAt, count: items.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 400 });
  }
}
