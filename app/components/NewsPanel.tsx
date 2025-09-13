'use client';

type NewsItem = {
  datetime?: string;
  ticker?: string;
  title?: string;
  link?: string;
  source?: string;
};

export default function NewsPanel({
  news,
  updatedAt,
  loading,
}: {
  news: NewsItem[];
  updatedAt: string | null;
  loading: boolean;
}) {
  return (
    <section className="bg-white rounded-2xl shadow p-4 md:p-6 h-full">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-semibold tracking-tight">Premarket News</h2>
        <span className="text-sm text-neutral-500">
          {updatedAt ? `Updated: ${updatedAt}` : loading ? 'Loading…' : ''}
        </span>
      </div>
      {loading ? (
        <div className="text-neutral-500">Fetching news…</div>
      ) : news.length === 0 ? (
        <div className="text-neutral-500">
          No news found. Ensure the “Daily AI Score (Finviz → News → JSON)” workflow committed <code>public/today_news.json</code>.
        </div>
      ) : (
        <ul className="space-y-3">
          {news.map((n, idx) => (
            <li key={idx} className="border border-neutral-200 rounded-xl p-3">
              <div className="text-xs text-neutral-500 mb-1">
                {n.datetime ? new Date(n.datetime).toLocaleString() : ''} {n.ticker ? `• ${n.ticker}` : ''} {n.source ? `• ${n.source}` : ''}
              </div>
              <a className="font-medium hover:underline" href={n.link ?? '#'} target="_blank" rel="noreferrer">
                {n.title ?? '(no title)'}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
