// pages/api/cron-snapshot.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getMarketPhaseET } from "../../lib/market-hours";
import { fetchFinvizExport } from "../../lib/finviz-export";
import { putSnapshot } from "../../lib/ddb";
import { getPrevClose, getDailyAvgVol, getTodayMinuteAggs } from "../../lib/polygon";
import { rsi } from "../../lib/indicators";
import { scoreWithCurrentModel } from "../../lib/ai-score";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    const finviz = await fetchFinvizExport();
    if (!finviz?.length) return res.status(200).json({ ok: true, count: 0 });

    const ts = new Date().toISOString();
    let wrote = 0;

    for (const r of finviz as any[]) {
      const ticker: string | undefined = r.ticker;
      if (!ticker) continue;

      // ---------- Polygon enrichment ----------
      let RSI14m: number | null = null;
      let RelVolPoly: number | null = null;
      let GapPctPoly: number | null = null;
      let ChangeFromOpenPct: number | null = null;

      if (process.env.POLYGON_API_KEY) {
        try {
          const [prevClose, avgVol30, mins] = await Promise.all([
            getPrevClose(ticker),
            getDailyAvgVol(ticker, 30),
            getTodayMinuteAggs(ticker), // minute bars today asc
          ]);

          if (mins?.length) {
            const closes = mins.map((a) => a.c);
            const highs = mins.map((a) => a.h);
            const volumes = mins.map((a) => a.v);
            const open0930 = closes[0];
            const priceNow = closes[closes.length - 1];

            RSI14m = rsi(closes, 14);
            // rsi() returns single? If your rsi returns array, adapt accordingly.

            // cum vol
            const cum = volumes.reduce((acc: number[], v: number) => {
              acc.push((acc[acc.length - 1] || 0) + (v || 0));
              return acc;
            }, []);
            const elapsedMin = closes.length;
            if (avgVol30 && avgVol30 > 0) {
              RelVolPoly = cum[cum.length - 1] / (avgVol30 * Math.max(elapsedMin / 390.0, 1e-6));
            }

            if (prevClose && prevClose > 0 && open0930) {
              GapPctPoly = ((open0930 - prevClose) / prevClose) * 100;
            }
            if (open0930) {
              ChangeFromOpenPct = ((priceNow - open0930) / open0930) * 100;
            }
          }
        } catch {}
      }

      // ---------- Choose best % from Finviz export as backup ----------
      const pct = r.gap_pct ?? r.change_pct ?? r.perf_today_pct ?? undefined;

      // ---------- AI Score (if model available) ----------
      const aiScore = scoreWithCurrentModel({
        change_open_pct: ChangeFromOpenPct ?? 0,
        gap_pct: GapPctPoly ?? (pct ?? 0),
        rvol: RelVolPoly ?? (r.relative_volume ?? 0),
        rsi14m: (RSI14m ?? r.rsi ?? 50),
      });

      await putSnapshot({
        Ticker: ticker,
        Ts: ts,
        Price: r.price,
        PremarketGapPct: pct,
        MarketPhase: phase,
        // Original finviz-parsed fields you already wrote:
        RelVol: r.relative_volume,
        FloatShares: r.float_shares,
        RSI: r.rsi ?? null,
        // Enriched fields:
        RSI14m: RSI14m ?? undefined,
        RelVolPoly: RelVolPoly ?? undefined,
        GapPctPoly: GapPctPoly ?? undefined,
        ChangeFromOpenPct: ChangeFromOpenPct ?? undefined,
        AIScore: aiScore ?? undefined,
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
