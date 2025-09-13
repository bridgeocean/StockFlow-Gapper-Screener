// app/components/ScoresTable.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** ──────────────────────────────────────────────────────────────────────────
 *  Tunables (easy to tweak without touching the rest of the file)
 *  ────────────────────────────────────────────────────────────────────────── */
const WEIGHTS = {
  ai: 0.45,     // AI model confidence (0..1)
  rvol: 0.30,   // Relative volume (1x baseline; saturates at ~3x)
  gap: 0.15,    // Opening gap (saturates at 20%)
  change: 0.10, // Intraday positive change (saturates at +10%)
};

const FLOAT_TARGET_M = 20;        // target float (M) — best liquidity pop
const FLOAT_PENALTY_MAX = 12;     // max points to subtract for large floats
const FLOAT_PENALTY_CAP_M = 200;  // 200M+ gets the full penalty
const FLOAT_BONUS = 3;            // bonus points when float ≤ 20M

const TOP_N = 10;                 // show only the top N rows

/** Types */
type ScoreRow = {
  ticker: string;
  price?: number | null;
  gap_pct?: number | null;      // % gap (Finviz "Gap")
  change_pct?: number | null;   // % daily change
  rvol?: number | null;         // relative volume
  float_m?: number | null;      // float in millions
  ai_score?: number | null;     // 0..1 (from today_scores.json)
  rsi14m?: number | null;       // optional, from AI JSON
  volume?: number | null;
  ts?: string | null;

  // derived:
  actionScore?: number;         // 0..100
  action?: "TRADE" | "WATCH" | "SKIP";
};

type ScoresPayload = { generatedAt: string | null; scores: ScoreRow[] };

/** Helpers */
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const safeNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
const parseChange = (s: any) => {
  if (s == null) return null;
  const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)%?$/);
  return m ? Number(m[1]) : safeNum(s);
};

function mapFinvizStocksToScores(rows: any[]): ScoresPayload {
  const scores: ScoreRow[] = rows
    .map((s) => {
      const t = (s.symbol || s.ticker || "").toString().toUpperCase();
      if (!t) return null;

      const gap =
        safeNum(s.gap) ?? safeNum(s.gap_pct) ?? parseChange(s.gapPct) ?? null;

      const relv =
        safeNum(s.relativeVolume) ??
        safeNum(s.relVolume) ??
        safeNum(s.rvol) ??
        null;

      let floatM = safeNum(s.floatM) ?? safeNum(s.float_m) ?? null;
      if (floatM == null && s.float_shares != null) {
        const abs = safeNum(s.float_shares);
        if (abs != null) floatM = Math.round((abs / 1_000_000) * 10) / 10;
      }
      if (floatM == null && s.float != null) floatM = safeNum(s.float);

      return {
        ticker: t,
        price: safeNum(s.price),
        gap_pct: gap,
        change_pct: parseChange(s.changePercent ?? s.change_pct ?? s.change),
        rvol: relv,
        float_m: floatM,
        ai_score: null,
        rsi14m: null,
        volume: safeNum(s.volume),
        ts: s.lastUpdated || s.ts || null,
      };
    })
    .filter(Boolean) as ScoreRow[];

  return { generatedAt: new Date().toISOString(), scores };
}

/** Component */
export default function ScoresTable({
  onTopTickersChange,
}: {
  onTopTickersChange?: (tickers: string[]) => void;
}) {
  const [data, setData] = useState<ScoresPayload>({ generatedAt: null, scores: [] });

  // simple controls
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(5);
  const [gapMin, setGapMin] = useState(5);
  const [onlyStrong, setOnlyStrong] = useState(false); // AI/momentum filter

  // Fetch order: Finviz → AI JSON → fallbacks
  async function loadOnce() {
    let finvizRows: any[] = [];
    let aiMap: Record<string, any> = {};
    let aiGenerated: string | null = null;

    try {
      const res = await fetch("/api/stocks", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j?.success && Array.isArray(j.data)) finvizRows = j.data;
      }
    } catch {}

    try {
      const res = await fetch("/today_scores.json", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        (j?.scores || []).forEach((s: any) => {
          const t = String(s.ticker || "").toUpperCase();
          if (t) aiMap[t] = s;
        });
        aiGenerated = j?.generatedAt ?? null;
      }
    } catch {}

    if (finvizRows.length) {
      const payload = mapFinvizStocksToScores(finvizRows);

      payload.scores = payload.scores.map((row) => {
        const ai = aiMap[row.ticker];
        if (ai) {
          row.ai_score = safeNum(ai.score);
          row.rsi14m = safeNum(ai.rsi14m);
          if (row.gap_pct == null && safeNum(ai.gap_pct) != null) row.gap_pct = safeNum(ai.gap_pct);
          if (row.rvol == null && safeNum(ai.rvol) != null) row.rvol = safeNum(ai.rvol);
        }
        // derive decision
        const derived = computeAction(row);
        row.actionScore = derived.score;
        row.action = derived.action;
        return row;
      });

      payload.generatedAt = payload.generatedAt || aiGenerated || null;
      setData(payload);
      return;
    }

    // Fallbacks omitted for brevity; keep Finviz-first flow
    setData({ generatedAt: aiGenerated, scores: [] });
  }

  useEffect(() => {
    loadOnce();
    const id = setInterval(loadOnce, 60_000);
    return () => clearInterval(id);
  }, []);

  const enriched = useMemo(() => {
    const filtered = (data.scores || [])
      .filter((r) => r.ticker)
      .filter((r) => r.price != null && r.price >= priceMin && r.price <= priceMax)
      .filter((r) => (r.gap_pct ?? r.change_pct ?? 0) >= gapMin)
      .filter((r) => {
        if (!onlyStrong) return true;
        const ai = r.ai_score ?? 0;
        const rv = r.rvol ?? 0;
        const as = r.actionScore ?? 0;
        return ai >= 0.6 || rv >= 1.5 || as >= 70;
      })
      .sort((a, b) =>
        (b.actionScore ?? 0) - (a.actionScore ?? 0) ||
        (b.ai_score ?? 0) - (a.ai_score ?? 0)
      );

    return filtered.slice(0, TOP_N);
  }, [data.scores, priceMin, priceMax, gapMin, onlyStrong]);

  // notify News panel about current top tickers
  const tickRef = useRef<string>("");
  useEffect(() => {
    const topTickers = enriched.map((r) => r.ticker);
    const key = topTickers.join(",");
    if (key !== tickRef.current) {
      tickRef.current = key;
      onTopTickersChange?.(topTickers);
    }
  }, [enriched, onTopTickersChange]);

  // summary
  const totalVol = useMemo(() => enriched.reduce((a, r) => a + (r.volume ?? 0), 0), [enriched]);
  const avgGap = useMemo(() => {
    const xs = enriched.map((r) => r.gap_pct ?? r.change_pct).filter((x) => x != null) as number[];
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }, [enriched]);

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-sm opacity-80">
          Last Update {friendlyTime(data.generatedAt)} • Auto: 60s
        </div>
        <div className="ml-auto text-sm opacity-80">
          Avg Gap: {avgGap ? avgGap.toFixed(1) + "%" : "—"} • Total Vol: {formatInt(totalVol)} • Showing {enriched.length} / {TOP_N}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="text-sm">Price</label>
        <input type="number" value={priceMin} onChange={(e) => setPriceMin(+e.target.value || 0)} className="w-20 rounded-lg bg-black/40 border border-white/15 px-2 py-1" />
        <span className="opacity-60">to</span>
        <input type="number" value={priceMax} onChange={(e) => setPriceMax(+e.target.value || 0)} className="w-20 rounded-lg bg-black/40 border border-white/15 px-2 py-1" />

        <label className="text-sm">Gap % ≥</label>
        <input type="number" value={gapMin} onChange={(e) => setGapMin(+e.target.value || 0)} className="w-20 rounded-lg bg-black/40 border border-white/15 px-2 py-1" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyStrong} onChange={(e) => setOnlyStrong(e.target.checked)} />
          AI / Momentum filter
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
              <Th className="text-right">AI</Th>
              <Th className="text-right">RSI(14m)</Th>
              <Th className="text-right">Action Score</Th>
              <Th className="text-right">Decision</Th>
              <Th className="text-right">Vol</Th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((r) => {
              // gradient: stronger for higher ActionScore (light-green -> transparent)
              const strength = clamp((r.actionScore ?? 0) / 100, 0, 1);
              const alpha = 0.06 + strength * 0.24; // 0.06..0.30
              const bg = `linear-gradient(90deg, rgba(74,222,128,${alpha}) 0%, rgba(0,0,0,0) 55%)`;

              return (
                <tr key={r.ticker} className="border-t border-white/10" style={{ background: bg }}>
                  <Td>{r.ticker}</Td>
                  <TdR>{fmtNum(r.price)}</TdR>
                  <TdR>{fmtPct(r.gap_pct)}</TdR>
                  <TdR>{fmtPct(r.change_pct)}</TdR>
                  <TdR>{fmtNum(r.rvol)}</TdR>
                  <TdR>{fmtNum(r.float_m)}</TdR>
                  <TdR>{r.ai_score == null ? "—" : r.ai_score.toFixed(2)}</TdR>
                  <TdR>{fmtNum(r.rsi14m)}</TdR>
                  <TdR className="font-semibold">{Math.round(r.actionScore ?? 0)}</TdR>
                  <TdR><Badge decision={r.action} /></TdR>
                  <TdR>{formatInt(r.volume)}</TdR>
                </tr>
              );
            })}
            {enriched.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-8 opacity-70">
                  No matches. Try lowering Gap %, widening price range, or disabling AI / Momentum filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ──────────────────────────────────────────────────────────────────────────
 *  Decision model: Action Score (0..100) + Decision label
 *
 *  Weights:
 *   - AI score (0..1) ..................... 45%
 *   - Relative volume (1x→0 .. 3x→1) ...... 30%
 *   - Gap % (0..20% → 0..1) ............... 15%
 *   - Intraday +Change (0..10% → 0..1) .... 10%
 *
 *  Float adjustment (20M target):
 *   - Bonus: +3 points if float ≤ 20M
 *   - Penalty: up to -12 points as float rises from 20M → 200M (linear)
 *     (“penalize” means subtract points from the Action Score)
 *  Other micro rules:
 *   - Red day penalty: -5 if change_pct < 0
 *   - RSI(14m) stretched penalty: -5 if RSI ≥ 85 or ≤ 15
 *  ────────────────────────────────────────────────────────────────────────── */
function computeAction(r: ScoreRow): { score: number; action: "TRADE" | "WATCH" | "SKIP" } {
  // Normalize each term into 0..1 range
  const ai = clamp((r.ai_score ?? 0), 0, 1);

  // rVol: 1x baseline → 0, 3x+ → 1 (you can widen by changing /2 to /3 for 4x cap, etc.)
  const rv = clamp(((r.rvol ?? 1) - 1) / 2, 0, 1);

  // Gap: use absolute gap up to 20%
  const gap = clamp(Math.abs(r.gap_pct ?? r.change_pct ?? 0) / 20, 0, 1);

  // Intraday change: only reward positive up to +10%
  const chg = clamp(Math.max(0, r.change_pct ?? 0) / 10, 0, 1);

  // Base weighted score
  let score =
    100 *
    (WEIGHTS.ai * ai +
      WEIGHTS.rvol * rv +
      WEIGHTS.gap * gap +
      WEIGHTS.change * chg);

  // Float bonus/penalty around 20M
  const f = r.float_m ?? null;
  if (f != null) {
    if (f <= FLOAT_TARGET_M) {
      score += FLOAT_BONUS;
    } else {
      const capped = Math.min(f, FLOAT_PENALTY_CAP_M);
      const frac =
        (capped - FLOAT_TARGET_M) / (FLOAT_PENALTY_CAP_M - FLOAT_TARGET_M); // 0..1
      score -= FLOAT_PENALTY_MAX * clamp(frac, 0, 1);
    }
  }

  // Other micro adjustments
  if ((r.change_pct ?? 0) < 0) score -= 5; // red day
  const rsi = r.rsi14m ?? null;
  if (rsi != null && (rsi >= 85 || rsi <= 15)) score -= 5; // stretched

  score = clamp(score, 0, 100);

  const action: "TRADE" | "WATCH" | "SKIP" =
    score >= 75 ? "TRADE" : score >= 55 ? "WATCH" : "SKIP";

  return { score, action };
}

/** UI helpers */
function fmtNum(v?: number | null, d = 2) { if (v == null) return "—"; return Number(v).toFixed(d); }
function fmtPct(v?: number | null) { if (v == null) return "—"; return Number(v).toFixed(1) + "%"; }
function formatInt(v?: number | null) {
  if (!v) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "k";
  return String(v);
}
function friendlyTime(iso: string | null) { if (!iso) return "—"; try { const d = new Date(iso); return d.toLocaleTimeString([], { hour12: false }); } catch { return "—"; } }
function Th({ children, className = "" }: any) { return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>; }
function Td({ children, className = "" }: any) { return <td className={`px-3 py-2 ${className}`}>{children}</td>; }
function TdR({ children, className = "" }: any) { return <td className={`px-3 py-2 text-right ${className}`}>{children}</td>; }
function Badge({ decision }: { decision?: "TRADE" | "WATCH" | "SKIP" }) {
  let tx = "SKIP"; let cls = "text-white/80 bg-white/10 border-white/10";
  if (decision === "TRADE") { tx = "TRADE"; cls = "text-black bg-green-500 border-green-500"; }
  else if (decision === "WATCH") { tx = "WATCH"; cls = "text-yellow-300 bg-yellow-900/30 border-yellow-700/40"; }
  return <span className={`px-2 py-1 rounded border text-xs ${cls}`}>{tx}</span>;
}
