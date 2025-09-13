"use client";
import { useEffect, useState } from "react";

type ScoreRow = { ticker: string; score: number | null };
type ScoresPayload = {
  generatedAt: string | null;
  scores: ScoreRow[];
  tickers?: string[];
  priceBand?: { min: number; max: number };
};

type NewsItem = { ticker: string; headline: string; source?: string | null; link?: string | null; datetime?: string | null };
type NewsPayload = { generatedAt: string | null; count: number; items: NewsItem[] };

export default function PublicDashboard() {
  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [news, setNews] = useState<NewsPayload | null>(null);

  useEffect(() => {
    fetch("/api/today-scores").then(r => r.json()).then(setScores).catch(() => setScores({ generatedAt: null, scores: [] }));
    fetch("/api/today-news").then(r => r.json()).then(setNews).catch(() => setNews({ generatedAt: null, count: 0, items: [] }));
  }, []);

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <h1>Premarket Gappers (Finviz • AI add-on)</h1>

      <section style={{ display: "grid", gap: 8 }}>
        <h2>Scores</h2>
        {!scores || !scores.scores?.length ? (
          <div>No scores yet.</div>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr><th style={{ textAlign: "left" }}>Ticker</th><th style={{ textAlign: "left" }}>AI Score</th></tr>
            </thead>
            <tbody>
              {scores.scores.map((r) => (
                <tr key={r.ticker}>
                  <td style={{ padding: "6px 8px" }}>{r.ticker}</td>
                  <td style={{ padding: "6px 8px" }}>{r.score == null ? "—" : r.score.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <small style={{ opacity: 0.7 }}>
          Updated: {scores?.generatedAt || "n/a"}{scores?.priceBand ? ` • Price band $${scores.priceBand.min}-${scores.priceBand.max}` : ""}
        </small>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h2>Catalyst News (Finviz)</h2>
        {!news || !news.items?.length ? (
          <div>No news yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {news.items.slice(0, 100).map((n, i) => (
              <div key={i} style={{ padding: 8, border: "1px solid #eee", borderRadius: 8 }}>
                <div style={{ fontWeight: 600 }}>{n.ticker}</div>
                <div style={{ margin: "4px 0" }}>
                  {n.link ? <a href={n.link} target="_blank" rel="noreferrer">{n.headline || "(no headline)"}</a> : (n.headline || "(no headline)")}
                </div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  {n.source || "Finviz"}{n.datetime ? ` • ${n.datetime}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
        <small style={{ opacity: 0.7 }}>Updated: {news?.generatedAt || "n/a"}</small>
      </section>
    </main>
  );
}
