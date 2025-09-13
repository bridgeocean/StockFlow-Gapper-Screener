import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = path.join(process.cwd(), "public", "today_news.json");
  if (!fs.existsSync(p)) {
    return res.status(200).json({ generatedAt: null, count: 0, items: [] });
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const json = JSON.parse(raw);
    res.status(200).json(json);
  } catch (e: any) {
    res.status(200).json({ generatedAt: null, count: 0, items: [], error: String(e?.message || e) });
  }
}
