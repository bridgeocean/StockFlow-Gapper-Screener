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
      const first = mins[0]; // regular open approximation is fine for this test
      GapPctPoly = ((first.o - prevClose) / prevClose) * 100;
    }

    return res.status(200).json({
      ok: true,
      bars: mins.length,
      prevClose,
      avgVol30,
      RSI14m,
      RelVolPoly,
      GapPctPoly
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
