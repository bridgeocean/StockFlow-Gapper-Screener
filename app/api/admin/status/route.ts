// app/api/admin/status/route.ts
import { NextResponse } from "next/server";
import type { Redis } from "ioredis";

export const runtime = "nodejs";

declare global {
  // re-use a single Redis client across hot reloads
  var __redisAdminStatus: Redis | undefined;
}

async function getRedis(): Promise<Redis> {
  if (global.__redisAdminStatus) return global.__redisAdminStatus;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var is missing");
  const { default: IORedis } = await import("ioredis");
  const client = new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
  global.__redisAdminStatus = client;
  return client;
}

function safeGenAt(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    const iso = json?.generatedAt;
    return typeof iso === "string" ? iso : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const redis = await getRedis();
    const [newsRaw, scoresRaw] = await redis.mget("today_news", "today_scores");
    const newsGeneratedAt = safeGenAt(newsRaw);
    const scoresGeneratedAt = safeGenAt(scoresRaw);
    return NextResponse.json({
      now: new Date().toISOString(),
      newsGeneratedAt,
      scoresGeneratedAt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}
