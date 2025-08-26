import type { NextApiRequest, NextApiResponse } from "next";
import { getMarketPhaseET } from "../../lib/market-hours";
import { fetchFinvizExport } from "../../lib/finviz-export";
import { putSnapshot } from "../../lib/ddb";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Optional auth for Vercel Cron
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  try {
    const phase = getMarketPhaseET(new Date());
    if (phase === "CLOSED") {
      return res.status(200).json({ ok: true, skipped: "market closed" });
    }

    const rows = await fetchFinvizExport();
    if (!rows?.length) return res.status(200).json({ ok: true, count: 0 });

    const ts = new Date().toISOString();
    for (const r of rows) {
      if (!r.ticker) continue;

      const pct = r.gap_pct ?? r.change_pct ?? r.perf_today_pct ?? undefined;

      await putSnapshot({
        Ticker: r.ticker,
        Ts: ts,
        Price: r.price,
        PremarketGapPct: pct,        // Gap > Change > Performance
        RelVol: r.relative_volume,   // parsed or computed
        FloatShares: r.float_shares, // absolute number
        RSI: r.rsi ?? null,
        MarketPhase: phase,
        Raw: r.raw
      });
    }

    return res.status(200).json({ ok: true, count: rows.length, ts });
  } catch (e: any) {
    console.error("snapshot error", e);
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
