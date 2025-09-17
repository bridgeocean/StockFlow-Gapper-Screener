import { NextResponse } from "next/server";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL!;
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tickersParam = url.searchParams.get("tickers");
    const filterSet = new Set(
      (tickersParam || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    );

    const raw = (await redis.get("news:payload")) || "";
    const payload: Payload = raw
      ? JSON.parse(raw)
      : { generatedAt: null, items: [] };

    const items = filterSet.size
      ? payload.items.filter((n) => filterSet.has((n.ticker || "").toUpperCase()))
      : payload.items;

    return NextResponse.json({ generatedAt: payload.generatedAt, items });
  } catch (e: any) {
    return NextResponse.json(
      { generatedAt: null, items: [], error: e?.message || "news error" },
      { status: 200 }
    );
  }
}
