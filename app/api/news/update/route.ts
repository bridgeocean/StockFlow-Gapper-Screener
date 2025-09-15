// app/api/news/update/route.ts
// POST with x-api-key to update cached news in Redis from FINVIZ (preferred) or Yahoo RSS fallback.
// Body (optional):
//   { tickers?: string[], source?: "finviz" | "yahoo" | "both", maxPerTicker?: number, maxAgeHours?: number }
//
// Stores to Redis key: "today_news"
// GET /api/news simply reads this key (unchanged).

import { NextRequest, NextResponse } from "next/server";
import type { Redis } from "ioredis";

export const runtime = "nodejs";

const WRITE_API_KEY = process.env.SCORES_API_KEY || "";
const API_KEY_HEADER = "x-api-key";
const NEWS_KEY = "today_news";
const FINVIZ_URL = process.env.FINVIZ_NEWS_URL || "";

declare global { var __redisClientNewsUpd: Redis | undefined; }
async function getRedis(): Promise<Redis> {
  if (global.__redisClientNewsUpd) return global.__redisClientNewsUpd;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var is missing");
  const { default: IORedis } = await import("ioredis");
  const client = new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
  global.__redisClientNewsUpd = client;
  return client;
}

type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO
  summary?: string;
  tag?: string; // Catalyst tag (FDA, Offering, etc.)
};

function toISO(dateStr?: string, timeStr?: string): string | undefined {
  if (!dateStr && !timeStr) return undefined;
  try {
    // Common Finviz export patterns:
    // - "2025-09-15","21:35:00" (UTC-ish) OR a combined string
    const combined =
      dateStr && timeStr ? `${dateStr} ${timeStr}` :
      dateStr ? dateStr : timeStr!;
    const ms = Date.parse(combined);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  } catch {}
  return undefined;
}

function hostname(u?: string): string | undefined {
  if (!u) return undefined;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

function catalystTag(headline?: string): string | undefined {
  if (!headline) return undefined;
  const h = headline.toLowerCase();

  const has = (...xs: string[]) => xs.some((x) => h.includes(x));

  if (has("fda", "clearance", "approval", "fast track", "breakthrough")) return "FDA";
  if (has("phase", "trial", "topline", "efficacy", "placebo", "enroll")) return "CLINICAL";
  if (has("offering", "registered direct", "at-the-market", "atm", "shelf", "prospectus")) return "OFFERING";
  if (has("merger", "acquisition", "acquire", "takeover", "combination", "buying")) return "M&A";
  if (has("guidance", "earnings", "q1", "q2", "q3", "q4", "results", "revenue")) return "EARNINGS";
  if (has("contract", "order", "award", "purchase order")) return "CONTRACT";
  if (has("partnership", "collaboration", "strategic partner")) return "PARTNERSHIP";
  if (has("buyback", "repurchase")) return "BUYBACK";
  if (has("bankruptcy", "chapter 11")) return "BANKRUPTCY";
  if (has("uplist", "uplist", "nasdaq", "nyse american", "listing")) return "LISTING";
  if (has("reverse split")) return "RSPLIT";
  if (has("sec", "form 4", "8-k", "10-k", "10-q", "filing")) return "FILING";
  if (has("dividend")) return "DIVIDEND";
  if (has("license", "licensing")) return "LICENSE";

  return undefined;
}

/** Parse Finviz export text. We support both headered CSV and loose CSV. */
async function fetchFromFinviz(tickers: string[], maxPerTicker: number, maxAgeHours: number): Promise<NewsItem[]> {
  if (!FINVIZ_URL) throw new Error("FINVIZ_NEWS_URL is not set");
  const res = await fetch(FINVIZ_URL, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Finviz export fetch failed: ${res.status}`);
  const txt = await res.text();

  // Parse tolerant CSV
  const Papa = await import("papaparse");
  const { data }: any = Papa.parse(txt, { header: true, skipEmptyLines: true });

  // Heuristic: try to map common column names
  const items: NewsItem[] = [];
  const cutoffMs = Date.now() - maxAgeHours * 3600 * 1000;

  const pick = (row: any, names: string[]) =>
    names.reduce<any>((acc, n) => (acc != null ? acc : row?.[n]), undefined);

  for (const row of Array.isArray(data) ? data : []) {
    const t = String(
      pick(row, ["Ticker", "ticker", "Symbol", "symbol"]) ?? ""
    ).toUpperCase();

    // Finviz sometimes has tickers like "AAPL,MSFT" (multi). Split and take each.
    const tickList = t ? t.split(/[,\s]+/).map((x: string) => x.trim()).filter(Boolean) : [];

    const dateStr = pick(row, ["Date", "date", "Published", "published"]);
    const timeStr = pick(row, ["Time", "time"]);
    const iso = toISO(dateStr, timeStr);

    const headline = pick(row, ["Title", "title", "Headline", "headline"]) ?? "";
    const url = pick(row, ["URL", "Url", "url", "Link", "link"]);
    const src = hostname(url) ?? pick(row, ["Source", "source"]);

    const ms = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(ms) && ms < cutoffMs) continue;

    const one: Omit<NewsItem, "ticker"> = {
      headline: String(headline),
      url: url ? String(url) : undefined,
      source: src ? String(src) : undefined,
      published: iso,
      tag: catalystTag(String(headline)),
    };

    const outTickers = tickers.length ? tickList.filter((x: string) => tickers.includes(x)) : tickList;
    (outTickers.length ? outTickers : tickList).forEach((tk) => {
      if (tk) items.push({ ticker: tk, ...one });
    });
  }

  // Cap per ticker
  const byT: Record<string, NewsItem[]> = {};
  for (const it of items) {
    byT[it.ticker] ??= [];
    byT[it.ticker].push(it);
  }
  const trimmed: NewsItem[] = [];
  for (const [tk, arr] of Object.entries(byT)) {
    arr.sort((a, b) => (Date.parse(b.published || "0") || 0) - (Date.parse(a.published || "0") || 0));
    trimmed.push(...arr.slice(0, maxPerTicker));
  }
  return trimmed;
}

/** Yahoo fallback (kept for completeness) */
async function fetchFromYahoo(tickers: string[], maxPerTicker: number, maxAgeHours: number): Promise<NewsItem[]> {
  const { XMLParser } = await import("fast-xml-parser");
  const cutoffMs = Date.now() - maxAgeHours * 3600 * 1000;
  const all: NewsItem[] = [];

  for (const t of tickers) {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(t)}&lang=en-US`;
    try {
      const res = await fetch(url, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const xml = await res.text();
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
      const data: any = parser.parse(xml);
      const channel = data?.rss?.channel || data?.channel;
      const rssItems: any[] = channel?.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];

      const picked = rssItems
        .map((it) => {
          const pub = it.pubDate ? new Date(it.pubDate).toISOString() : undefined;
          return {
            ticker: t,
            headline: it.title || "",
            url: it.link || "",
            source: "Yahoo Finance",
            published: pub,
            summary: typeof it.description === "string" ? it.description : undefined,
            tag: catalystTag(it.title || ""),
          } as NewsItem;
        })
        .filter((n) => !!n.headline && !!n.url)
        .filter((n) => {
          if (!n.published) return true;
          const ms = Date.parse(n.published);
          return Number.isFinite(ms) ? ms >= cutoffMs : true;
        })
        .slice(0, maxPerTicker);

      all.push(...picked);
    } catch {}
  }
  return all;
}

export async function POST(req: NextRequest) {
  try {
    if (!WRITE_API_KEY) {
      return NextResponse.json({ error: "SCORES_API_KEY not set" }, { status: 500 });
    }
    const key = req.headers.get(API_KEY_HEADER) || "";
    if (key !== WRITE_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const tickers: string[] = Array.isArray(body?.tickers)
      ? (body.tickers as string[]).map((t) => String(t).toUpperCase())
      : [];
    const maxPerTicker = Number(body?.maxPerTicker ?? 5);
    const maxAgeHours = Number(body?.maxAgeHours ?? 24);
    const source: "finviz" | "yahoo" | "both" =
      body?.source === "yahoo" || body?.source === "both" ? body.source : "finviz";

    let items: NewsItem[] = [];

    if (source === "finviz" || source === "both") {
      try {
        const finvizItems = await fetchFromFinviz(tickers, maxPerTicker, maxAgeHours);
        items.push(...finvizItems);
      } catch (e) {
        // fall back if Finviz fails
        if (source === "both") {
          // continue to Yahoo
        } else {
          throw e;
        }
      }
    }

    if ((source === "yahoo" || source === "both") && tickers.length) {
      const yahooItems = await fetchFromYahoo(tickers, maxPerTicker, maxAgeHours);
      items.push(...yahooItems);
    }

    // Merge by (ticker + headline) to avoid dups
    const seen = new Set<string>();
    const merged: NewsItem[] = [];
    for (const it of items) {
      const k = `${it.ticker}|${it.headline}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(it);
    }

    // Save
    const redis = await getRedis();
    const payload = { generatedAt: new Date().toISOString(), items: merged };
    await redis.set(NEWS_KEY, JSON.stringify(payload));

    return NextResponse.json({ ok: true, stored: merged.length, source }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 500 });
  }
}
