// app/api/news/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Redis } from "ioredis";

export const runtime = "nodejs";

const NEWS_KEY = "today_news";
const WRITE_API_KEY = process.env.SCORES_API_KEY || ""; // reuse same secret
const API_KEY_HEADER = "x-api-key";

// Reuse one Redis client
declare global { var __redisClientNews: Redis | undefined; }

async function getRedis(): Promise<Redis> {
  if (global.__redisClientNews) return global.__redisClientNews;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var is missing");
  const { default: IORedis } = await import("ioredis");
  const client = new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
  client.on("error", (e) => console.error("[redis] news error:", e?.message));
  global.__redisClientNews = client;
  return client;
}

const ok = (d: any, s = 200) => NextResponse.json(d, { status: s });
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

type NewsItem = {
  ticker: string;          // e.g. "ABCD"
  headline: string;        // short title
  url: string;             // full article link
  source?: string;         // e.g. "PRNewswire"
  published?: string;      // ISO: "2025-09-14T13:05:00Z" or "HH:mm:ss" (we convert to ISO)
  summary?: string;
};
type NewsPayload = { generatedAt?: string | null; items: NewsItem[] };

function isPayload(x: any): x is NewsPayload {
  return x && typeof x === "object" && Array.isArray(x.items);
}

export async function GET() {
  try {
    const redis = await getRedis();
    const raw = await redis.get(NEWS_KEY);
    if (raw) {
      try { return ok(JSON.parse(raw), 200); }
      catch { return ok({ generatedAt: null, items: [] }, 200); }
    }

    // Fallback to public/news.json if present
    try {
      const fs = await import("node:fs/promises");
      const path = process.cwd() + "/public/news.json";
      const txt = await fs.readFile(path, "utf8");
      return ok(JSON.parse(txt), 200);
    } catch {
      return ok({ generatedAt: null, items: [] }, 200);
    }
  } catch (e: any) {
    return bad(e?.message || "GET /api/news failed", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!WRITE_API_KEY) return bad("SCORES_API_KEY not set on server", 500);
    if ((req.headers.get(API_KEY_HEADER) || "") !== WRITE_API_KEY) return bad("Unauthorized", 401);

    const body = await req.json();
    if (!isPayload(body)) return bad("Invalid payload: missing .items[]", 400);

    const payload: NewsPayload = {
      generatedAt: body.generatedAt || new Date().toISOString(),
      items: body.items,
    };

    const redis = await getRedis();
    await redis.set(NEWS_KEY, JSON.stringify(payload));

    return ok(
      { ok: true, stored: { count: payload.items.length, generatedAt: payload.generatedAt } },
      200
    );
  } catch (e: any) {
    return bad(e?.message || "POST /api/news failed", 500);
  }
}
