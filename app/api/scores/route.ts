// app/api/scores/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Redis } from "ioredis";

export const runtime = "nodejs"; // ensure Node runtime on Vercel

// ---------- CONFIG ----------
const SCORES_KEY = "today_scores";
const WRITE_API_KEY = process.env.SCORES_API_KEY || "";
const API_KEY_HEADER = "x-api-key";
// ----------------------------

// Reuse a single Redis client across invocations
declare global {
  // eslint-disable-next-line no-var
  var __redisClient: Redis | undefined;
}

async function getRedis(): Promise<Redis> {
  if (global.__redisClient) return global.__redisClient;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var is missing");

  const { default: IORedis } = await import("ioredis");
  const client = new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
    tls: url.startsWith("rediss://") ? {} : undefined
  });

  client.on("error", (e) => console.error("[redis] error:", e?.message));
  global.__redisClient = client;
  return client;
}

const ok = (d: any, s = 200) => NextResponse.json(d, { status: s });
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const isPayload = (x: any) => x && typeof x === "object" && Array.isArray(x.scores);

// GET: read current scores
export async function GET() {
  try {
    const redis = await getRedis();
    const raw = await redis.get(SCORES_KEY);
    if (raw) {
      try { return ok(JSON.parse(raw), 200); }
      catch { return ok({ generatedAt: null, scores: [] }, 200); }
    }
    // fallback to static file so UI never breaks if empty
    try {
      const fs = await import("node:fs/promises");
      const path = process.cwd() + "/public/today_scores.json";
      const txt = await fs.readFile(path, "utf8");
      return ok(JSON.parse(txt), 200);
    } catch {
      return ok({ generatedAt: null, scores: [] }, 200);
    }
  } catch (err: any) {
    return bad(err?.message || "GET failed", 500);
  }
}

// POST: write new scores (requires API key)
export async function POST(req: NextRequest) {
  try {
    if (!WRITE_API_KEY) return bad("SCORES_API_KEY not set on server", 500);
    if ((req.headers.get(API_KEY_HEADER) || "") !== WRITE_API_KEY) return bad("Unauthorized", 401);

    const body = await req.json();
    if (!isPayload(body)) return bad("Invalid payload: missing .scores[]", 400);

    const payload = { generatedAt: body.generatedAt || new Date().toISOString(), scores: body.scores };

    const redis = await getRedis();
    await redis.set(SCORES_KEY, JSON.stringify(payload));

    return ok({ ok: true, stored: { count: payload.scores.length, generatedAt: payload.generatedAt } }, 200);
  } catch (err: any) {
    return bad(err?.message || "POST failed", 500);
  }
}
