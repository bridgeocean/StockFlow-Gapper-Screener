import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION!;
const TABLE_SNAPSHOTS = process.env.DDB_TABLE_SNAPSHOTS!;
const TABLE_NEWS = process.env.DDB_TABLE_NEWS!;

if (!REGION || !TABLE_SNAPSHOTS || !TABLE_NEWS) {
  throw new Error("Missing AWS/DynamoDB env vars.");
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true }
});

export async function putSnapshot(item: {
  Ticker: string;
  Ts: string;            // ISO
  Price?: number;
  PremarketGapPct?: number;
  RelVol?: number;
  FloatShares?: number;
  RSI?: number | null;
  MarketPhase: string;
  Raw?: any;
}) {
  await ddb.send(new PutCommand({ TableName: TABLE_SNAPSHOTS, Item: item }));
}

export async function upsertNews(item: {
  HeadlineHash: string;
  Ticker: string;
  Ts: string;
  Headline: string;
  Source?: string;
  Url?: string;
}) {
  await ddb.send(new PutCommand({ TableName: TABLE_NEWS, Item: item }));
}
