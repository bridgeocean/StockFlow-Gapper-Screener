// app/api/scores/route.ts
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv"; // pnpm add @vercel/kv

export const runtime = "nodejs"; // KV works great on node runtime

const KV_KEY = "today_scores";
const API_KEY_HEADER = "x-api-key";
const WRITE_API_KEY = process.env.SCORES_API_KEY || "";

// Basic shape guard (lightweight)
function isPayload(x: any) {
  if (!x || typeof x !== "object") return false;
  if (!Array.isArray(x.scores)) return false;
  return true;
}

export async function GET() {
  try {
    const raw = await kv.get(KV_KEY);
    if (raw) {
      // stored either as object or JSON string
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      return NextResponse.json(data, { status: 200 });
    }

    // Fallback: try public/today_scores.json so dashboards don't break if KV is empty
    try {
      const fs = await import("node:fs/promises");
      const path = process.cwd() + "/public/today_scores.json";
      const txt = await fs.readFile(path, "utf8");
      const data = JSON.parse(txt);
      return NextResponse.json(data, { status: 200 });
    } catch {
      return NextResponse.json({ generatedAt: null, scores: [] }, { status: 200 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "KV read failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get(API_KEY_HEADER) || "";
    if (!WRITE_API_KEY || key !== WRITE_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!isPayload(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Ensure generatedAt is present
    const payload = {
      generatedAt: body.generatedAt || new Date().toISOString(),
      scores: body.scores,
    };

    await kv.set(KV_KEY, payload);
    return NextResponse.json({ ok: true, stored: { count: payload.scores.length, generatedAt: payload.generatedAt } }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "KV write failed" }, { status: 500 });
  }
}
