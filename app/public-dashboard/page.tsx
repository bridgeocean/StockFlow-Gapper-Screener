"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IconStockflow from "../components/IconStockflow";

/* ---------- types ---------- */
type ScoreRow = { ticker: string; score?: number; gap_pct?: number; rvol?: number; rsi14m?: number; };
type ScoresPayload = { generatedAt: string | null; scores: ScoreRow[]; };
type CandidateRow = { [k: string]: any };
type NewsItem = { ticker: string; headline: string; source?: string; url?: string; published?: string; };
type NewsPayload = { generatedAt?: string; items: NewsItem[]; };
type Alert = { id: string; level: "HIGH" | "MEDIUM" | "LOW"; at: number; price?: number; changePct?: number; gapPct?: number; read?: boolean; };

/* ---------- utils ---------- */
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

/* ---------- page ---------- */
export default function PublicDashboard() {
  const r = useRouter();

  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [news, setNews] = useState<NewsPayload | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const rowsRef = useRef(rows); useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Filters (with reasonable defaults)
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(5);
  const [minGap, setMinGap] = useState(5);
  const [newsOnly, setNewsOnly] = useState(false);
  const [minRelVol, setMinRelVol] = useState(1.3);
  const [minPerf10m, setMinPerf10m] = useState(10);
  const [maxFloatM, setMaxFloatM] = useState(20);

  // Tag visibility, persisted
  const [hasRelVol, setHasRelVol] = useState(true);
  const [hasPerf10m, setHasPerf10m] = useState(true);
  const [hasFloatM, setHasFloatM] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("sf_pd_tagprefs");
    if (saved) {
      try {
        const { hasRel, hasPerf, hasFloat } = JSON.parse(saved);
        setHasRelVol(!!hasRel); setHasPerf10m(!!hasPerf); setHasFloatM(!!hasFloat);
      } catch {}
    }
  }, []);
  const saveTagPrefs = (a: boolean, b: boolean, c: boolean) => {
    localStorage.setItem("sf_pd_tagprefs", JSON.stringify({ hasRel: a, hasPerf: b, hasFloat: c }));
    setHasRelVol(a); setHasPerf10m(b); setHasFloatM(c);
  };

  // Build merged rows
  const buildMergedRows = (
    sPayload: ScoresPayload | null,
    cRows: CandidateRow[],
    newsItems?: NewsItem[]
  ) => {
    const sMap = new Map<string, ScoreRow>();
    (sPayload?.scores || []).forEach((s) => s.ticker && sMap.set(s.ticker.toUpperCase(), s));
    const allowedNews =
      newsOnly && newsItems
        ? new Set(newsItems.map((n) => (n.ticker || "").toUpperCase()).filter(Boolean))
        : null;

    const merged = cRows
      .map((r) => {
        const t = (r.Ticker || r.ticker || "").toUpperCase();
        if (!t) return null;
        if (allowedNews && !allowedNews.has(t)) return null;

        const s = sMap.get(t);
        const price = num(r.Price || r.price);
        const gapPct = num(r.GapPct || r.gap_pct || r.gapPct);
        const rvol = num(r.RVol || r.rvol || r.relvol || r.rel_vol);
        const rsi14m = num(r.RSI14m || r.rsi14m);
        const perf10m = num(r.Change || r.perf10m || r.change_10m);

        return {
          ticker: t,
          name: r.Name || r.name || "",
          price, gapPct, rvol, rsi14m, perf10m,
          floatM: num(r.FloatM || r.floatM || r.float_millions),
          volM: num(r.VolM || r.volM || r.volume_millions),
          sector: r.Sector || r.sector,
          industry: r.Industry || r.industry,
          aiScore: s?.score, aiGapPct: s?.gap_pct, aiRvol: s?.rvol, aiRsi14m: s?.rsi14m,
        };
      })
      .filter(Boolean) as any[];

    setRows(merged);
  };

  // Fetch data (scores, candidates, news)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [scoresRows, candidatesRows] = await Promise.all([
          fetchCSV("/scores.csv"),
          fetchCSV("/candidates.csv"),
        ]);
        if (cancelled) return;

        const scoresPayload: ScoresPayload = {
          generatedAt: (scoresRows[0]?.generatedAt as string) || null,
          scores: scoresRows.map((r) => ({
            ticker: (r.ticker || r.Ticker || "").toUpperCase(),
            score: num(r.score),
            gap_pct: num(r.gap_pct),
            rvol: num(r.rvol),
            rsi14m: num(r.rsi14m),
          })),
        };
        setScores(scoresPayload);

        const cands = candidatesRows.map((r) => ({ ...r, ticker: (r.Ticker || r.ticker || "").toUpperCase() }));
        setCandidates(cands);

        try {
          const res = await fetch("/news.json");
          if (res.ok) {
            const j = (await res.json()) as NewsPayload;
            setNews(j);
            buildMergedRows(scoresPayload, cands, j.items);
          } else {
            buildMergedRows(scoresPayload, cands);
          }
        } catch {
          buildMergedRows(scoresPayload, cands);
        }
      } catch (e) {
        console.error("Public dashboard fetch error:", e);
      }
    };

    run();
    const id = setInterval(run, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [newsOnly]);

  // Derived
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.price === undefined || r.gapPct === undefined) return false;
      if (r.price < priceMin || r.price > priceMax) return false;
      if ((r.gapPct * 100) < minGap) return false;
      if (minRelVol && r.rvol !== undefined && r.rvol < minRelVol) return false;
      if (minPerf10m && r.perf10m !== undefined && r.perf10m < minPerf10m) return false;
      if (maxFloatM && r.floatM !== undefined && r.floatM > maxFloatM) return false;
      return true;
    });
  }, [rows, priceMin, priceMax, minGap, minRelVol, minPerf10m, maxFloatM]);

  const avgGap = useMemo(() => {
    const xs = filtered.map((r) => r.gapPct).filter((v) => v !== undefined);
    if (!xs.length) return 0;
    return (xs.reduce((a, b) => a + b, 0) / xs.length) * 100;
  }, [filtered]);

  const totalVol = useMemo(() => {
    const xs = filtered.map((r) => r.volM).filter((v) => v !== undefined);
    if (!xs.length) return 0;
    return xs.reduce((a, b) => a + b, 0);
  }, [filtered]);

  // Example alerts (client-only demo)
  useEffect(() => {
    if (!rowsRef.current.length) return;
    const now = Date.now();
    const mk = (i: number, level: "HIGH" | "MEDIUM" | "LOW"): Alert => ({
      id: `a${now}-${i}`, level, at: now,
      price: rowsRef.current[i]?.price,
      changePct: rowsRef.current[i]?.perf10m ? rowsRef.current[i].perf10m / 100 : undefined,
      gapPct: rowsRef.current[i]?.gapPct, read: false,
    });
    const a: Alert[] = [];
    if (rowsRef.current[0]) a.push(mk(0, "HIGH"));
    if (rowsRef.current[1]) a.push(mk(1, "MEDIUM"));
    if (rowsRef.current[2]) a.push(mk(2, "LOW"));
    setAlerts(a);
  }, [rows.length]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1b0f3a] via-[#110726] to-black text-white">
      {/* Header */}
      <header className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow className="text-green-400" />
          <div className="font-semibold">StockFlow</div>
        </div>
        <div className="text-sm text-white/60">Public Dashboard</div>
      </header>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="text-sm text-white/60">Filtered Stocks</div>
          <div className="text-2xl font-bold mt-1">{filtered.length}</div>
          <div className="text-xs text-green-300 mt-1">✅ Active scanners</div>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="text-sm text-white/60">Average Gap</div>
          <div className="text-2xl font-bold mt-1">{fmt(avgGap, 1)}%</div>
          <div className="text-xs text-purple-300 mt-1">📈 Gap percentage</div>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="text-sm text-white/60">Total Volume</div>
          <div className="text-2xl font-bold mt-1">{fmtInt(totalVol)}M</div>
          <div className="text-xs text-orange-300 mt-1">🧩 Combined volume</div>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="text-sm text-white/60">Hot Stocks</div>
          <div className="text-2xl font-bold mt-1">
            {filtered.filter((r) => (r.perf10m || 0) >= 10).length}
          </div>
          <div className="text-xs text-red-300 mt-1">🔥 High momentum</div>
        </div>
      </section>

      {/* Body */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 px-5 mt-6">
        {/* Filters */}
        <aside className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="font-semibold mb-3">Gap Scanner Filters</div>

          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => {
                setPriceMin(1); setPriceMax(5); setMinGap(5); setNewsOnly(false);
                setMinRelVol(1.3); setMinPerf10m(10); setMaxFloatM(20);
              }}
              className="text-sm px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15"
            >
              Reset Filters
            </button>
          </div>

          <div className="mt-3 space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newsOnly} onChange={(e) => setNewsOnly(e.target.checked)} />
              <span className="text-sm">News Catalyst Only</span>
            </label>

            <div>
              <div className="text-sm mb-1">Price Range: ${priceMin} - ${priceMax}</div>
              <input type="range" min={1} max={50} step={1} value={priceMin} onChange={(e) => setPriceMin(Number(e.target.value))} />
              <input type="range" min={1} max={50} step={1} value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value))} />
            </div>

            <div>
              <div className="text-sm mb-1">Volume Multiplier: {minRelVol.toFixed(1)}x+</div>
              <input type="range" min={1} max={5} step={0.1} value={minRelVol} onChange={(e) => setMinRelVol(Number(e.target.value))} />
            </div>

            <div>
              <div className="text-sm mb-1">Gap Percentage: {minGap}%+</div>
              <input type="range" min={1} max={50} step={1} value={minGap} onChange={(e) => setMinGap(Number(e.target.value))} />
            </div>

            <div>
              <div className="text-sm mb-1">Performance: {minPerf10m}%+</div>
              <input type="range" min={0} max={50} step={1} value={minPerf10m} onChange={(e) => setMinPerf10m(Number(e.target.value))} />
            </div>

            <div>
              <div className="text-sm mb-1">Float Max: {maxFloatM}M</div>
              <input type="range" min={1} max={200} step={1} value={maxFloatM} onChange={(e) => setMaxFloatM(Number(e.target.value))} />
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="text-sm mb-1">Show tags:</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasRelVol} onChange={(e) => saveTagPrefs(e.target.checked, hasPerf10m, hasFloatM)} />
                <span>High Volume</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasPerf10m} onChange={(e) => saveTagPrefs(hasRelVol, e.target.checked, hasFloatM)} />
                <span>Strong Momentum</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasFloatM} onChange={(e) => saveTagPrefs(hasRelVol, hasPerf10m, e.target.checked)} />
                <span>Hot Stock</span>
              </label>
            </div>
          </div>
        </aside>

        {/* Results */}
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">
              <span className="mr-2">Top {Math.min(filtered.length, 10)} of {filtered.length} found today</span>
              <button
                onClick={() => {
                  const csv = Papa.unparse(filtered);
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "scanner_export.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
              >
                Export CSV
              </button>
            </div>
          </div>

          {filtered.slice(0, 10).map((r) => (
            <div key={r.ticker} className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{r.ticker}</div>
                  <div className="text-xs text-white/60">{r.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">${fmt(r.price)}</div>
                  <div className="text-xs">
                    Gap: <span className="text-green-300">{pct(r.gapPct)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3 text-xs">
                {hasFloatM && <span className="px-2 py-1 rounded bg-white/10 border border-white/10">🔥 Hot Stock</span>}
                {hasPerf10m && <span className="px-2 py-1 rounded bg-white/10 border border-white/10">⚡ Strong Momentum</span>}
                {hasRelVol && <span className="px-2 py-1 rounded bg-white/10 border border-white/10">📈 High Volume</span>}
              </div>

              <div className="text-xs text-white/60 mt-2">
                rVol: {fmt(r.rvol)} • RSI(14m): {fmt(r.rsi14m)} • 10m Perf: {fmt(r.perf10m)}%
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Right rail: Alerts + News */}
      <div className="max-w-7xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
        <section className="lg:col-span-2"></section>
        <aside className="space-y-4">
          {/* Alerts */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="font-semibold mb-2 flex items-center justify-between">
              <span>Real-Time Alerts</span>
              {alerts.length > 0 && (
                <button onClick={() => setAlerts(alerts.map(a => ({ ...a, read: true })))}
                        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15">
                  Mark All Read
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-auto space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="rounded-lg bg-black/40 border border-white/10 p-3">
                  <div className="text-xs text-white/60">
                    {new Date(a.at).toLocaleTimeString()} — {a.level}
                  </div>
                  <div className="text-sm">
                    Change: {a.changePct !== undefined ? pct(a.changePct) : "-"} • Gap: {pct(a.gapPct)}
                  </div>
                </div>
              ))}
              {!alerts.length && <div className="text-sm text-white/50">No alerts yet.</div>}
            </div>
          </div>

          {/* News */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="font-semibold mb-2">Market News</div>
            <div className="space-y-3 max-h-[420px] overflow-auto">
              {news?.items?.length
                ? news.items.map((n, i) => (
                    <div key={i} className="rounded-lg bg-black/40 border border-white/10 p-3">
                      <div className="text-xs mb-1 text-blue-300">{(n.ticker || "").toUpperCase()}</div>
                      <div className="text-sm">{n.headline}</div>
                      <div className="text-xs text-white/60 mt-1">
                        {n.source || "source"} • {n.published || ""}
                        {n.url && (
                          <>
                            {" "}
                            • <a className="underline" href={n.url} target="_blank" rel="noreferrer">Full Story →</a>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                : <div className="text-sm text-white/60">No news available.</div>}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
