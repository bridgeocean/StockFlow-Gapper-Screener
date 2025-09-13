'use client';

import { useEffect, useState, useMemo } from 'react';
import NewsPanel from '../components/NewsPanel';

type ScoreRow = {
  ticker: string;
  score: number;
  gap_pct?: number | null;
  rvol?: number | null;
  rsi14m?: number | null;
};

type ScoresPayload = {
  generatedAt: string | null;
  scores: ScoreRow[];
};

type NewsItem = {
  datetime?: string;
  ticker?: string;
  title?: string;
  link?: string;
  source?: string;
};
type NewsPayload = {
  generatedAt: string | null;
  items: NewsItem[];
};

export default function PublicDashboardPage() {
  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [news, setNews] = useState<NewsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [s, n] = await Promise.allSettled([
          fetch('/today_scores.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : { generatedAt: null, scores: [] }),
          fetch('/today_news.json',   { cache: 'no-store' }).then(r => r.ok ? r.json() : { generatedAt: null, items: [] }),
        ]);
        if (cancelled) return;

        if (s.status === 'fulfilled') setScores(s.value as ScoresPayload);
        else setScores({ generatedAt: null, scores: [] });

        if (n.status === 'fulfilled') setNews(n.value as NewsPayload);
        else setNews({ generatedAt: null, items: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => (scores?.scores ?? []).slice().sort((a,b) => (b.score - a.score)), [scores]);

  return (
    <main className="min-h-screen p-6 md:p-10 bg-neutral-50">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scores */}
        <section className="lg:col-span-2 bg-white rounded-2xl shadow p-4 md:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h1 className="text-2xl font-semibold tracking-tight">Today’s AI Scores</h1>
            <span className="text-sm text-neutral-500">
              {scores?.generatedAt ? `Updated: ${scores.generatedAt}` : loading ? 'Loading…' : 'No scores yet'}
            </span>
          </div>

          {loading ? (
            <div className="text-neutral-500">Fetching latest scores…</div>
          ) : rows.length === 0 ? (
            <div className="text-neutral-500">No scores yet. Ensure the “Daily AI Score” workflow committed <code>public/today_scores.json</code>.</div>
          ) : (
            <div className="overflow-auto rounded-xl border border-neutral-200">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Ticker</th>
                    <th className="px-3 py-2 text-right font-medium">AI Score</th>
                    <th className="px-3 py-2 text-right font-medium">Gap %</th>
                    <th className="px-3 py-2 text-right font-medium">RVOL</th>
                    <th className="px-3 py-2 text-right font-medium">RSI(14m)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ticker} className="odd:bg-white even:bg-neutral-50">
                      <td className="px-3 py-2 font-semibold">{r.ticker}</td>
                      <td className="px-3 py-2 text-right">{r.score.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right">{r.gap_pct ?? ''}</td>
                      <td className="px-3 py-2 text-right">{r.rvol ?? ''}</td>
                      <td className="px-3 py-2 text-right">{r.rsi14m ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* News */}
        <aside className="lg:col-span-1">
          <NewsPanel news={news?.items ?? []} updatedAt={news?.generatedAt ?? null} loading={loading} />
        </aside>
      </div>
    </main>
  );
}
