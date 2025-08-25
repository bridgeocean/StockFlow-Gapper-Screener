import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getMarketPhaseET } from "@/lib/market-hours";
import { fetchFinvizExport } from "@/lib/finviz-export";
import { putSnapshot } from "@/lib/ddb";

export async function GET(req: Request) {
  // Optional auth for Vercel Cron
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const phase = getMarketPhaseET(new Date());
    if (phase === "CLOSED") {
      return NextResponse.json({ ok: true, skipped: "market closed" });
    }

    const rows = await fetchFinvizExport();
    if (!rows?.length) return NextResponse.json({ ok: true, count: 0 });

    const ts = new Date().toISOString();

    for (const r of rows) {
      if (!r.ticker) continue;

      // pick the best % column available from your export
      const pct =
        r.gap_pct ??
        r.change_pct ??
        r.perf_today_pct ??
        undefined;

      await putSnapshot({
        Ticker: r.ticker,
        Ts: ts,
        Price: r.price,
        PremarketGapPct: pct,      // Gap > Change > Performance
        RelVol: r.relative_volume,
        FloatShares: r.float_shares, // absolute shares (e.g., 9.54M -> 9540000)
        RSI: r.rsi ?? null,
        MarketPhase: phase,
        Raw: r.raw
      });
    }

    return NextResponse.json({ ok: true, count: rows.length, ts });
  } catch (err: any) {
    console.error("snapshot error", err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
