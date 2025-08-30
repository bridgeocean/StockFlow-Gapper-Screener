import type { NextApiRequest, NextApiResponse } from "next";
import { getMarketPhaseET } from "../../lib/market-hours";
import { putSnapshot } from "../../lib/ddb";
import { getPrevClose, getDailyAvgVol, getTodayMinuteAggs } from "../../lib/polygon";
import { rsi } from "../../lib/indicators";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = new URL(req.url ?? "", "https://x").searchParams;
    const ticker = (q.get("symbol") || "AAPL").toUpperCase();

    const nowTs = new Date().toISOString();
    const phase = getMarketPhaseET(new Date());

    let RSI14m: number | null = null;
    let RelVolPoly: number | null = null;
    let GapPctPoly: number | null = null;

    if (process.env.POLYGON_API_KEY) {
      try {
        const [prevClose, avgVol30, mins] = await Promise.all([
          getPrevClose(ticker),
          getDailyAvgVol(ticker, 30),
          getTodayMinuteAggs(ticker),
        ]);
        if (mins?.length) {
          const closes = mins.map(a => a.c);
          RSI14m = rsi(closes, 14);
          const cumVol = mins.reduce((s, a) => s + (a?.v ?? 0), 0);
          if (avgVol30 && avgVol30 > 0) RelVolPoly = cumVol / avgVol30;
          const first = mins[0];
          if (typeof prevClose === "number" && prevClose > 0) {
            GapPctPoly = ((first.o - prevClose) / prevClose) * 100;
          }
        }
      } catch {}
    }

    // write a minimal sample snapshot with enrichment fields
    await putSnapshot({
      Ticker: ticker,
      Ts: nowTs,
      Price: undefined,
      PremarketGapPct: undefined,
      RSI: null,
      RSI14m: RSI14m ?? undefined,
      RelVolPoly: RelVolPoly ?? undefined,
      GapPctPoly: GapPctPoly ?? undefined,
      MarketPhase: phase,
      Raw: { source: "force-snapshot" }
    });

    return res.status(200).json({
      ok: true,
      wrote: ticker,
      ts: nowTs,
      fields: { RSI14m, RelVolPoly, GapPctPoly }
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
