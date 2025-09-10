'use client';

import * as React from 'react';

type ScoreRow = {
  ticker: string;
  date?: string;
  gap_pct?: number;
  rvol?: number;
  rsi14m?: number;
  score?: number;
  price?: number;
};

type TodayScores = {
  generatedAt: string | null;
  scores: ScoreRow[];
};

export default function PublicDashboardPage() {
  const [data, setData] = React.useState<TodayScores | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch('/api/today-scores', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as TodayScores;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // Optional auto-refresh every 60s
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const rows = data?.scores ?? [];

  return (
    <main style={{ maxWidth: 1000, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 6 }}>Public Gap Dashboard</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        {data?.generatedAt
          ? `Last updated: ${new Date(data.generatedAt).toLocaleString()}`
          : `Waiting for today's scores…`}
      </p>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

      {!loading && rows.length === 0 && !error && (
        <div style={{ padding: 12, background: '#fafafa', border: '1px solid #eee', borderRadius: 8 }}>
          <p>No scores yet. Make sure your “Daily AI Score (Polygon)” workflow ran and pushed
            <code style={{ marginLeft: 6, marginRight: 6 }}>public/today_scores.json</code> to <code>main</code>.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Ticker</Th>
                <Th>AI Score</Th>
                <Th>Gap %</Th>
                <Th>RelVol</Th>
                <Th>RSI(14m)</Th>
                <Th>Price</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.ticker + i} style={{ borderTop: '1px solid #eee' }}>
                  <Td>{i + 1}</Td>
                  <Td><strong>{r.ticker}</strong></Td>
                  <Td>{fmt(r.score)}</Td>
                  <Td>{fmtPct(r.gap_pct)}</Td>
                  <Td>{fmt(r.rvol)}</Td>
                  <Td>{fmt(r.rsi14m)}</Td>
                  <Td>{fmt(r.price)}</Td>
                  <Td>{r.date ? new Date(r.date).toLocaleDateString() : ''}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #ddd' }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '8px 6px' }}>{children}</td>;
}

function fmt(x: any) {
  return typeof x === 'number' && isFinite(x) ? x.toFixed(3) : '';
}
function fmtPct(x: any) {
  return typeof x === 'number' && isFinite(x) ? (x * 100).toFixed(2) + '%' : '';
}
