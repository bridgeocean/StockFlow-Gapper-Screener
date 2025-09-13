// app/components/NewsPanel.tsx
"use client";

import { useEffect, useState } from "react";

type NewsItem = {
  ts?: string;
  ticker?: string;
  title?: string;
  url?: string;
  source?: string;
};

type NewsPayload = {
  generatedAt?: string | null;
  news?: NewsItem[];
};

export default function NewsPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);

  async function load() {
    try {
      const res = await fetch("/today_news.json", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as NewsPayload;
      setNews((j.news || []).slice(0, 10));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Market News</h3>
        <button
          className="text-xs rounded-lg border border-white/15 px-2 py-1 hover:bg-white/10"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {news.length === 0 && (
          <div className="text-sm opacity-70">No news yet.</div>
        )}
        {news.map((n, i) => (
          <a
            key={i}
            href={n.url || "#"}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2 hover:border-violet-300/40"
          >
            <div className="text-xs opacity-60">
              {n.ticker ? `${n.ticker} • ` : ""}{friendlyTime(n.ts)}{n.source ? ` • ${n.source}` : ""}
            </div>
            <div className="mt-1">{n.title || "Open story"}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function friendlyTime(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false });
  } catch {
    return "";
  }
}
