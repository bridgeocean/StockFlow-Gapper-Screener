import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Proxies the latest public/today_scores.json from GitHub main branch,
 * so the UI always sees fresh data without a redeploy.
 *
 * Required Vercel env vars (Project Settings → Environment Variables):
 * - GITHUB_OWNER (e.g. "bridgeocean")
 * - GITHUB_REPO  (e.g. "Gapper-Screener-yh")
 * - GITHUB_BRANCH (optional, default "main")
 * Optional:
 * - GITHUB_TOKEN (for private repos; PAT with repo:read)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const owner = process.env.GITHUB_OWNER!;
    const repo = process.env.GITHUB_REPO!;
    const branch = process.env.GITHUB_BRANCH || 'main';
    if (!owner || !repo) {
      res.status(500).json({ error: 'Server not configured: missing GITHUB_OWNER or GITHUB_REPO' });
      return;
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/public/today_scores.json`;

    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache',
      'Accept': 'application/json',
    };
    // Use token if present (needed for private repo or to avoid rate limits)
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const r = await fetch(rawUrl, { headers });
    if (r.status === 404) {
      // Not created yet — return empty list instead of blowing up the UI
      res.status(200).json({ generatedAt: null, scores: [] });
      return;
    }
    if (!r.ok) {
      res.status(r.status).json({ error: `Upstream error ${r.status}` });
      return;
    }

    // Pass through JSON
    const txt = await r.text();
    try {
      const json = JSON.parse(txt);
      res.setHeader('Cache-Control', 'no-cache');
      res.status(200).json(json);
    } catch {
      // If the file is being written at the exact moment and is temporarily invalid, return empty
      res.status(200).json({ generatedAt: null, scores: [] });
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Unknown server error' });
  }
}
