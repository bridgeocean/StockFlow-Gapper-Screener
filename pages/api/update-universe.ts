// pages/api/update-universe.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Body =
  | { tickers: string[] }
  | { text: string } // newline or comma separated tickers
  | { tickers: string[]; priceMin?: number; priceMax?: number }
  | { text: string; priceMin?: number; priceMax?: number };

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
  DASHBOARD_ADMIN_KEY, // simple shared secret: send as Authorization: Bearer <key>
} = process.env;

const FILE_PATH = "public/finviz_universe.json";

function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

function normalizeTickers(input: string[] | string): string[] {
  let arr: string[] = [];
  if (Array.isArray(input)) {
    arr = input;
  } else {
    // allow pasted text like "AAPL, TSLA\nAMD"
    arr = input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // uppercase, dedupe, simple sanity filter
  const dedup = Array.from(new Set(arr.map((t) => t.toUpperCase())));
  return dedup.filter((t) => /^[A-Z.\-]{1,10}$/.test(t));
}

async function getCurrentSha(): Promise<string | undefined> {
  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(
      FILE_PATH
    )}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );
  if (resp.status === 200) {
    const j = await resp.json();
    return j.sha as string | undefined;
  }
  return undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Basic hardening
  if (req.method !== "POST") return bad(res, 405, "Use POST");
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return bad(res, 500, "Server not configured (GitHub env missing).");
  }
  if (!DASHBOARD_ADMIN_KEY) {
    return bad(res, 500, "Server not configured (admin key missing).");
  }
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${DASHBOARD_ADMIN_KEY}`) {
    return bad(res, 401, "Unauthorized");
  }

  const body: Body = req.body || {};
  const tickers =
    "tickers" in body && body.tickers
      ? normalizeTickers(body.tickers)
      : "text" in body && body.text
      ? normalizeTickers(body.text)
      : [];

  if (!tickers.length) return bad(res, 400, "Provide tickers[] or text");

  // Optional price info (stored for reference only; scorer uses STRICT_FINVIZ by default)
  const asof = new Date().toISOString().slice(0, 10);
  const payload = {
    asof,
    tickers,
    // priceMin: "priceMin" in body ? body.priceMin : undefined,
    // priceMax: "priceMax" in body ? body.priceMax : undefined,
  };

  const content = Buffer.from(JSON.stringify(payload, null, 2)).toString("base64");
  const sha = await getCurrentSha();

  const commitResp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(
      FILE_PATH
    )}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Update finviz_universe.json (${tickers.length} tickers)`,
        content,
        branch: GITHUB_BRANCH,
        sha, // include if file exists
      }),
    }
  );

  if (commitResp.status >= 300) {
    const txt = await commitResp.text();
    return bad(res, 500, `GitHub commit failed: ${txt.slice(0, 300)}`);
  }

  // Success: the push below will trigger the scorer (see workflow push path filter)
  return res.status(200).json({ ok: true, saved: tickers.length, file: FILE_PATH });
}
