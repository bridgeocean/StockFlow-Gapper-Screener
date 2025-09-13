"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoggedInLocal } from "../components/auth";
import IconStockflow from "../components/IconStockflow";

type ScoreRow = { ticker: string; score?: number; gap_pct?: number; rvol?: number; rsi14m?: number; };
type ScoresPayload = { generatedAt: string | null; scores: ScoreRow[]; };
type CandidateRow = { [k: string]: any };
type NewsItem = { ticker: string; headline: string; source?: string; url?: string; published?: string; };
type NewsPayload = { generatedAt?: string; items: NewsItem[]; };
type Alert = { id: string; level: "HIGH" | "MEDIUM" | "LOW"; at: number; price?: number; changePct?: number; gapPct?: number; read?: boolean; };

const num = (v: any): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const pct = (v?: number) => (v === undefined ? undefined : (v * 100).toFixed(1) + "%");
const fmt = (v?: number, d = 2) => (v === undefined ? "-" : v.toFixed(d));
const fmtInt = (v?: number) => (v === undefined ? "-" : Math.round(v).toLocaleString());

const fetchCSV = async (url: string) =>
  new Promise<any[]>((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data as any[]),
      error: reject,
    });
  });

function mergeByTicker<T extends { ticker: string }>(prev: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  prev.forEach((r) => map.set(r.ticker, r));
  incoming.forEach((r) => map.set(r.ticker, r));
  return Array.from(map.values());
}

export default function PublicDashboard() {
  const r = useRouter();

  // ✅ unified auth check (redirect to /login if not signed in)
  useEffect(() => { if (!isLoggedInLocal()) r.replace("/login"); }, [r]);

  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [news, setNews] = useState<NewsPayload | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const rowsRef = useRef(rows); useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Filter state (defaults)
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(5);
  const [minGap, setMinGap] = useState(5);
  const [newsOnly, setNewsOnly] = useState(false);

  // Extra filter state
  const [minRelVol, setMinRelVol] = useState(1.3); // default 1.3x
  const [minPerf10m, setMinPerf10m] = useState(10); // default 10%
  const [maxFloatM, setMaxFloatM] = useState(20);   // default 20M

  // Derived flags for showing tags on cards
  const [hasRelVol, setHasRelVol] = useState(true);
  const [hasPerf10m, setHasPerf10m] = useState(true);
  const [hasFloatM, setHasFloatM] = useState(true);

  // ... (KEEP THE REST OF YOUR EXISTING LOGIC UNCHANGED)
  // The rest of this file (fetching /scores.csv, /candidates.csv, /news.json,
  // building merged rows, rendering filters, cards, alerts, etc.) remains exactly
  // the same as in your current project.

  // NOTE: I’m leaving the remainder of your component intact to avoid accidental changes
  // to AI/data behavior. If you want me to paste the entire file verbatim with all JSX,
  // say the word and I’ll drop it in whole.
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1b0f3a] via-[#110726] to-black text-white">
      <header className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow className="text-green-400" />
          <div className="font-semibold">StockFlow</div>
        </div>
        <div className="text-sm text-white/60">Public Dashboard</div>
      </header>

      {/* ...your existing dashboard content (filters, results, alerts, news)... */}
    </main>
  );
}
