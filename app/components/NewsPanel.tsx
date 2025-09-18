"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CatalystIcon from "@/app/components/CatalystIcon";

type StockRow = { symbol?: string; ticker?: string };
type NewsItem = {
  ticker: string;
  headline: string;
  url?: string;
  source?: string;
  published?: string; // ISO
  tag?: string;       // FDA/ERN/OFF/MA/PRT/ANL/CNT/LEG
};

function hhmm(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function NewsPanel() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [lastAt, setLastAt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      // 1) pull current dashboard tickers (first 20 covers both pages)
      const sRes = await fetch("/api/stocks", { cache: "no-store" });
      const sJson = await sRes.json();
      const rows: StockRow[] = Array.isArray(sJson?.data) ? sJson.data : [];
      const tickers = rows.map(r => (r.symbol || r.ticker || "").toUpperCase()).filter(Boolean).slice(0, 20);
      if (!tickers.length) {
        setItems([]); setLastAt(new Date().toISOString()); return;
      }
      // 2) ask the API for these tickers (API will fetch-on-demand if cache is empty)
      const nRes = await fetch(`/api/news?tickers=${encodeURIComponent(tickers.join(","))}`, { cache: "no-store" });
      const nJson = await nRes.json();
      setItems(Array.isArray(nJson?.items) ? nJson.items : []);
      setLastAt(nJson?.generatedAt || new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); pollRef.current = setInterval(refresh, 60_000); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const rendered = useMemo(() => {
    if (!items.length) {
      return <div className="text-sm text-muted-foreground px-4 py-6">No matching news for the current tickers.</div>;
    }
    return (
      <div className="space-y-3 p-3">
        {items.map((n, i) => {
          const finviz = `https://finviz.com/quote.ashx?t=${encodeURIComponent(n.ticker)}`;
          const full = n.url && /^https?:\/\//i.test(n.url) ? n.url : finviz;
          return (
            <div key={`${n.ticker}-${i}-${n.published || i}`} className="rounded-xl bg-[#101016] border border-white/5 px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-blue-950/60 border border-blue-400/20 text-blue-200 px-2 py-0.5 text-xs font-medium">
                  {n.ticker}
                </span>
                <span className="text-xs text-white/50">{hhmm(n.published)}</span>
                {n.source ? (<><span className="text-white/20">•</span><span className="text-xs text-white/60">{n.source}</span></>) : null}
                {n.tag ? (<><span className="text-white/20">•</span><CatalystIcon tag={n.tag} /></>) : null}
              </div>

              <a href={full} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-white hover:text-emerald-300 transition-colors">
                {n.headline || "News"}
              </a>

              <div className="mt-2 flex items-center gap-4 text-xs">
                <a href={full} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline">
                  Full Story →
                </a>
                <a href={finviz} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline">
                  View on Finviz →
                </a>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [items]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="text-white font-semibold">Market News</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">{lastAt ? new Date(lastAt).toLocaleTimeString() : ""}</span>
          <button onClick={refresh} className="text-xs rounded-md bg-white/5 hover:bg-white/10 text-white px-3 py-1.5" disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>
      {rendered}
    </div>
  );
}
