import type { NextApiRequest, NextApiResponse } from "next";
import { getMarketPhaseET } from "../../lib/market-hours";
import { fetchFinvizExport } from "../../lib/finviz-export";
import { putSnapshot } from "../../lib/ddb";
import { getPrevClose, getDailyAvgVol, getTodayMinuteAggs } from "../../lib/polygon";
import { rsi } from "../../lib/indicators";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const phase = getMarketPhaseET(new Date());
    if (phase === "CLOSED") return res.status(200).json({ ok: true, skipped: "market closed" });

    const finviz = await fetchFinvizExport();
    if (!finviz?.length) return res.status(200).json({ ok: true, count: 0 });

    const ts = new Date().toISOString();
    let wrote = 0;

    for (const r of finviz) {
      const ticker: string | undefined = r.ticker;
      if (!ticker) continue;

      // --- enrichment via Polygon (best-effort, never throws) ---
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

            // find first bar at/after 09:30 ET (approx 13:30 UTC). We’ll just use the first bar of the day if not found.
            const nineThirtyUTC = new Date();
            nineThirtyUTC.setUTCHours(13, 30, 0, 0);
            const firstRegular = mins.find(a => a.t >= nineThirtyUTC.getTime()) ?? mins[0];
            if (firstRegular && typeof prevClose === "number" && prevClose > 0) {
              GapPctPoly = ((firstRegular.o - prevClose) / prevClose) * 100;
            }
          }
        } catch { /* ignore enrichment errors */ }
      }

      // best available % from finviz export (may be undefined)
      const pct = r.gap_pct ?? r.change_pct ?? r.perf_today_pct ?? undefined;

      await putSnapshot({
        Ticker: ticker,
        Ts: ts,
        Price: r.price,
        PremarketGapPct: pct,
        RelVol: r.relative_volume,      // if Finviz ever supplies it
        FloatShares: r.float_shares,    // if Finviz ever supplies it
        RSI: r.rsi ?? null,             // Finviz RSI if present
        // Enriched fields:
        RSI14m: RSI14m ?? undefined,
        RelVolPoly: RelVolPoly ?? undefined,
        GapPctPoly: GapPctPoly ?? undefined,
        MarketPhase: phase,
        Raw: r.raw,
      });

      wrote++;
    }

    return res.status(200).json({ ok: true, count: wrote, ts });
  } catch (e: any) {
    console.error("snapshot error", e);
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
