// app/components/NewsPanel.tsx
"use client";

import { useEffect, useState, useMemo } from "react";

type NewsItem = {
  datetime?: string;   // ISO string from our JSON (if present)
  date?: string;       // some feeds use 'date'
  ticker?: string;
  title?: string;
  headline?: string;
  source?: string;
  url?: string;
};

type NewsPayload = {
  count?: number;
  items?: NewsItem[];
  generatedAt?: string;
};

function formatTime(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NewsPanel() {
  const [data, setData] = useState<NewsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch once at mount; you can add polling if you want live refresh
  useEffect(() => {
    let active = true;
    const fetchNews = async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("/today_news.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as NewsPayload;
        if (active) setData(json);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load news.");
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchNews();
    return () => { active = false; };
  }, []);

  const items = useMemo(() => {
    const raw = data?.items ?? [];
    // Normalize: some feeds use 'headline' instead of 'title'
    return raw.map((r) => ({
      ...r,
      title: r.title || r.headline || "",
      datetime: r.datetime || r.date || "",
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="font-semibold mb-2">News</div>
        <div className="text-sm opacity-70">Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="font-semibold mb-2">News</div>
        <div className="text-sm text-red-600">Error: {err}</div>
        <div className="text-xs opacity-70 mt-1">
          Tip: ensure <code>public/today_news.json</code> is committed by the daily job.
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="font-semibold mb-2">News</div>
        <div className="text-sm opacity-70">No news yet for today.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-semibold">News</div>
        {data?.generatedAt && (
          <div className="text-xs opacity-60">
            Updated {formatTime(data.generatedAt)}
          </div>
        )}
      </div>

      <ul className="space-y-3">
        {items.slice(0, 50).map((n, idx) => (
          <li key={idx} className="border rounded-xl p-3 hover:shadow-sm transition">
            <div className="text-xs opacity-60 mb-1">
              {n.ticker ? <span className="font-mono mr-2">{n.ticker}</span> : null}
              {n.source ? <span className="mr-2">{n.source}</span> : null}
              {n.datetime ? formatTime(n.datetime) : null}
            </div>
            <div className="font-medium">
              {n.url ? (
                <a className="underline underline-offset-2" href={n.url} target="_blank" rel="noreferrer">
                  {n.title || "(no title)"}
                </a>
              ) : (
                n.title || "(no title)"
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
