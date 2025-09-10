// app/public-dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  ticker: string;
  price?: number | null;
  gap_pct: number;
  rvol: number;
  rsi14m: number;
  ai_score: number;
};

export default function PublicDashboard() {
  const [data, setData] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [minScore, setMinScore] = useState<number | "">("");
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");

  useEffect(() => {
    fetch("/today_scores.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((rows: Row[]) => setData(rows))
      .catch((e) => {
        console.error("Failed to load /today_scores.json", e);
        setData([]);
      });
  }, []);

  const filtered = useMemo(() => {
    return (data || [])
      .filter((r) =>
        q ? r.ticker.toUpperCase().includes(q.trim().toUpperCase()) : true
      )
      .filter((r) =>
        minScore !== "" ? r.ai_score >= Number(minScore) : true
      )
      .filter((r) =>
        minPrice !== "" && r.price != null ? r.price >= Number(minPrice) : true
      )
      .filter((r) =>
        maxPrice !== "" && r.price != null ? r.price <= Number(maxPrice) : true
      );
  }, [data, q, minScore, minPrice, maxPrice]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="text-2xl font-bold mb-4">Premarket AI Scores</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by ticker (e.g., AAPL)"
          className="border rounded px-3 py-2"
        />
        <input
          value={minScore}
          onChange={(e) => setMinScore(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Min AI score (0..1)"
          className="border rounded px-3 py-2"
          type="number"
          step="0.01"
          min={0}
          max={1}
        />
        <input
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Min price"
          className="border rounded px-3 py-2"
          type="number"
          step="0.01"
        />
        <input
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Max price"
          className="border rounded px-3 py-2"
          type="number"
          step="0.01"
        />
      </div>

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Ticker</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Gap %</th>
              <th className="text-right p-2">RelVol</th>
              <th className="text-right p-2">RSI(14m)</th>
              <th className="text-right p-2">AI Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-500" colSpan={6}>
                  {data.length === 0
                    ? "No data yet — run the Daily AI Score workflow (or check the scheduled run)."
                    : "No rows match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.ticker} className="border-t">
                  <td className="p-2 font-semibold">{r.ticker}</td>
                  <td className="p-2 text-right">{r.price ?? "-"}</td>
                  <td className="p-2 text-right">{r.gap_pct.toFixed(2)}</td>
                  <td className="p-2 text-right">{r.rvol.toFixed(2)}</td>
                  <td className="p-2 text-right">{r.rsi14m.toFixed(1)}</td>
                  <td className="p-2 text-right">{r.ai_score.toFixed(3)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Tip: set Min price = 1 and Max price = 5 to focus on your $1–$5 universe.
      </p>
    </main>
  );
}
