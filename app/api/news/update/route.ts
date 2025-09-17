import { NextResponse } from "next/server";
import Redis from "ioredis";

/**
 * POST /api/news/update
 * Body: { tickers?: string[], source?: 'finviz', maxPerTicker?: number }
 *
 * Requires:
 *   - REDIS_URL
 *   - FINVIZ_NEWS_EXPORT_URL  (your long auth URL like .../news_export.ashx?v=1&auth=XXXX)
 */
const REDIS_URL = process.env.REDIS_URL!;
const FINVIZ_NEWS_EXPORT_URL = process.env.FINVIZ_NEWS_EXPORT_URL || process.env.FINVIZ_EXPORT_URL; // allow either
const redis = new Redis(REDIS_URL);

type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO
  tag?: string;
};

function parseTime(dateStr?: string, timeStr?: string) {
  if (!dateStr || !timeStr) return undefined;
  // Finviz example: 09/15/2025 + 08:33AM
  const s = `${dateStr.trim()} ${timeStr.trim()}`;
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  // fallback: HH:MM
  const ms2 = Date.parse(`1970-01-01T${timeStr.replace(" ", "")}Z`);
  return Number.isFinite(ms2) ? new Date(ms2).toISOString() : undefined;
}

function tagFromHeadline(h?: string): string | undefined {
  if (!h) return;
  const u = h.toUpperCase();
  if (/\bFDA\b/.test(u)) return "FDA";
  if (/EARNINGS|EPS|REVENUE|GUIDANCE|RESULTS/.test(u)) return "Earnings";
  if (/OFFERING|PRICED|WARRANTS/.test(u)) return "Offering";
  if (/MERGER|ACQUIR|TAKEOVER|BUYOUT/.test(u)) return "M&A";
  if (/PARTNERSHIP|COLLABORATION/.test(u)) return "Partner";
  if (/UPGRADE|DOWNGRADE|INITIATES/.test(u)) return "Analyst";
  return undefined;
}

async function fetchFinvizCSV() {
  if (!FINVIZ_NEWS_EXPORT_URL) {
    throw new Error("FINVIZ_NEWS_EXPORT_URL is not set");
  }
  const res = await fetch(FINVIZ_NEWS_EXPORT_URL, { cache: "no-store" as any });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Finviz news export failed: ${res.status} ${txt?.slice(0,200)}`);
  }
  return await res.text();
}

// very forgiving CSV split
function splitCSVLines(csv: string) {
  return csv.split(/\r?\n/).filter(Boolean);
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

    // 1) Pull Finviz export
    const csv = await fetchFinvizCSV();
    const lines = splitCSVLines(csv);
    if (lines.length < 2) throw new Error("Finviz export returned no data");

    // header → index map
    const headers = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
    const idx: Record<string, number> = {};
    headers.forEach((h, i) => (idx[key(h)] = i));

    const iTicker = idx["ticker"] ?? idx["symbol"] ?? 0;
    const iDate   = idx["date"];
    const iTime   = idx["time"];
    const iHead   = idx["headline"] ?? idx["title"];
    const iSrc    = idx["source"];
    const iLink   = idx["link"] ?? idx["url"];

    const byTicker: Record<string, NewsItem[]> = {};
    for (let li = 1; li < lines.length; li++) {
      const parts = lines[li].split(/,(?![^"]*"[^"]*(?:"[^"]*"[^"]*)*$)/g).map((s) => s.replace(/^"|"$/g, "").trim());
      const ticker = (parts[iTicker] || "").toUpperCase();
      if (!ticker) continue;

      const include = reqSet.size ? reqSet.has(ticker) : true;
      if (!include) continue;

      const dateStr = iDate != null ? parts[iDate] : undefined;
      const timeStr = iTime != null ? parts[iTime] : undefined;
      const iso = parseTime(dateStr, timeStr);

      const headline = iHead != null ? parts[iHead] : undefined;
      const source = iSrc != null ? parts[iSrc] : undefined;
      const url = iLink != null ? parts[iLink] : undefined;

      const item: NewsItem = {
        ticker,
        headline: headline || "",
        source: source || undefined,
        url: url || undefined,
        published: iso,
        tag: tagFromHeadline(headline),
      };
      (byTicker[ticker] ||= []).push(item);
    }

    // enforce max per ticker & flatten
    const items: NewsItem[] = [];
    for (const [t, arr] of Object.entries(byTicker)) {
      arr.sort((a, b) => (Date.parse(b.published || "") || 0) - (Date.parse(a.published || "") || 0));
      items.push(...arr.slice(0, maxPer));
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      items,
    };

    await redis.set("news:payload", JSON.stringify(payload), "EX", 60 * 60); // 1h TTL
    await redis.set("news:updatedAt", payload.generatedAt);

    return NextResponse.json({ ok: true, count: items.length, generatedAt: payload.generatedAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 400 });
  }
}
