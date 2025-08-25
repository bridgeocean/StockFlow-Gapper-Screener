import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getMarketPhaseET } from "@/lib/market-hours";
import { fetchFinvizExport } from "@/lib/finviz-export";
import { putSnapshot } from "@/lib/ddb";

export async function GET() {
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
      await putSnapshot({
        Ticker: r.ticker,
        Ts: ts,
        Price: r.price,
        PremarketGapPct: r.change_pct,      // using 'change' for now
        RelVol: r.relative_volume,
        FloatShares: r.float_shares_m ? Math.round(r.float_shares_m * 1_000_000) : undefined,
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
