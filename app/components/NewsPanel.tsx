// app/components/NewsPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type NewsItem = {
  ticker: string;
  headline: string;
  summary?: string;
  source?: string;
  url?: string;
  published?: string; // ISO or "HH:mm:ss"
};

type NewsPayload = {
  generatedAt?: string | null;
  items: NewsItem[];
};

function fmtTime(input?: string) {
  if (!input) return "—";
  try {
    // Accept plain time strings or ISO
    const d = /T|Z/.test(input) ? new Date(input) : new Date(`1970-01-01T${input}Z`);
    return d.toLocaleTimeString([], { hour12: false });
  } catch {
    return input;
  }
}

export default function NewsPanel({ tickers }: { tickers?: string[] }) {
  const [data, setData] = useState<NewsPayload>({ generatedAt: null, items: [] });

  async function load() {
    try {
      const res = await fetch("/news.json", { cache: "no-store" });
      if (!res.ok) throw new Error("news fetch failed");
      const j = (await res.json()) as NewsPayload;
      setData({
        generatedAt: j?.generatedAt ?? null,
        items: Array.isArray(j?.items) ? j.items : [],
      });
    } catch {
      setData({ generatedAt: null, items: [] });
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (!tickers?.length) return data.items ?? [];
    const allow = new Set(tickers.map((t) => t.toUpperCase()));
    return (data.items ?? []).filter((n) => allow.has((n.ticker || "").toUpperCase()));
  }, [data.items, tickers]);

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10">
      <header className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <span className="text-lg font-semibold">Market News</span>
        <span className="ml-auto text-xs text-white/60">
          {data.generatedAt ? `Updated ${fmtTime(data.generatedAt)}` : ""}
        </span>
      </header>

      <div className="p-3 space-y-4 max-h-[540px] overflow-auto">
        {filtered.length === 0 && (
          <div className="text-sm text-white/60 px-2 py-6 text-center">
            No matching news for the current tickers.
          </div>
        )}

        {filtered.map((n, i) => (
          <article
            key={`${n.ticker}-${i}-${n.published ?? ""}`}
            className="rounded-xl bg-black/35 border border-white/10 px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/10">
                {(n.ticker || "").toUpperCase()}
              </span>
              <div className="flex-1">
                <div className="font-semibold leading-snug">{n.headline}</div>
                {n.summary && (
                  <p className="text-sm text-white/70 mt-1">{n.summary}</p>
                )}
                <div className="text-xs text-white/60 mt-2 flex items-center gap-2 flex-wrap">
                  <span>Source: {n.source || "—"}</span>
                  <span className="opacity-60">•</span>
                  <span>{fmtTime(n.published)}</span>
                  {n.url && (
                    <>
                      <span className="opacity-60">•</span>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Full Story →
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="ml-2 text-xs opacity-60 whitespace-nowrap">
                {fmtTime(n.published)}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
