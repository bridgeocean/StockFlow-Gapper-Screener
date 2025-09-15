// app/api/news/update/route.ts
// POST with x-api-key: fetch Yahoo Finance RSS for tickers and store into Redis "today_news".
// Body shape: { tickers?: string[], maxPerTicker?: number, maxAgeHours?: number }

import { NextRequest, NextResponse } from "next/server";
import type { Redis } from "ioredis";

export const runtime = "nodejs";

const WRITE_API_KEY = process.env.SCORES_API_KEY || "";
const API_KEY_HEADER = "x-api-key";
const NEWS_KEY = "today_news";

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
};

function toISO(x: string | undefined): string | undefined {
  if (!x) return undefined;
  const ms = Date.parse(x);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return undefined;
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

    if (!tickers.length) {
      return NextResponse.json({ error: "Provide body { tickers: [\"ABCD\", ...] }" }, { status: 400 });
    }

    const { XMLParser } = await import("fast-xml-parser");

    const cutoffMs = Date.now() - maxAgeHours * 3600 * 1000;
    const items: NewsItem[] = [];

    for (const t of tickers) {
      // Yahoo Finance RSS per ticker
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
            const pub = toISO(it.pubDate);
            return {
              ticker: t,
              headline: it.title || "",
              url: it.link || "",
              source: "Yahoo Finance",
              published: pub,
              summary: typeof it.description === "string" ? it.description : undefined,
            } as NewsItem;
          })
          .filter((n) => !!n.headline && !!n.url)
          .filter((n) => {
            if (!n.published) return true;
            const ms = Date.parse(n.published);
            return Number.isFinite(ms) ? ms >= cutoffMs : true;
          })
          .slice(0, maxPerTicker);

        items.push(...picked);
      } catch (e) {
        // ignore single-ticker failures
      }
    }

    // Merge with any existing list (optional)
    const redis = await getRedis();
    let existing: { generatedAt?: string | null; items?: NewsItem[] } = {};
    try {
      const raw = await redis.get(NEWS_KEY);
      if (raw) existing = JSON.parse(raw);
    } catch {}

    const merged: NewsItem[] = [...items];
    // Optionally append older existing that are still within window for non-duplicated headlines
    const seen = new Set(merged.map((x) => x.ticker + "|" + x.headline));
    (existing.items || []).forEach((x) => {
      if (!seen.has(x.ticker + "|" + x.headline)) merged.push(x);
    });

    const payload = { generatedAt: new Date().toISOString(), items: merged };
    await redis.set(NEWS_KEY, JSON.stringify(payload));

    return NextResponse.json({ ok: true, stored: payload.items.length }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 500 });
  }
}
