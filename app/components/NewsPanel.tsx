"use client";

import { useEffect, useMemo, useState } from "react";

type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO or HH:mm:ss
  tag?: string;       // Catalyst (FDA, OFFERING, M&A, ...)
};

type NewsPayload = {
  generatedAt?: string | null;
  items: NewsItem[];
};

function parseTime(raw?: string): number | null {
  if (!raw) return null;
  try {
    // Support either ISO strings or "HH:mm:ss"
    const isoLike = /T|Z/.test(raw) ? raw : `1970-01-01T${raw}Z`;
    const ms = Date.parse(isoLike);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function timeAgo(ms?: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m ago` : `${h}h ago`;
}

function hhmm(ms?: number | null): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

const finvizTickerUrl = (t: string) => `https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}#news`;

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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, 60_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const set = new Set(tickers.map((t) => t.toUpperCase()));
    let items = (payload.items || []).map((n) => ({
      ...n,
      ticker: (n.ticker || "").toUpperCase(),
      _ms: parseTime(n.published),
    }));

    // If tickers are provided (table page), filter to them; else show everything.
    if (set.size > 0) items = items.filter((n) => set.has(n.ticker));

    // Sort newest first and trim to 50 to keep panel snappy
    items.sort((a, b) => (b._ms ?? 0) - (a._ms ?? 0));
    return items.slice(0, 50);
  }, [payload.items, tickers]);

  return (
    <aside className="rounded-2xl bg-white/5 border border-white/10 p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Market News</h3>
        <div className="text-xs opacity-70">
          {payload.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString([], { hour12: false }) : "—"}
        </div>
      </div>

      {loading && filtered.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg bg-white/10 h-14" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm opacity-80">
          No matching news for the current tickers.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((n, idx) => {
            const ms = parseTime(n.published);
            const tag = n.tag ? n.tag.toUpperCase() : undefined;
            const fullLink = n.url && /^https?:\/\//i.test(n.url) ? n.url : undefined;
            return (
              <li key={`${n.ticker}-${idx}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 border border-blue-400/40 text-blue-200">
                    {n.ticker}
                  </span>
                  {tag && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200">
                      {tag}
                    </span>
                  )}
                </div>

                <div className="font-medium leading-snug mb-1">
                  {fullLink ? (
                    <a
                      href={fullLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:opacity-90"
                    >
                      {n.headline}
                    </a>
                  ) : (
                    <span>{n.headline}</span>
                  )}
                </div>

                <div className="text-xs opacity-75 flex items-center gap-3">
                  <span>{n.source || "—"}</span>
                  <span>•</span>
                  <span>{hhmm(ms)}</span>
                  <span>•</span>
                  <span>{timeAgo(ms)}</span>
                </div>

                <div className="mt-2 flex items-center gap-4 text-sm">
                  {fullLink ? (
                    <a
                      href={fullLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-300 hover:opacity-90"
                    >
                      Full Story →
                    </a>
                  ) : (
                    <span className="opacity-60">Full Story unavailable</span>
                  )}
                  <a
                    href={finvizTickerUrl(n.ticker)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-emerald-300 hover:opacity-90"
                    title="Open on Finviz (news tab)"
                  >
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
