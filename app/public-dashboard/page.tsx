"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IconStockflow from "../components/IconStockflow";

type ScoreRow = { ticker: string; score?: number; gap_pct?: number; rvol?: number; rsi14m?: number; };
type ScoresPayload = { generatedAt: string | null; scores: ScoreRow[]; };
type CandidateRow = { [k: string]: any };
type NewsItem = { ticker: string; headline: string; source?: string; url?: string; published?: string; };
type NewsPayload = { generatedAt?: string; items: NewsItem[]; };

const num = (v: any): number | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%,$\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const toISOorNull = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

function mergeByTicker<T extends { ticker: string }>(prev: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  prev.forEach((r) => map.set(r.ticker, r));
  incoming.forEach((r) => map.set(r.ticker, r));
  return Array.from(map.values());
}

export default function Dashboard() {
  const r = useRouter();

  useEffect(() => {
    const ok = sessionStorage.getItem("sf_auth_ok") === "1";
    if (!ok) r.push("/");
  }, [r]);

  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [news, setNews] = useState<NewsPayload | null>(null);

  type Row = {
    ticker: string;
    price?: number;
    gapPct?: number;
    perf10mPct?: number;
    rvol?: number;
    floatM?: number;
    score?: number;
    firstSeenAt?: string;
  };
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef(rows);
  const firstSeen = useRef<Map<string, string>>(new Map());
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Filters (defaults per your brief)
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(5);
  const [minRvol, setMinRvol] = useState(1.0);
  const [minGap, setMinGap] = useState(5);
  const [minPerf, setMinPerf] = useState(10);
  const [maxFloat, setMaxFloat] = useState(20);
  const [newsOnly, setNewsOnly] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const buildMergedRows = (
    sPayload: ScoresPayload | null,
    cRows: CandidateRow[],
    newsItems?: NewsItem[]
  ): Row[] => {
    const sMap = new Map<string, ScoreRow>();
    (sPayload?.scores || []).forEach((s) => s.ticker && sMap.set(s.ticker.toUpperCase(), s));

    const allowedNews =
      newsOnly && newsItems
        ? new Set(newsItems.map((n) => n.ticker?.toUpperCase()).filter(Boolean))
        : null;

    const pickSymbolKey = (row: CandidateRow) => {
      for (const k of ["Ticker", "ticker", "Symbol", "symbol"]) if (k in row) return k;
      return "Ticker";
    };
    const symKey = pickSymbolKey(cRows[0] || {});

    const result: Row[] = [];
    for (const r of cRows) {
      const t = String(r[symKey] ?? "").toUpperCase().trim();
      if (!t) continue;
      if (allowedNews && !allowedNews.has(t)) continue;

      const price = num(r.Price ?? r.price);
      const gapPct = num(r.GapPct ?? r.gapPct ?? r.Change ?? r.change);
      const perf10mPct = num(r.Perf10m ?? r.perf10m);
      const rvol = num(r.RVol ?? r.RelVol ?? r.rvol ?? r.relvol);
      const floatM = num(r.Float ?? r.float);
      const sRow = sMap.get(t);

      result.push({
        ticker: t,
        price,
        gapPct,
        perf10mPct,
        rvol,
        floatM,
        score: sRow?.score,
      });
    }
    return result;
  };

  const pull = async () => {
    try {
      const sRes = await fetch("/today_scores.json", { cache: "no-store" });
      const sPayload = sRes.ok ? ((await sRes.json()) as ScoresPayload) : { generatedAt: null, scores: [] };
      setScores(sPayload);

      const cRes = await fetch("/today_candidates.csv", { cache: "no-store" });
      const cText = cRes.ok ? await cRes.text() : "";
      const parsed = Papa.parse<CandidateRow>(cText, { header: true, skipEmptyLines: true });
      setCandidates((parsed.data || []).filter(Boolean));

      const nRes = await fetch("/today_news.json", { cache: "no-store" });
      const nPayload = nRes.ok ? ((await nRes.json()) as NewsPayload) : { items: [] };
      setNews(nPayload);

      const merged = buildMergedRows(sPayload, (parsed.data || []).filter(Boolean), newsOnly ? nPayload.items : undefined);

      merged.forEach((m) => {
        if (!firstSeen.current.has(m.ticker)) {
          firstSeen.current.set(m.ticker, new Date().toLocaleTimeString());
        }
        m.firstSeenAt = firstSeen.current.get(m.ticker)!;
      });

      setRows((prev) => mergeByTicker(prev, merged));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // ignore transient fetch errors
    }
  };

  useEffect(() => {
    pull();
    const id = setInterval(pull, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const merged = buildMergedRows(scores, candidates, newsOnly ? (news?.items ?? []) : undefined);
    merged.forEach((m) => {
      if (!firstSeen.current.has(m.ticker)) {
        firstSeen.current.set(m.ticker, new Date().toLocaleTimeString());
      }
      m.firstSeenAt = firstSeen.current.get(m.ticker)!;
    });
    setRows((prev) => mergeByTicker(prev, merged));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsOnly, candidates, scores, news]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.price === undefined) return false;
      if (r.price < priceMin || r.price > priceMax) return false;
      if (r.rvol !== undefined && r.rvol < minRvol) return false;
      if (r.gapPct !== undefined && r.gapPct < minGap) return false;
      if (r.perf10mPct !== undefined && r.perf10mPct < minPerf) return false;
      if (r.floatM !== undefined && r.floatM > maxFloat) return false;
      return true;
    });
  }, [rows, priceMin, priceMax, minRvol, minGap, minPerf, maxFloat]);

  const shownTickers = new Set(filtered.map((f) => f.ticker));
  const newsShown = (news?.items || [])
    .filter((n) => n.ticker && shownTickers.has(n.ticker.toUpperCase()))
    .slice(0, 10);

  const avgGap =
    filtered.length > 0
      ? (filtered.reduce((a, r) => a + (r.gapPct ?? 0), 0) / filtered.length).toFixed(1)
      : "0.0";

  const onLogout = () => {
    sessionStorage.removeItem("sf_auth_ok");
    r.push("/");
  };

  const onRefresh = () => pull();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2a1459] via-[#180a36] to-black text-white">
      {/* Top bar */}
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow size={36} className="text-green-400" />
          <div className="text-xl font-bold">StockFlow</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => r.push("/")}
            className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2"
            title="Home"
          >
            🏠
          </button>
          <button
            onClick={onRefresh}
            className="rounded-xl bg-green-500 text-black px-4 py-2 font-semibold hover:brightness-110"
            title="Refresh now"
          >
            Refresh
          </button>
          <div className="text-xs text-white/70 ml-1">
            Last Update {lastUpdated ?? "—"} • Auto: 60s
          </div>
          <button
            onClick={onLogout}
            className="ml-3 rounded-xl bg-red-500 text-white px-4 py-2 font-semibold hover:brightness-110"
          >
            Logout
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-7xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
        <KPI label="Filtered Stocks" value={filtered.length.toString()} sub="Active scanners" />
        <KPI label="Average Gap" value={`${avgGap}%`} sub="Gap percentage" />
        <KPI label="Hot Stocks" value={Math.min(filtered.length, 10).toString()} sub="High momentum" />
        <KPI label="Tracked" value={rowsRef.current.length.toString()} sub="Seen this session" />
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-5 mt-6 rounded-2xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => {
              setPriceMin(1); setPriceMax(5);
              setMinRvol(1.0); setMinGap(5);
              setMinPerf(10); setMaxFloat(20);
              setNewsOnly(false);
            }}
          >
            🔄 Reset Filters
          </button>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newsOnly} onChange={(e) => setNewsOnly(e.target.checked)} />
            📢 News Catalyst Only
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-4">
          <RangeSlider
            label={`Price Range: $${priceMin} - $${priceMax}`}
            min={0.5} max={20} step={0.5}
            value={[priceMin, priceMax]}
            onChange={(a, b) => { setPriceMin(a); setPriceMax(b); }}
          />
          <SingleSlider
            label={`Volume Multiplier: ${minRvol.toFixed(1)}x+ (Rel Vol)`}
            min={1} max={20} step={0.1}
            value={minRvol}
            onChange={setMinRvol}
          />
          <SingleSlider
            label={`Gap Percentage: ${minGap}%+`}
            min={0} max={50} step={1}
            value={minGap}
            onChange={setMinGap}
          />
          <SingleSlider
            label={`Performance (10m): ${minPerf}%+`}
            min={0} max={50} step={1}
            value={minPerf}
            onChange={setMinPerf}
          />
          <SingleSlider
            label={`Float Max: ${maxFloat}M`}
            min={1} max={200} step={1}
            value={maxFloat}
            onChange={setMaxFloat}
          />
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-5 mt-6">
        <div className="text-sm text-white/70">
          Showing top {Math.min(10, filtered.length)} of {filtered.length} ({rowsRef.current.length} tracked)
        </div>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/10">
              <tr>
                <Th>Ticker</Th>
                <Th>Price</Th>
                <Th>Gap %</Th>
                <Th>Perf 10m %</Th>
                <Th>Rel Vol</Th>
                <Th>Float (M)</Th>
                <Th>AI Score</Th>
                <Th>Badges</Th>
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .slice(0, 10)
                .map((r) => {
                  const badges = [];
                  if ((r.gapPct ?? 0) >= 15) badges.push("🔥 Hot Stock");
                  if ((r.perf10mPct ?? 0) >= 10) badges.push("⚡ Strong Momentum");
                  if ((r.rvol ?? 0) >= 5) badges.push("📢 High Volume");
                  return (
                    <tr key={r.ticker} className="border-t border-white/10">
                      <Td className="font-mono">{r.ticker}</Td>
                      <Td>{r.price !== undefined ? `$${r.price.toFixed(2)}` : "—"}</Td>
                      <Td>{r.gapPct !== undefined ? `${r.gapPct.toFixed(1)}%` : "—"}</Td>
                      <Td>{r.perf10mPct !== undefined ? `${r.perf10mPct.toFixed(1)}%` : "—"}</Td>
                      <Td>{r.rvol !== undefined ? `${r.rvol.toFixed(1)}x` : "—"}</Td>
                      <Td>{r.floatM !== undefined ? r.floatM.toFixed(1) : "—"}</Td>
                      <Td>{r.score !== undefined ? r.score.toFixed(3) : "—"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {badges.map((b, i) => (
                            <span key={i} className="text-xs rounded-lg bg-white/10 border border-white/10 px-2 py-0.5">
                              {b}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-xs text-white/70">{r.firstSeenAt ?? "—"}</Td>
                    </tr>
                  );
                })}
              {filtered.length === 0 && (
                <tr>
                  <Td colSpan={9} className="text-center text-white/60 py-6">
                    No matches yet. If your CSV has only <span className="font-mono">ticker,price,change,volume</span>,
                    we’ll use <span className="font-mono">change</span> as Gap%. Try lowering Gap% or setting Rel Vol ≥ 1.0.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* News (limit 10; only for shown tickers) */}
      <div className="max-w-7xl mx-auto px-5 mt-6 mb-12">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <h3 className="font-semibold text-lg mb-2">📰 Market News</h3>
          {newsShown.length ? (
            <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
              {newsShown.map((n, i) => {
                const when = toISOorNull(n.published);
                const tlabel = when ? new Date(when).toLocaleTimeString() : "";
                return (
                  <div key={i} className="border-b border-white/10 pb-2">
                    <div className="text-sm text-white/60">
                      <span className="font-mono">{n.ticker}</span> {tlabel && <span>• {tlabel}</span>}
                    </div>
                    <div className="font-medium">{n.headline}</div>
                    <div className="text-sm">
                      {n.source && <span>Source: {n.source}</span>}{" "}
                      {n.url && (
                        <>
                          •{" "}
                          <a className="underline" href={n.url} target="_blank" rel="noreferrer">
                            Read more →
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-white/60">No news for the current tickers.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-sm text-white/70">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/60">{sub}</div>
    </div>
  );
}
function Th({ children }: { children: any }) {
  return <th className="text-left px-3 py-2 text-xs font-semibold text-white/70">{children}</th>;
}
function Td({ children, className = "", colSpan }: { children: any; className?: string; colSpan?: number }) {
  return <td className={`px-3 py-2 ${className}`} colSpan={colSpan}>{children}</td>;
}

function SingleSlider({
  label, min, max, step, value, onChange,
}: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; }) {
  return (
    <div>
      <div className="text-sm font-medium mb-1">{label}</div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
function RangeSlider({
  label, min, max, step, value, onChange,
}: { label: string; min: number; max: number; step: number; value: [number, number]; onChange: (v1: number, v2: number) => void; }) {
  const [v1, v2] = value;
  return (
    <div>
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="flex items-center gap-3">
        <input type="range" min={min} max={max} step={step} value={v1} onChange={(e) => onChange(Number(e.target.value), v2)} className="w-full" />
        <input type="range" min={min} max={max} step={step} value={v2} onChange={(e) => onChange(v1, Number(e.target.value))} className="w-full" />
      </div>
    </div>
  );
}
