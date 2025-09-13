// app/components/ScoresTable.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** ───────────────────────── Tunables (edit these freely) ───────────────────────── */
const WEIGHTS = {
  rvol: 0.65,    // relative volume drives score
  ai: 0.20,      // AI confidence (0..1)
  gap: 0.10,     // opening gap (cap 20%)
  change: 0.05,  // intraday +change (cap +10%)
};

const RVOL_TRADE = 5.0;          // rVol ≥ 5x + gates + recent news → TRADE
const RVOL_TRADE_FALLBACK = 7.0; // no recent news path: require this rVol
const GAP_MIN_TRADE = 5;         // %
const GAP_MIN_TRADE_FALLBACK = 8;// % (no news)
const CHANGE_MIN_TRADE = 5;      // %  ← lowered from +10% as requested
const CHANGE_MIN_TRADE_FALLBACK = 6; // % (no news stays stricter)

const RVOL_WATCH = 2.5;          // rVol ≥ 2.5x → WATCH gate (with Gap & Change below)
const GAP_MIN_WATCH = 2;         // %
const CHANGE_MIN_WATCH = 0;      // %

const FLOAT_TARGET_M = 20;       // best around 20M
const FLOAT_BONUS = 3;           // +3 if float ≤ 20M
const FLOAT_PENALTY_MAX = 12;    // up to -12 pts above 20M (linear to 200M)
const FLOAT_PENALTY_CAP_M = 200; // ≥200M gets full penalty

const NEWS_WINDOW_MIN = 60;      // “recent” if published within this many minutes
const NEWS_BONUS = 8;            // flat score bonus if recent news exists

const TOP_N = 10;

/** Types */
type ScoreRow = {
  ticker: string;
  price?: number | null;
  gap_pct?: number | null;      // % open gap
  change_pct?: number | null;   // % intraday change
  rvol?: number | null;         // relative volume
  float_m?: number | null;      // float in millions
  ai_score?: number | null;     // 0..1
  rsi14m?: number | null;       // optional
  volume?: number | null;
  ts?: string | null;

  // derived
  catalyst?: { recent: boolean; latestISO?: string | null };
  actionScore?: number;         // 0..100
  action?: "TRADE" | "WATCH" | "SKIP";
};

type ScoresPayload = { generatedAt: string | null; scores: ScoreRow[] };

type NewsItem = {
  ticker: string;
  headline: string;
  summary?: string;
  source?: string;
  url?: string;
  published?: string; // ISO or "HH:mm:ss"
};

type NewsPayload = { generatedAt?: string | null; items: NewsItem[] };

/** Helpers */
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const safeNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
const parseChange = (s: any) => {
  if (s == null) return null;
  const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)%?$/);
  return m ? Number(m[1]) : safeNum(s);
};

function parseNewsTime(raw?: string): number | null {
  if (!raw) return null;
  try {
    // Accept ISO or HH:mm:ss (assumed today UTC)
    const isoLike = /T|Z/.test(raw) ? raw : `1970-01-01T${raw}Z`;
    const ms = Date.parse(isoLike);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

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
  const [onlyStrong, setOnlyStrong] = useState(false);

  // Fetch: Finviz → AI → News
  async function loadOnce() {
    let finvizRows: any[] = [];
    let aiMap: Record<string, any> = {};
    let aiGenerated: string | null = null;
    let newsMap = new Map<string, { latestISO: string | null; recent: boolean }>();

    // 1) Finviz
    try {
      const res = await fetch("/api/stocks", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j?.success && Array.isArray(j.data)) finvizRows = j.data;
      }
    } catch {}

    // 2) AI scores
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

    // 3) News (for catalyst gates + score bonus)
    try {
      const res = await fetch("/news.json", { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as NewsPayload;
        const now = Date.now();
        (j?.items || []).forEach((n) => {
          const t = String(n.ticker || "").toUpperCase();
          if (!t) return;
          const ms = parseNewsTime(n.published);
          const recent = ms != null ? (now - ms) / 60000 <= NEWS_WINDOW_MIN : false;
          const existing = newsMap.get(t);
          const latestISO =
            ms != null
              ? new Date(ms).toISOString()
              : existing?.latestISO ?? null;
          newsMap.set(t, {
            latestISO,
            recent: existing ? existing.recent || recent : recent,
          });
        });
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

        const catalyst = newsMap.get(row.ticker) || { recent: false, latestISO: null };
        row.catalyst = catalyst;

        const { score, action } = computeScoreAndDecision(row);
        row.actionScore = score;
        row.action = action;
        return row;
      });

      payload.generatedAt = payload.generatedAt || aiGenerated || null;
      setData(payload);
      return;
    }

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
        return rv >= RVOL_WATCH || ai >= 0.6 || as >= 70;
      })
      .sort((a, b) =>
        (b.actionScore ?? 0) - (a.actionScore ?? 0) ||
        (b.ai_score ?? 0) - (a.ai_score ?? 0)
      );

    return filtered.slice(0, TOP_N);
  }, [data.scores, priceMin, priceMax, gapMin, onlyStrong]);

  // notify News panel of current tickers
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
              <Th className="text-right">Catalyst</Th>
              <Th className="text-right">Vol</Th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((r) => {
              const strength = clamp((r.actionScore ?? 0) / 100, 0, 1);
              const alpha = 0.06 + strength * 0.24;
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
                  <TdR>{r.catalyst?.recent ? <span className="px-2 py-1 rounded bg-blue-500/20 border border-blue-400/40 text-blue-300 text-xs">NEWS • {timeOnly(r.catalyst.latestISO)}</span> : "—"}</TdR>
                  <TdR>{formatInt(r.volume)}</TdR>
                </tr>
              );
            })}
            {enriched.length === 0 && (
              <tr><td colSpan={12} className="text-center py-8 opacity-70">No matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ───── Action Score + Decision (includes news catalyst) ─────
 * Decision (ultimate):
 *   TRADE:
 *     - (rVol ≥ 5.0 && Gap ≥ 5% && Change ≥ +5% && has recent news)
 *         OR
 *     - (no recent news) rVol ≥ 7.0 && Gap ≥ 8% && Change ≥ +6%
 *
 *   WATCH: rVol ≥ 2.5 && Gap ≥ 2% && Change ≥ 0%
 *   SKIP: otherwise
 *
 * Action Score (ranking & gradient):
 *   65% rVol, 20% AI, 10% Gap, 5% Change, +NEWS_BONUS if recent news,
 *   plus float bonus/penalty around 20M.
 */
function computeScoreAndDecision(r: ScoreRow): { score: number; action: "TRADE" | "WATCH" | "SKIP" } {
  const ai = clamp((r.ai_score ?? 0), 0, 1);
  const rvRaw = r.rvol ?? 1;
  const rv = clamp((rvRaw - 1) / 2, 0, 1); // 1x→0, 3x→1
  const gapVal = Math.abs(r.gap_pct ?? r.change_pct ?? 0);
  const chgVal = r.change_pct ?? 0;
  const gap = clamp(gapVal / 20, 0, 1);
  const chg = clamp(Math.max(0, chgVal) / 10, 0, 1);

  let score =
    100 *
    (WEIGHTS.rvol * rv +
      WEIGHTS.ai * ai +
      WEIGHTS.gap * gap +
      WEIGHTS.change * chg);

  // Float adjustment
  const f = r.float_m ?? null;
  if (f != null) {
    if (f <= FLOAT_TARGET_M) score += FLOAT_BONUS;
    else {
      const capped = Math.min(f, FLOAT_PENALTY_CAP_M);
      const frac = (capped - FLOAT_TARGET_M) / (FLOAT_PENALTY_CAP_M - FLOAT_TARGET_M);
      score -= FLOAT_PENALTY_MAX * clamp(frac, 0, 1);
    }
  }

  // News boost
  if (r.catalyst?.recent) score += NEWS_BONUS;

  // Micro penalties
  if (chgVal < 0) score -= 5;
  const rsi = r.rsi14m ?? null;
  if (rsi != null && (rsi >= 85 || rsi <= 15)) score -= 5;

  score = clamp(score, 0, 100);

  // Decision gates (news-aware)
  let action: "TRADE" | "WATCH" | "SKIP";
  const hasNews = !!r.catalyst?.recent;

  if (
    (hasNews &&
      rvRaw >= RVOL_TRADE &&
      gapVal >= GAP_MIN_TRADE &&
      chgVal >= CHANGE_MIN_TRADE) ||
    (!hasNews &&
      rvRaw >= RVOL_TRADE_FALLBACK &&
      gapVal >= GAP_MIN_TRADE_FALLBACK &&
      chgVal >= CHANGE_MIN_TRADE_FALLBACK)
  ) {
    action = "TRADE";
  } else if (rvRaw >= RVOL_WATCH && gapVal >= GAP_MIN_WATCH && chgVal >= CHANGE_MIN_WATCH) {
    action = "WATCH";
  } else {
    action = "SKIP";
  }

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
function timeOnly(iso?: string | null) { if (!iso) return "—"; try { const d = new Date(iso); return d.toLocaleTimeString([], { hour12: false }); } catch { return "—"; } }
function Th({ children, className = "" }: any) { return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>; }
function Td({ children, className = "" }: any) { return <td className={`px-3 py-2 ${className}`}>{children}</td>; }
function TdR({ children, className = "" }: any) { return <td className={`px-3 py-2 text-right ${className}`}>{children}</td>; }
function Badge({ decision }: { decision?: "TRADE" | "WATCH" | "SKIP" }) {
  let tx = "SKIP"; let cls = "text-white/80 bg-white/10 border-white/10";
  if (decision === "TRADE") { tx = "TRADE"; cls = "text-black bg-green-500 border-green-500"; }
  else if (decision === "WATCH") { tx = "WATCH"; cls = "text-yellow-300 bg-yellow-900/30 border-yellow-700/40"; }
  return <span className={`px-2 py-1 rounded border text-xs ${cls}`}>{tx}</span>;
}
