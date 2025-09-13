// app/public-dashboard/page.tsx
import dynamic from "next/dynamic";

// Avoid SSR issues for client components
const NewsPanel = dynamic(() => import("../components/NewsPanel"), { ssr: false });

export const revalidate = 0;

async function getScores() {
  // The scores JSON is committed at public/today_scores.json by the Action
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/today_scores.json`, {
      cache: "no-store",
    });
    if (!res.ok) return { generatedAt: null, scores: [] as any[] };
    return res.json();
  } catch {
    return { generatedAt: null, scores: [] as any[] };
  }
}

export default async function PublicDashboard() {
  const { generatedAt, scores } = await getScores();

  return (
    <main className="mx-auto max-w-6xl p-4 space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Gapper Screener — Public Dashboard</h1>
        {generatedAt && (
          <div className="text-xs opacity-60">
            Scores updated {new Date(generatedAt).toLocaleString()}
          </div>
        )}
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Scores table (2/3 width) */}
        <section className="md:col-span-2 rounded-2xl border p-4 shadow-sm">
          <div className="font-semibold mb-3">Today’s Scores</div>
          {!scores?.length ? (
            <div className="text-sm opacity-70">No scores yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Ticker</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Gap %</th>
                    <th className="py-2 pr-3">RSI(14m)</th>
                    <th className="py-2 pr-3">RelVol</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((r: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono">{r.ticker}</td>
                      <td className="py-2 pr-3">{r.score?.toFixed?.(3) ?? r.score}</td>
                      <td className="py-2 pr-3">{r.gap_pct ?? r.gapPct ?? ""}</td>
                      <td className="py-2 pr-3">{r.rsi14m ?? ""}</td>
                      <td className="py-2 pr-3">{r.rvol ?? r.relvol ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* News panel (1/3 width) */}
        <aside className="md:col-span-1">
          <NewsPanel />
        </aside>
      </div>
    </main>
  );
}
