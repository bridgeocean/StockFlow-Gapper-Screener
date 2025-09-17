import { NextResponse } from "next/server";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL!;
const SCORES_API_KEY = process.env.SCORES_API_KEY || "";
const redis = new Redis(REDIS_URL);

type Score = {
  ticker: string;
  score: number;     // 0..1 float
  gap_pct?: number | null;
  rvol?: number | null;
  rsi14m?: number | null;
  price?: number | null;
  volume?: number | null;
};
type Payload = { generatedAt: string | null; scores: Score[] };

function fnum(x: any): number | null {
  if (x === null || x === undefined || x === "") return null;
  const s = String(x).trim().replace(/%$/, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const raw = await redis.get("scores:payload");
    const payload: Payload = raw
      ? JSON.parse(raw)
      : { generatedAt: null, scores: [] };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { generatedAt: null, scores: [], error: e?.message || "scores error" },
      { status: 200 }
    );
  }
}

export async function POST(req: Request) {
  try {
    // Optional API key gate
    if (SCORES_API_KEY) {
      const k = (req.headers.get("x-api-key") || "").trim();
      if (k !== SCORES_API_KEY) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();
    const when = (body?.generatedAt && String(body.generatedAt)) || new Date().toISOString();

    const items: Score[] = Array.isArray(body?.scores) ? body.scores.map((r: any) => {
      const t = String(r?.ticker || "").toUpperCase().trim();
      return {
        ticker: t,
        score: Math.max(0, Math.min(1, Number(r?.score) || 0)),   // keep float
        gap_pct: fnum(r?.gap_pct),
        rvol: fnum(r?.rvol),
        rsi14m: fnum(r?.rsi14m),
        price: fnum(r?.price),
        volume: fnum(r?.volume),
      };
    }).filter((r: Score) => !!r.ticker) : [];

    const payload: Payload = { generatedAt: when, scores: items };

    // Store exactly as received (no rounding)
    await redis.set("scores:payload", JSON.stringify(payload), "EX", 60 * 60 * 6);
    await redis.set("scores:updatedAt", when);

    return NextResponse.json({ ok: true, count: items.length, generatedAt: when }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "bad json" }, { status: 400 });
  }
}
