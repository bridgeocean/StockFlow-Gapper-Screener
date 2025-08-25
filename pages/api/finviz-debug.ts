// pages/api/finviz-debug.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchFinvizExport } from "@/lib/finviz-export";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const rows = await fetchFinvizExport();
    const sample = rows[0] || {};
    res.status(200).json({
      ok: true,
      keys: Object.keys(sample),
      sample, // one normalized row we parsed
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
