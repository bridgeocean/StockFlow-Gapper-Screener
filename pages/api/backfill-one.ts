import type { NextApiRequest, NextApiResponse } from "next";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getPrevClose, getDailyAvgVol, getTodayMinuteAggs } from "../../lib/polygon";
import { rsi } from "../../lib/indicators";

const TABLE = process.env.DDB_TABLE_SNAPSHOTS!;
const REGION = process.env.AWS_REGION!;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const url = new URL(req.url || "", "https://x");
    const Ticker = (url.searchParams.get("symbol") || "").toUpperCase();
    const Ts = url.searchParams.get("ts") || ""; // ISO timestamp of the item to update

    if (!Ticker || !Ts) {
      return res.status(400).json({ ok: false, error: "Use ?symbol=NVDA&ts=2025-08-27T21:10:00.000Z" });
    }

    let RSI14m: number | null = null;
    let RelVolPoly: number | null = null;
    let GapPctPoly: number | null = null;

    if (process.env.POLYGON_API_KEY) {
      const [prevClose, avgVol30, mins] = await Promise.all([
        getPrevClose(Ticker),
        getDailyAvgVol(Ticker, 30),
        getTodayMinuteAggs(Ticker),
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
    }

    // Update the existing item (add only the new attributes)
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { Ticker, Ts },
        UpdateExpression:
          "SET RSI14m = :rsi, RelVolPoly = :rv, GapPctPoly = :gap",
        ExpressionAttributeValues: {
          ":rsi": RSI14m ?? null,
          ":rv": RelVolPoly ?? null,
          ":gap": GapPctPoly ?? null,
        },
      })
    );

    res.status(200).json({ ok: true, updated: { Ticker, Ts }, values: { RSI14m, RelVolPoly, GapPctPoly } });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
