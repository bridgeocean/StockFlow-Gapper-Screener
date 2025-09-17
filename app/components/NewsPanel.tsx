"use client";

import { useEffect, useMemo, useState } from "react";

type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO or HH:mm:ss
  tag?: string;
};

type NewsPayload = { generatedAt?: string | null; items: NewsItem[] };

function parseTime(raw?: string): number | null {
  if (!raw) return null;
  try {
    const isoLike = /T|Z/.test(raw) ? raw : `1970-01-01T${raw}Z`;
    const ms = Date.parse(isoLike);
    return Number.isFinite(ms) ? ms : null;
  } catch { return null; }
}
const finvizTickerUrl = (t: string) => `https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}#news`;

function hhmm(ms?: number | null): string {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleTimeString([], { hour12: false }); } catch { return "—"; }
}

export default function NewsPanel({ tickers = [] }: { tickers?: string[] }) {
  const [payload, setPayload] = useState<NewsPayload>({ items: [] });
  const [loading, setLoading] = useState(false);

  async function fetchNews() {
    try {
      setLoading(true);
      const res = await fetch("/api/news", { cache: "no-store" });
      if (!res.ok) throw new Error("news fetch failed");
      const j = (await res.json()) as NewsPayload;
      setPayload({ generatedAt: j.generatedAt ?? null, items: Array.isArray(j.items) ? j.items : [] });
    } catch {
      setPayload({ items: [] });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, 60_000);
    return () => clearInterval(id);
  }, []);

  // 1) Filter to visible tickers
  const set = new Set(tickers.map((t) => t.toUpperCase()));
  let items = (payload.items || []).map((n) => ({
    ...n,
    ticker: (n.ticker || "").toUpperCase(),
    _ms: parseTime(n.published),
  }));
  const filtered = set.size ? items.filter((n) => set.has(n.ticker)) : items;

  // 2) If empty, fall back to latest overall (so panel is never blank)
  const useFallback = filtered.length === 0 && items.length > 0;
  const list = (useFallback ? items : filtered)
    .sort((a, b) => (b._ms ?? 0) - (a._ms ?? 0))
    .slice(0, 50);

  return (
    <aside className="rounded-2xl bg-white/5 border border-white/10 p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">
          Market News {useFallback ? <span className="text-xs opacity-70">(all tickers)</span> : null}
        </h3>
        <div className="text-xs opacity-70">
          {payload.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString([], { hour12: false }) : "—"}
        </div>
      </div>

      {loading && list.length === 0 ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-white/10 h-14" />
        ))}</div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm opacity-80">
          No news available.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((n, idx) => {
            const finviz = finvizTickerUrl(n.ticker);
            const full = n.url && /^https?:\/\//i.test(n.url) ? n.url : finviz;
            return (
              <li key={`${n.ticker}-${idx}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 border border-blue-400/40 text-blue-200">
                    {n.ticker}
                  </span>
                  {n.tag && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200">
                      {n.tag.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Title → Finviz (always reliable) */}
                <div className="font-medium leading-snug mb-1">
                  <a href={finviz} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-90">
                    {n.headline}
                  </a>
                </div>

                <div className="text-xs opacity-75 flex items-center gap-3">
                  <span>{n.source || "—"}</span>
                  <span>•</span>
                  <span>{hhmm(n._ms)}</span>
                </div>

                <div className="mt-2 flex items-center gap-4 text-sm">
                  <a href={full} target="_blank" rel="noopener noreferrer" className="underline text-blue-300 hover:opacity-90">
                    Full Story →
                  </a>
                  <a href={finviz} target="_blank" rel="noopener noreferrer" className="underline text-emerald-300 hover:opacity-90">
                    View on Finviz →
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
