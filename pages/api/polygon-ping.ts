// pages/api/polygon-ping.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getPrevClose, getDailyAvgVol, getTodayMinuteAggs } from "../../lib/polygon";
import { rsi } from "../../lib/indicators";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!process.env.POLYGON_API_KEY) {
      return res.status(200).json({ ok: false, reason: "POLYGON_API_KEY missing" });
    }
    const ticker = "AAPL";
    const [prevClose, avgVol30, mins] = await Promise.all([
      getPrevClose(ticker),
      getDailyAvgVol(ticker, 30),
      getTodayMinuteAggs(ticker),
    ]);
    const closes = mins.map(m => m.c);
    const RSI14m = rsi(closes, 14);
    const cumVol = mins.reduce((s, m) => s + (m?.v ?? 0), 0);
    const RelVolPoly = avgVol30 ? cumVol / avgVol30 : null;

    let GapPctPoly: number | null = null;
    if (mins.length && typeof prevClose === "number" && prevClose > 0) {
      const first = mins[0];
      GapPctPoly = ((first.o - prevClose) / prevClose) * 100;
    }
    res.status(200).json({ ok: true, prevClose, avgVol30, bars: mins.length, RSI14m, RelVolPoly, GapPctPoly });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
