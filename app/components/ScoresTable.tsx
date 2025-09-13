// app/components/ScoresTable.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ScoreRow = {
  ticker: string;
  price?: number | null;
  gap_pct?: number | null;      // % gap (pre/post)
  change_pct?: number | null;   // intraday % change if present
  rvol?: number | null;         // relative volume
  float_m?: number | null;      // float in millions
  ai_score?: number | null;     // 0..1
  volume?: number | null;       // absolute volume if present
  ts?: string | null;           // identified/updated timestamp (ISO)
};

type TodayScores = {
  generatedAt: string | null;
  scores: ScoreRow[];
};

const ONE_MIN = 60_000;

export default function ScoresTable() {
  const [data, setData] = useState<TodayScores>({ generatedAt: null, scores: [] });
  const [priceMin, setPriceMin] = useState<number>(1);
  const [priceMax, setPriceMax] = useState<number>(5);
  const [gapMin, setGapMin] = useState<number>(5);
  const [onlyNews, setOnlyNews] = useState<boolean>(false);

  // fetch /public/today_scores.json (served at /today_scores.json)
  async function load() {
    try {
      const res = await fetch("/today_scores.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as TodayScores;
      setData(j);
    } catch {
      // fallback to candidates CSV if scores JSON not present
      try {
        const res = await fetch("/today_candidates.csv", { cache: "no-store" });
        if (!res.ok) return;
        const text = await res.text();
        // very small CSV parser for (ticker,price,change,volume) headers
        const [head, ...rows] = text.trim().split(/\r?\n/);
        const cols = head.split(",").map((c) => c.trim().toLowerCase());
        const iTicker = cols.indexOf("ticker");
        const iPrice = cols.indexOf("price");
        const iChange = cols.indexOf("change");
        const iVol = cols.indexOf("volume");
        const scores: ScoreRow[] = rows.map((r) => {
          const parts = r.split(",");
          return {
            ticker: parts[iTicker]?.toUpperCase?.() ?? "",
            price: safeNum(parts[iPrice]),
            change_pct: parseChange(parts[iChange]),
            volume: safeNum(parts[iVol]),
            gap_pct: null,
            rvol: null,
            float_m: null,
            ai_score: null,
            ts: null,
          };
        });
        setData({ generatedAt: null, scores });
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, ONE_MIN);
    return () => clearInterval(t);
  }, []);

  // filter & sort
  const filtered = useMemo(() => {
    return (data.scores || [])
      .filter((r) => r.ticker)
      .filter((r) => {
        if (r.price == null) return false;
        return r.price >= priceMin && r.price <= priceMax;
      })
      .filter((r) => {
        const g = r.gap_pct ?? r.change_pct ?? 0;
        return g >= gapMin;
      })
      .filter((r) => {
        // If "News-only" mode is enabled, require a news flag added upstream
        // (we use a simple heuristic: ai_score > 0.5 OR rvol >= 1.3)
        if (!onlyNews) return true;
        return (r.ai_score ?? 0) > 0.5 || (r.rvol ?? 0) >= 1.3;
      })
      .sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
  }, [data.scores, priceMin, priceMax, gapMin, onlyNews]);

  // summary tiles
  const totalVol = useMemo(() => {
    const v = filtered.reduce((acc, r) => acc + (r.volume ?? 0), 0);
    return formatMillions(v);
  }, [filtered]);

  const avgGap = useMemo(() => {
    const vals = filtered.map((r) => (r.gap_pct ?? r.change_pct ?? 0)).filter((x) => isFinite(x));
    if (vals.length === 0) return "—";
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${m.toFixed(1)}%`;
  }, [filtered]);

  const hotCount = filtered.filter((r) => (r.ai_score ?? 0) >= 0.7 || (r.rvol ?? 0) >= 2).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm">
            Price Range: ${priceMin} – ${priceMax}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(+e.target.value || 0)}
              className="w-20 rounded-lg bg-black/40 border border-white/15 px-2 py-1"
            />
            <span className="opacity-60">to</span>
            <input
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(+e.target.value || 0)}
              className="w-20 rounded-lg bg-black/40 border border-white/15 px-2 py-1"
            />
          </div>

          <label className="text-sm">Gap % ≥</label>
          <input
            type="number"
            value={gapMin}
            onChange={(e) => setGapMin(+e.target.value || 0)}
            className="w-20 rounded-lg bg-black/40 border border-white/15 px-2 py-1"
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyNews}
              onChange={(e) => setOnlyNews(e.target.checked)}
            />
            News / Momentum only
          </label>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs opacity-60">
              Last Update {friendlyTime(data.generatedAt)} • Auto: 60s
            </span>
            <button
              onClick={load}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Tile icon="🔥" label="High momentum" value={String(hotCount)} />
        <Tile icon="💰" label="Combined volume" value={totalVol} />
        <Tile icon="📊" label="Gap percentage" value={avgGap} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-left">
              <Th>Symbol</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Gap %</Th>
              <Th className="text-right">AI</Th>
              <Th className="text-right">Volume</Th>
              <Th className="text-right">RVol</Th>
              <Th>Badges</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 10).map((r) => (
              <tr key={r.ticker} className="border-t border-white/10 hover:bg-white/5">
                <Td className="font-semibold">{r.ticker}</Td>
                <Td right>{fmtPrice(r.price)}</Td>
                <Td right color={pctColor(r.gap_pct ?? r.change_pct)}>
                  {fmtPct(r.gap_pct ?? r.change_pct)}
                </Td>
                <Td right>{r.ai_score != null ? (r.ai_score * 100).toFixed(0) + "%" : "—"}</Td>
                <Td right>{formatMillions(r.volume)}</Td>
                <Td right>{r.rvol != null ? r.rvol.toFixed(1) + "x" : "—"}</Td>
                <Td>
                  <Badges r={r} />
                </Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 opacity-70">
                  No matches for current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function safeNum(s?: string) {
  const x = Number(String(s ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(x) ? x : null;
}
function parseChange(s?: string) {
  if (!s) return null;
  const m = String(s).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  return Number(m[0]);
}
function fmtPrice(x?: number | null) {
  return x == null ? "—" : `$${x.toFixed(2)}`;
}
function fmtPct(x?: number | null) {
  return x == null ? "—" : `${x.toFixed(1)}%`;
}
function pctColor(x?: number | null) {
  if (x == null) return "";
  if (x >= 10) return "text-green-300";
  if (x >= 5) return "text-green-200";
  if (x >= 0) return "text-green-100";
  return "text-red-300";
}
function formatMillions(v?: number | null) {
  if (!v || !isFinite(v)) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "k";
  return String(v);
}
function friendlyTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false });
  } catch {
    return "—";
  }
}

function Th({ children, className = "" }: any) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({
  children,
  className = "",
  right = false,
  color = "",
}: {
  children: any;
  className?: string;
  right?: boolean;
  color?: string;
}) {
  return (
    <td className={`px-3 py-2 ${right ? "text-right" : ""} ${color} ${className}`}>
      {children}
    </td>
  );
}

function Tile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-sm opacity-70">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Badges({ r }: { r: ScoreRow }) {
  const hot = (r.ai_score ?? 0) >= 0.7;
  const momentum = (r.gap_pct ?? r.change_pct ?? 0) >= 10;
  const highVol = (r.rvol ?? 0) >= 2 || (r.volume ?? 0) >= 5_000_000;
  return (
    <div className="flex flex-wrap gap-2">
      {hot && <Badge text="🔥 Hot Stock" />}
      {momentum && <Badge text="⚡ Strong Momentum" />}
      {highVol && <Badge text="📢 High Volume" />}
    </div>
  );
}
function Badge({ text }: { text: string }) {
  return (
    <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/15">
      {text}
    </span>
  );
}
