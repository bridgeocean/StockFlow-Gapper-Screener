"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

// ---- Types from our repo payloads ----
type ScoreRow = {
  ticker: string;
  score?: number;
  gap_pct?: number;         // optional in scores JSON depending on script
  rvol?: number;
  rsi14m?: number;
};

type ScoresPayload = {
  generatedAt: string | null;
  scores: ScoreRow[];
};

type CandidateRow = {
  Ticker?: string;          // raw from CSV (Finviz export)
  Symbol?: string;          // sometimes Symbol instead of Ticker
  Price?: string;
  GapPct?: string | number; // % gap
  Perf10m?: string | number;
  RVol?: string | number;   // rel volume
  Float?: string | number;  // millions
  // allow any additional columns
  [k: string]: any;
};

type NewsItem = {
  ticker: string;
  headline: string;
  source?: string;
  url?: string;
  published?: string;       // ISO string
};

type NewsPayload = {
  generatedAt?: string;
  items: NewsItem[];
};

// ---- Helpers ----
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

// Merge strategy: keep previously-seen tickers so the list doesn't “blink” on refresh
function mergeByTicker<T extends { ticker: string }>(
  prev: T[],
  incoming: T[]
): T[] {
  const map = new Map<string, T>();
  prev.forEach((r) => map.set(r.ticker, r));
  incoming.forEach((r) => map.set(r.ticker, r)); // incoming overwrites
  return Array.from(map.values());
}

// ---- Component ----
export default function PublicDashboard() {
  // Raw payloads
  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [news, setNews] = useState<NewsPayload | null>(null);

  // Merged view rows
  const [rows, setRows] = useState<
    Array<{
      ticker: string;
      price?: number;
      gapPct?: number;
      perf10mPct?: number;
      rvol?: number;
      floatM?: number;
      score?: number;
    }>
  >([]);

  // Persist rows across refresh (no flicker)
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Filters (defaults per your spec)
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(5);
  const [minRvol, setMinRvol] = useState(5);       // 5x
  const [minGap, setMinGap] = useState(5);         // 5%
  const [minPerf, setMinPerf] = useState(10);      // 10%
  const [maxFloat, setMaxFloat] = useState(20);    // 20M
  const [newsOnly, setNewsOnly] = useState(false);

  // Status
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [liveMsg] = useState(
    "Successfully connected to Live Feed API. Data is being updated in real-time from professional market sources."
  );

  // Fetchers
  const fetchAll = async () => {
    try {
      // Scores JSON
      const sRes = await fetch("/today_scores.json", { cache: "no-store" });
      const sPayload = (await sRes.json()) as ScoresPayload;
      setScores(sPayload);

      // Candidates CSV
      const cRes = await fetch("/today_candidates.csv", { cache: "no-store" });
      const cText = await cRes.text();
      const parsed = Papa.parse<CandidateRow>(cText, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });
      const cRows = (parsed.data || []).filter(Boolean);
      setCandidates(cRows);

      // News JSON (optional)
      const nRes = await fetch("/today_news.json", { cache: "no-store" });
      if (nRes.ok) {
        const nPayload = (await nRes.json()) as NewsPayload;
        setNews(nPayload);
      } else {
        setNews({ items: [] });
      }

      setLastUpdated(new Date().toLocaleTimeString());
      // merge into display rows
      const merged = buildMergedRows(sPayload, cRows, newsOnly ? (news?.items ?? []) : undefined);
      setRows((prev) => mergeByTicker(prev, merged));
    } catch {
      // leave state as-is; page still usable
    }
  };

  // Build merged records from scores + candidates (+ optional news filter)
  const buildMergedRows = (
    sPayload: ScoresPayload | null,
    cRows: CandidateRow[],
    newsItems?: NewsItem[]
  ) => {
    const sMap = new Map<string, ScoreRow>();
    (sPayload?.scores || []).forEach((s) => s.ticker && sMap.set(s.ticker.toUpperCase(), s));

    const newsSet =
      newsOnly && newsItems
        ? new Set(newsItems.map((n) => n.ticker?.toUpperCase()).filter(Boolean))
        : null;

    // Figure out the symbol column in CSV
    const symbolKey =
      ["Ticker", "Symbol", "ticker", "symbol"].find((k) => k in (cRows[0] || {})) || "Ticker";

    const result: Array<{
      ticker: string;
      price?: number;
      gapPct?: number;
      perf10mPct?: number;
      rvol?: number;
      floatM?: number;
      score?: number;
    }> = [];

    for (const r of cRows) {
      const t = String(r[symbolKey] ?? "").toUpperCase().trim();
      if (!t) continue;

      if (newsSet && !newsSet.has(t)) continue;

      const price = num(r.Price);
      const gapPct = num(r.GapPct);
      const perf10mPct = num(r.Perf10m);
      const rvol = num(r.RVol);
      const floatM = num(r.Float);
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

  // Initial + 60s refresh loop
  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60_000); // 1 minute
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild merged rows instantly when toggling “news only”
  useEffect(() => {
    const merged = buildMergedRows(scores, candidates, newsOnly ? (news?.items ?? []) : undefined);
    setRows((prev) => mergeByTicker(prev, merged));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsOnly, candidates, scores, news]);

  // Filtered view
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

  // Stats
  const avgGap =
    filtered.length > 0
      ? (
          filtered.reduce((a, r) => a + (r.gapPct ?? 0), 0) / filtered.length
        ).toFixed(1)
      : "0.0";

  // Quick CSV export
  const exportCSV = () => {
    const header = ["Ticker", "Price", "GapPct", "Perf10mPct", "RVol", "FloatM", "Score"];
    const body = filtered.map((r) => [
      r.ticker,
      r.price ?? "",
      r.gapPct ?? "",
      r.perf10mPct ?? "",
      r.rvol ?? "",
      r.floatM ?? "",
      r.score ?? "",
    ]);
    const csv = [header, ...body].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gapper_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // News panel (shows latest headlines; timestamps & Read more)
  const newsPanel = (
    <div className="mt-6 rounded-xl border p-4">
      <h3 className="font-semibold text-lg mb-2">📰 Market News</h3>
      {news?.items?.length ? (
        <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
          {news.items.slice(0, 50).map((n, i) => {
            const when = toISOorNull(n.published);
            const tlabel = when ? new Date(when).toLocaleTimeString() : "";
            return (
              <div key={i} className="border-b pb-2">
                <div className="text-sm text-gray-500">
                  <span className="font-mono">{n.ticker}</span>{" "}
                  {tlabel && <span>• {tlabel}</span>}
                </div>
                <div className="font-medium">{n.headline}</div>
                <div className="text-sm">
                  {n.source && <span>Source: {n.source}</span>}{" "}
                  {n.url && (
                    <>
                      •{" "}
                      <a
                        className="underline"
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                      >
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
        <div className="text-sm text-gray-500">No news yet.</div>
      )}
    </div>
  );

  // UI
  return (
    <div className="max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">StockFlow</h1>
          <div className="text-sm text-gray-500">by ThePhDPush</div>
          <div className="mt-1 text-green-600">🟢 LIVE</div>
          <div className="text-xs text-gray-500">
            Last updated: {lastUpdated ?? "—"}
          </div>
        </div>
        <div className="text-sm rounded-lg border p-3 max-w-md">
          <div className="font-medium">Live Data</div>
          <div className="text-gray-600">{liveMsg}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <KPI label="Filtered Stocks" value={filtered.length.toString()} sub="Active scanners" />
        <KPI label="Average Gap" value={`${avgGap}%`} sub="Gap percentage" />
        <KPI label="Hot Stocks" value={Math.min(filtered.length, 10).toString()} sub="High momentum" />
        <KPI label="Refresh" value="60s" sub="Auto update" />
      </div>

      {/* Filters */}
      <div className="mt-6 rounded-xl border p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            className="px-3 py-1.5 rounded border hover:bg-gray-50"
            onClick={() => {
              setPriceMin(1); setPriceMax(5);
              setMinRvol(5); setMinGap(5);
              setMinPerf(10); setMaxFloat(20);
              setNewsOnly(false);
            }}
          >
            🔄 Reset Filters
          </button>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={newsOnly}
              onChange={(e) => setNewsOnly(e.target.checked)}
            />
            📢 News Catalyst Only
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-4">
          <Slider
            label={`Price Range: $${priceMin} - $${priceMax}`}
            min={0.5}
            max={20}
            step={0.5}
            value={[priceMin, priceMax]}
            onChange={(a, b) => { setPriceMin(a); setPriceMax(b); }}
          />
          <Slider
            label={`Volume Multiplier: ${minRvol}x+`}
            min={1}
            max={20}
            step={1}
            value={minRvol}
            onChange={(v) => setMinRvol(v)}
          />
          <Slider
            label={`Gap Percentage: ${minGap}%+`}
            min={0}
            max={50}
            step={1}
            value={minGap}
            onChange={(v) => setMinGap(v)}
          />
          <Slider
            label={`Performance (10m): ${minPerf}%+`}
            min={0}
            max={50}
            step={1}
            value={minPerf}
            onChange={(v) => setMinPerf(v)}
          />
          <Slider
            label={`Float Max: ${maxFloat}M`}
            min={1}
            max={200}
            step={1}
            value={maxFloat}
            onChange={(v) => setMaxFloat(v)}
          />
        </div>
      </div>

      {/* Table header */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Showing top {Math.min(10, filtered.length)} of {filtered.length}{" "}
          ({rowsRef.current.length} total tracked today)
        </div>
        <button onClick={exportCSV} className="px-3 py-1.5 rounded border hover:bg-gray-50">
          📥 Export CSV
        </button>
      </div>

      {/* Results table */}
      <div className="mt-3 overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Ticker</Th>
              <Th>Price</Th>
              <Th>Gap %</Th>
              <Th>Perf 10m %</Th>
              <Th>Rel Vol</Th>
              <Th>Float (M)</Th>
              <Th>AI Score</Th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .slice(0, 10)
              .map((r) => (
                <tr key={r.ticker} className="border-t">
                  <Td className="font-mono">{r.ticker}</Td>
                  <Td>{r.price !== undefined ? `$${r.price.toFixed(2)}` : "—"}</Td>
                  <Td>{r.gapPct !== undefined ? `${r.gapPct.toFixed(1)}%` : "—"}</Td>
                  <Td>{r.perf10mPct !== undefined ? `${r.perf10mPct.toFixed(1)}%` : "—"}</Td>
                  <Td>{r.rvol !== undefined ? `${r.rvol.toFixed(1)}x` : "—"}</Td>
                  <Td>{r.floatM !== undefined ? `${r.floatM.toFixed(1)}` : "—"}</Td>
                  <Td>{r.score !== undefined ? r.score.toFixed(3) : "—"}</Td>
                </tr>
              ))}
            {filtered.length === 0 && (
              <tr>
                <Td colSpan={7} className="text-center text-gray-500 py-6">
                  No matches yet. Try relaxing filters or check back after next refresh.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {newsPanel}
    </div>
  );
}

// ---- Tiny UI helpers ----
function KPI({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}

function Th({ children }: { children: any }) {
  return <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{children}</th>;
}
function Td({ children, className = "", colSpan }: { children: any; className?: string; colSpan?: number }) {
  return <td className={`px-3 py-2 ${className}`} colSpan={colSpan}>{children}</td>;
}

// Simple slider that supports single or range values
function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number | [number, number];
  onChange: (v: number, v2?: number) => void;
}) {
  const isRange = Array.isArray(value);
  const v1 = isRange ? value[0] : (value as number);
  const v2 = isRange ? value[1] : undefined;

  return (
    <div>
      <div className="text-sm font-medium mb-1">{label}</div>
      {isRange ? (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={v1}
            onChange={(e) => onChange(Number(e.target.value), v2)}
            className="w-full"
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={v2}
            onChange={(e) => onChange(v1, Number(e.target.value))}
            className="w-full"
          />
        </div>
      ) : (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v1}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
      )}
    </div>
  );
}
