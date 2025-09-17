"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PerPageSelect from "./PerPageSelect";

/** ───────────────────────── Tunables (lenient) ─────────────────────────
 *  More permissive thresholds + a reasonable rVol fallback when rVol is missing.
 *  This helps names like ATCH (large gap/%change) get TRADE classification.
 */
const WEIGHTS = { rvol: 0.55, ai: 0.20, gap: 0.18, change: 0.07 };

const RVOL_TRADE = 3.0;                 // with recent news
const RVOL_TRADE_FALLBACK = 4.5;        // no news

const GAP_MIN_TRADE = 4;                // with news
const GAP_MIN_TRADE_FALLBACK = 6;       // no news

const CHANGE_MIN_TRADE = 3;             // with news
const CHANGE_MIN_TRADE_FALLBACK = 5;    // no news

const RVOL_WATCH = 1.8;
const GAP_MIN_WATCH = 1.5;
const CHANGE_MIN_WATCH = 0;

const FLOAT_TARGET_M = 20;
const FLOAT_BONUS = 3;
const FLOAT_PENALTY_MAX = 12;
const FLOAT_PENALTY_CAP_M = 200;

const NEWS_WINDOW_MIN = 60;
const NEWS_BONUS = 8;

/** Types */
type ScoreRow = {
  ticker: string;
  price?: number | null;
  gap_pct?: number | null;
  change_pct?: number | null;
  rvol?: number | null;
  float_m?: number | null;
  ai_score?: number | null;
  rsi14m?: number | null;
  volume?: number | null;
  ts?: string | null;
  catalyst?: {
    recent: boolean;
    latestISO?: string | null;
    latestUrl?: string | null;
    latestHeadline?: string | null;
    latestTag?: string | null;
  };
  actionScore?: number;
  action?: "TRADE" | "WATCH" | "SKIP";
};

type ScoresPayload = { generatedAt: string | null; scores: ScoreRow[] };
type NewsItem = { ticker: string; headline: string; url?: string; published?: string; source?: string; tag?: string };
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
    const isoLike = /T|Z/.test(raw) ? raw : `1970-01-01T${raw}Z`;
    const ms = Date.parse(isoLike);
    return Number.isFinite(ms) ? ms : null;
  } catch { return null; }
}
const finvizNewsUrl = (ticker: string) => `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}#news`;

function mapFinvizStocksToScores(rows: any[]): ScoresPayload {
  const scores: ScoreRow[] = rows.map((s) => {
    const t = (s.symbol || s.ticker || "").toString().toUpperCase();
    if (!t) return null as any;

    const gap = safeNum(s.gap) ?? safeNum(s.gap_pct) ?? parseChange(s.gapPct) ?? null;
    const relv = safeNum(s.relativeVolume) ?? safeNum(s.relVolume) ?? safeNum(s.rvol) ?? null;

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
  }).filter(Boolean) as ScoreRow[];

  return { generatedAt: new Date().toISOString(), scores };
}

/** Component */
export default function ScoresTable({ onTopTickersChange }: { onTopTickersChange?: (tickers: string[]) => void; }) {
  const [data, setData] = useState<ScoresPayload>({ generatedAt: null, scores: [] });
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(5);
  const [gapMin, setGapMin] = useState(5);
  const [onlyStrong, setOnlyStrong] = useState(false);

  // page size (10/25/50), persisted
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    const saved = Number(localStorage.getItem("sf_page_size") || "10");
    return [10, 25, 50].includes(saved) ? saved : 10;
  });
  useEffect(() => { try { localStorage.setItem("sf_page_size", String(pageSize)); } catch {} }, [pageSize]);

  const [page, setPage] = useState(1);

  async function loadOnce() {
    let finvizRows: any[] = [];
    let aiMap: Record<string, any> = {};
    let aiGenerated: string | null = null;
    const newsMap = new Map<string, {
      latestISO: string | null;
      latestUrl: string | null;
      recent: boolean;
      latestHeadline: string | null;
      latestTag: string | null;
    }>();

    // 1) Stocks
    try {
      const res = await fetch("/api/stocks", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j?.success && Array.isArray(j.data)) finvizRows = j.data;
      }
    } catch {}

    // 2) AI scores
    try {
      const res = await fetch("/api/scores", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        (j?.scores || []).forEach((s: any) => {
          const t = String(s.ticker || "").toUpperCase();
          if (t) aiMap[t] = s;
        });
        aiGenerated = j?.generatedAt ?? null;
      }
    } catch {}

    // 3) News cache
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as NewsPayload;
        const now = Date.now();
        const byT: Record<string, NewsItem[]> = {};
        (j?.items || []).forEach((n) => {
          const t = String(n.ticker || "").toUpperCase();
          if (!t) return;
          byT[t] ??= [];
          byT[t].push(n);
        });
        for (const [t, arr] of Object.entries(byT)) {
          arr.sort((a, b) => (parseNewsTime(b.published) ?? 0) - (parseNewsTime(a.published) ?? 0));
          const latest = arr[0];
          const ms = parseNewsTime(latest?.published);
          const recent = ms != null ? (now - ms) / 60000 <= NEWS_WINDOW_MIN : false;
          newsMap.set(t, {
            latestISO: ms != null ? new Date(ms).toISOString() : null,
            latestUrl: latest?.url ?? null,
            recent,
            latestHeadline: latest?.headline ?? null,
            latestTag: latest?.tag ?? null,
          });
        }
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
        row.catalyst = newsMap.get(row.ticker) || {
          recent: false, latestISO: null, latestUrl: null, latestHeadline: null, latestTag: null,
        };

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

  const filteredAll = useMemo(() => {
    return (data.scores || [])
      .filter((r) => r.ticker)
      .filter((r) => r.price != null && r.price >= priceMin && r.price <= priceMax)
      .filter((r) => (r.gap_pct ?? r.change_pct ?? 0) >= gapMin)
      .filter((r) => {
        if (!onlyStrong) return true;
        const ai = r.ai_score ?? 0;
        // be lenient here too
        const rv = (r.rvol ?? 0);
        const as = r.actionScore ?? 0;
        return rv >= 2 || ai >= 0.55 || as >= 60;
      })
      .sort((a, b) =>
        (b.actionScore ?? 0) - (a.actionScore ?? 0) ||
        (b.ai_score ?? 0) - (a.ai_score ?? 0)
      );
  }, [data.scores, priceMin, priceMax, gapMin, onlyStrong]);

  // Pagination (no data cut-off)
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredAll.length / pageSize));
  useEffect(() => { setPage((p) => Math.min(Math.max(1, p), totalPages)); }, [totalPages]);
  useEffect(() => { setPage(1); }, [priceMin, priceMax, gapMin, onlyStrong, pageSize]);

  const start = (page - 1) * pageSize;
  const end = Math.min(filteredAll.length, start + pageSize);
  const visible = filteredAll.slice(start, end);

  // tell NewsPanel which tickers are visible
  const tickRef = useRef<string>("");
  useEffect(() => {
    const top = visible.map((r) => r.ticker);
    const key = top.join(",");
    if (key !== tickRef.current) {
      tickRef.current = key;
      onTopTickersChange?.(top);
    }
  }, [visible, onTopTickersChange]);

  const avgGap = useMemo(() => {
    const xs = visible.map((r) => r.gap_pct ?? r.change_pct).filter((x) => x != null) as number[];
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }, [visible]);

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-sm opacity-80">Last Update {friendlyTime(data.generatedAt)} • Auto: 60s</div>
        <div className="ml-auto text-sm opacity-80">
          Avg Gap: {avgGap ? avgGap.toFixed(1) + "%" : "—"} • Results: {filteredAll.length}
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

        <div className="ml-auto" />
        <PerPageSelect value={pageSize} onChange={setPageSize} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/90">
              <Th>Ticker</Th><Th className="text-right">Price</Th>
              <Th className="text-right">Gap %</Th><Th className="text-right">Change %</Th>
              <Th className="text-right">rVol</Th><Th className="text-right">Float (M)</Th>
              <Th className="text-right">AI</Th><Th className="text-right">RSI(14m)</Th>
              <Th className="text-right">Action Score</Th><Th className="text-right">Decision</Th>
              <Th className="text-right">Catalyst</Th><Th className="text-right">Vol</Th>
            </tr>
          </thead>
          <tbody className="text-white/90">
            {visible.map((r) => {
              const strength = clamp((r.actionScore ?? 0) / 100, 0, 1);
              const alpha = 0.10 + strength * 0.38;
              const bg = `linear-gradient(90deg, rgba(16,185,129,${alpha}) 0%, rgba(0,0,0,0) 62%)`;
              const leftAccent = strength > 0.25 ? `inset 3px 0 0 0 rgba(16,185,129, ${0.25 + strength * 0.4})` : "none";
              const hasNews = !!r.catalyst?.latestISO;
              const tag = r.catalyst?.latestTag || (hasNews ? "NEWS" : "");
              const finvizLink = finvizNewsUrl(r.ticker);

              return (
                <tr
                  key={r.ticker}
                  className="border-t border-white/10"
                  style={{ background: bg, boxShadow: leftAccent as any }}
                >
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
                  <TdR>
                    {hasNews ? (
                      <a
                        href={finvizLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded bg-blue-500/20 border border-blue-400/40 text-blue-300 text-xs underline"
                        title={r.catalyst?.latestHeadline ?? "Open on Finviz"}
                      >
                        {tag} • {timeOnly(r.catalyst?.latestISO)}
                      </a>
                    ) : "—"}
                  </TdR>
                  <TdR>{formatInt(r.volume)}</TdR>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={12} className="text-center py-8 opacity-70">No matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <div className="opacity-80">
          Showing {visible.length ? `${start + 1}–${end}` : "0"} of {filteredAll.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span>Page {page} / {Math.max(1, Math.ceil(filteredAll.length / pageSize))}</span>
          <button
            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(Math.ceil(filteredAll.length / pageSize), p + 1))}
            disabled={page >= Math.ceil(filteredAll.length / pageSize)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

/** ───── Scoring + Decision (lenient + rVol fallback) ───── */
function computeScoreAndDecision(r: ScoreRow): { score: number; action: "TRADE" | "WATCH" | "SKIP" } {
  const ai = clamp((r.ai_score ?? 0), 0, 1);

  const gapVal = Math.abs(r.gap_pct ?? r.change_pct ?? 0);
  const chgVal = r.change_pct ?? 0;

  // rVol fallback heuristic:
  // if rVol is missing, infer a reasonable value from the gap size
  const rvRaw = r.rvol ?? (gapVal >= 40 ? 4.5 : gapVal >= 20 ? 3.0 : 1.0);

  const rv = clamp((rvRaw - 1) / 2, 0, 1);
  const gap = clamp(gapVal / 20, 0, 1);
  const chg = clamp(Math.max(0, chgVal) / 10, 0, 1);

  let score = 100 * (WEIGHTS.rvol * rv + WEIGHTS.ai * ai + WEIGHTS.gap * gap + WEIGHTS.change * chg);

  const f = r.float_m ?? null;
  if (f != null) {
    if (f <= FLOAT_TARGET_M) score += FLOAT_BONUS;
    else {
      const capped = Math.min(f, FLOAT_PENALTY_CAP_M);
      const frac = (capped - FLOAT_TARGET_M) / (FLOAT_PENALTY_CAP_M - FLOAT_TARGET_M);
      score -= FLOAT_PENALTY_MAX * clamp(frac, 0, 1);
    }
  }
  const hasNews = !!r.catalyst?.latestISO;
  if (hasNews) score += NEWS_BONUS;
  if (chgVal < 0) score -= 4;
  const rsi = r.rsi14m ?? null;
  if (rsi != null && (rsi >= 85 || rsi <= 15)) score -= 4;

  score = clamp(score, 0, 100);

  let action: "TRADE" | "WATCH" | "SKIP";
  if (
    (hasNews && rvRaw >= RVOL_TRADE && gapVal >= GAP_MIN_TRADE && chgVal >= CHANGE_MIN_TRADE) ||
    (!hasNews && rvRaw >= RVOL_TRADE_FALLBACK && gapVal >= GAP_MIN_TRADE_FALLBACK && chgVal >= CHANGE_MIN_TRADE_FALLBACK)
  ) action = "TRADE";
  else if (rvRaw >= RVOL_WATCH && gapVal >= GAP_MIN_WATCH && chgVal >= CHANGE_MIN_WATCH) action = "WATCH";
  else action = "SKIP";

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
