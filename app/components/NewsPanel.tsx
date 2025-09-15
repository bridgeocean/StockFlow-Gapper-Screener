"use client";

import { useEffect, useMemo, useState } from "react";

type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO or "HH:mm:ss"
  summary?: string;
};

type NewsPayload = {
  generatedAt?: string | null;
  items: NewsItem[];
};

function parseNewsTime(raw?: string): number | null {
  if (!raw) return null;
  try {
    const isoLike = /T|Z/.test(raw) ? raw : `1970-01-01T${raw}Z`;
    const ms = Date.parse(isoLike);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function timeAgo(ms: number | null) {
  if (ms == null) return "—";
  const diff = Date.now() - ms;
  if (diff < 0) return "now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h${r ? ` ${r}m` : ""} ago`;
}

export default function NewsPanel({
  tickers,
  pollMs = 60_000,
}: {
  tickers: string[];
  pollMs?: number;
}) {
  const [payload, setPayload] = useState<NewsPayload>({ generatedAt: null, items: [] });

  async function load() {
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as NewsPayload;
        setPayload(j);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  const items = useMemo(() => {
    const want = new Set((tickers || []).map((t) => String(t).toUpperCase()));
    const list = (payload.items || []).filter((n) => want.has(String(n.ticker || "").toUpperCase()));
    return list
      .map((n) => ({ ...n, _ts: parseNewsTime(n.published) }))
      .sort((a, b) => (b._ts ?? 0) - (a._ts ?? 0));
  }, [payload.items, tickers]);

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Market News</h2>
        <div className="text-xs opacity-70">
          {payload.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString([], { hour12: false }) : "—"}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm opacity-70">
          No matching news for the current tickers.
        </div>
      ) : (
        <ul className="divide-y divide-white/10">
          {items.map((n, i) => {
            const ts = parseNewsTime(n.published);
            return (
              <li key={`${n.ticker}-${i}`} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center rounded-md bg-blue-500/15 text-blue-300 border border-blue-400/30 px-2 py-0.5 text-xs tracking-wide">
                    {n.ticker?.toUpperCase() || "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {n.url ? (
                        <a
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline break-words"
                          title={n.headline}
                        >
                          {n.headline || "Untitled"}
                        </a>
                      ) : (
                        <span className="font-medium break-words">{n.headline || "Untitled"}</span>
                      )}
                    </div>

                    {n.summary ? (
                      <p className="mt-1 text-sm opacity-80 line-clamp-3">{n.summary}</p>
                    ) : null}

                    <div className="mt-2 flex items-center gap-3 text-xs opacity-70">
                      <span>{n.source || "—"}</span>
                      <span>•</span>
                      <span>{ts ? new Date(ts).toLocaleTimeString([], { hour12: false }) : "—"}</span>
                      <span>•</span>
                      <span>{timeAgo(ts)}</span>
                      {n.url ? (
                        <>
                          <span>•</span>
                          <a
                            className="underline hover:no-underline"
                            href={n.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Full Story →
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
