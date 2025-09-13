// app/components/ScoresTable.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ScoreRow = {
  ticker: string;
  price?: number | null;
  gap_pct?: number | null;      // % gap (Finviz "Gap")
  change_pct?: number | null;   // % daily change
  rvol?: number | null;         // relative volume
  float_m?: number | null;      // float in millions
  ai_score?: number | null;     // 0..1 (if available)
  volume?: number | null;       // absolute volume
  ts?: string | null;           // timestamp
};

type ScoresPayload = {
  generatedAt: string | null;
  scores: ScoreRow[];
};

// ---------- helpers ----------
const safeNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const parseChange = (s: any) => {
  if (s == null) return null;
  const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)%?$/);
  return m ? Number(m[1]) : safeNum(s);
};

function mapFinvizStocksToScores(rows: any[]): ScoresPayload {
  const scores: ScoreRow[] = rows.map((s) => {
    // Accept a variety of possible keys from the /api/stocks route
    const t = (s.symbol || s.ticker || "").toString().toUpperCase();

    // gap percentage: prefer 'gap', then 'gap_pct', then fall back to change
    const gap =
      safeNum(s.gap) ?? safeNum(s.gap_pct) ?? parseChange(s.gapPct) ?? null;

    // relative volume: Finviz gives "Relative Volume" → often mapped as relativeVolume/relVolume/rvol
    const relv =
      safeNum(s.relativeVolume) ??
      safeNum(s.relVolume) ??
      safeNum(s.rvol) ??
      null;

    // float (millions): accept floatM/float_m, or convert absolute float_shares → M
    let floatM =
      safeNum(s.floatM) ?? safeNum(s.float_m) ?? null;
    if (floatM == null && s.float_shares != null) {
      const abs = safeNum(s.float_shares);
      if (abs != null) floatM = Math.round((abs / 1_000_000) * 10) / 10; // 1 decimal
    }
    if (floatM == null && s.float != null) {
      floatM = safeNum(s.float);
    }

    return {
      ticker: t,
      price: safeNum(s.price),
      gap_pct: gap,
      change_pct: parseChange(s.changePercent ?? s.change_pct ?? s.change),
      rvol: relv,
      float_m: floatM,
      ai_score: safeNum(s.ai_score), // usually null from Finviz API
      volume: safeNum(s.volume),
      ts: s.lastUpdated || s.ts || null,
    };
  }).filter((r) => !!r.ticker);

  return { generatedAt: new Date().toISOString(), scores };
}

// ---------- component ----------
export default function ScoresTable() {
  const [data, setData] = useState<ScoresPayload>({ generatedAt: null, scores: [] });
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(5);
  const [gapMin, setGapMin] = useState(5);
  const [onlyNews, setOnlyNews] = useState(false);

  // fetch order:
  // 1) /api/stocks  (Finviz live)  ✅
  // 2) /today_scores.json          ↩︎ fallback
  // 3) /today_candidates.csv       ↩︎ fallback
  async function loadOnce() {
    // --- 1) Finviz live via our API route ---
    try {
      const res = await fetch("/api/stocks", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j?.success && Array.isArray(j.data) && j.data.length) {
          setData(mapFinvizStocksToScores(j.data));
          return;
        }
      }
    } catch {}

    // --- 2) today_scores.json (if GitHub action produced it) ---
    try {
      const res = await fetch("/today_scores.json", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        // expect { generatedAt, scores: [...] }
        if (j?.scores && Array.isArray(j.scores)) {
          setData(j);
          return;
        }
      }
    } catch {}

    // --- 3) fallback to today_candidates.csv (no gap_pct; filter will still work if gapMin==0) ---
    try {
      const res = await fetch("/today_candidates.csv", { cache: "no-store" });
      if (!res.ok) return;
      const text = await res.text();
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
      }).filter((r) => r.ticker);
      setData({ generatedAt: null, scores });
    } catch {}
  }

  useEffect(() => {
    loadOnce();
    const id = setInterval(loadOnce, 60_000); // refresh every 60s
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    return (data.scores || [])
      .filter((r) => r.ticker)
      .filter((r) => {
        if (r.price == null) return false;
        return r.price >= priceMin && r.price <= priceMax;
      })
      .filter((r) => {
        // Use gap % first, then fall back to change % if gap is missing
        const g = r.gap_pct ?? r.change_pct ?? 0;
        return g >= gapMin;
      })
      .filter((r) => {
        // If "News-only" mode is enabled, require a news/momentum heuristic:
        // either ai_score high or rvol >= 1.3
        if (!onlyNews) return true;
        return (r.ai_score ?? 0) > 0.5 || (r.rvol ?? 0) >= 1.3;
      })
      .sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
  }, [data.scores, priceMin, priceMax, gapMin, onlyNews]);

  // summary tiles
  const totalVol = useMemo(() => {
    return filtered.reduce((a, r) => a + (r.volume ?? 0), 0);
  }, [filtered]);

  const avgGap = useMemo(() => {
    const xs = filtered.map((r) => r.gap_pct ?? r.change_pct).filter((x) => x != null) as number[];
    if (!xs.length) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }, [filtered]);

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-sm opacity-80">
          Last Update {friendlyTime(data.generatedAt)} • Auto: 60s
        </div>
        <div className="ml-auto text-sm opacity-80">
          Avg Gap: {avgGap ? avgGap.toFixed(1) + "%" : "—"} • Total Vol: {formatInt(totalVol)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="text-sm">Price</label>
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-80">
              <Th>Ticker</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Gap %</Th>
              <Th className="text-right">Change %</Th>
              <Th className="text-right">rVol</Th>
              <Th className="text-right">Float (M)</Th>
              <Th className="text-right">Vol</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ticker} className="border-t border-white/10">
                <Td>{r.ticker}</Td>
                <TdR>{fmtNum(r.price)}</TdR>
                <TdR>{fmtPct(r.gap_pct)}</TdR>
                <TdR>{fmtPct(r.change_pct)}</TdR>
                <TdR>{fmtNum(r.rvol)}</TdR>
                <TdR>{fmtNum(r.float_m)}</TdR>
                <TdR>{formatInt(r.volume)}</TdR>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 opacity-70">
                  No matches. Try lowering the Gap %, widening the price range,
                  or disable “News / Momentum only”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- formatting helpers ----------
function fmtNum(v?: number | null, d = 2) {
  if (v == null) return "—";
  return Number(v).toFixed(d);
}
function fmtPct(v?: number | null) {
  if (v == null) return "—";
  return Number(v).toFixed(1) + "%";
}
function formatInt(v?: number | null) {
  if (!v) return "—";
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
function Td({ children, className = "" }: any) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
function TdR({ children, className = "" }: any) {
  return <td className={`px-3 py-2 text-right ${className}`}>{children}</td>;
}
