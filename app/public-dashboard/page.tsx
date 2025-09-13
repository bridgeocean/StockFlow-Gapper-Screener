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
type Alert = { id: string; level: "HIGH" | "MEDIUM" | "LOW"; at: string; ticker: string; price?: number; changePct?: number; gapPct?: number; read?: boolean; };

const num = (v: any): number | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%,$\s,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const toISOorNull = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const humanVol = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

function mergeByTicker<T extends { ticker: string }>(prev: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  prev.forEach((r) => map.set(r.ticker, r));
  incoming.forEach((r) => map.set(r.ticker, r));
  return Array.from(map.values());
}

export default function Dashboard() {
  const r = useRouter();
  useEffect(() => { if (sessionStorage.getItem("sf_auth_ok") !== "1") r.push("/"); }, [r]);

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

  // Availability of fields
  const [hasRelVol, setHasRelVol] = useState(false);
  const [hasPerf10m, setHasPerf10m] = useState(false);
  const [hasFloatM, setHasFloatM] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const pickSymKey = (row: CandidateRow) => {
    for (const k of ["Ticker", "ticker", "Symbol", "symbol"]) if (k in row) return k;
    return "Ticker";
  };

  const detectFields = (rows: CandidateRow[]) => {
    const any = rows[0] || {};
    const hasRel = ("RelVol" in any) || ("Relative Volume" in any) || (("Volume" in any) && ("AvgVolume" in any));
    const hasPerf = ("Perf10m" in any) || ("Perf_10m_pct" in any) || ("perf10m" in any) || ("Change" in any) || ("change" in any);
    const hasFloat = ("FloatM" in any) || ("Float (M)" in any) || ("Float" in any) || ("float" in any);
    setHasRelVol(!!hasRel);
    setHasPerf10m(!!hasPerf);
    setHasFloatM(!!hasFloat);
  };

  const buildMergedRows = (
    sPayload: ScoresPayload | null,
    cRows: CandidateRow[],
    newsItems?: NewsItem[]
  ) => {
    const sMap = new Map<string, ScoreRow>();
    (sPayload?.scores || []).forEach((s) => s.ticker && sMap.set(s.ticker.toUpperCase(), s));
    const allowedNews =
      newsOnly && newsItems
        ? new Set(newsItems.map((n) => n.ticker?.toUpperCase()).filter(Boolean))
        : null;

    const symKey = pickSymKey(cRows[0] || {});
    const result: any[] = [];

    for (const r of cRows) {
      const t = String(r[symKey] ?? "").toUpperCase().trim();
      if (!t) continue;
      if (allowedNews && !allowedNews.has(t)) continue;

      const price = num(r.Price ?? r.price);
      const gapPct = num(r.GapPct ?? r.gapPct ?? r.Change ?? r.change);
      const volume = num(r.Volume ?? r.volume);

      // RelVol: native or derived
      let relVol = num(r.RelVol ?? r["Relative Volume"]);
      if (relVol === undefined && r.Volume !== undefined && r.AvgVolume !== undefined) {
        const v = num(r.Volume); const av = num(r.AvgVolume);
        if (v !== undefined && av && av > 0) relVol = v / av;
      }

      // Perf10m: native or fallback to Change (%)
      let perf10m = num(r.Perf10m ?? r.perf10m ?? r.Perf_10m_pct);
      if (perf10m === undefined) perf10m = num(r.Change ?? r.change);

      // FloatM: native or derived from Float
      let floatM = num(r.FloatM ?? r["Float (M)"]);
      if (floatM === undefined) {
        const rawFloat = num(r.Float ?? r.float);
        if (rawFloat !== undefined) {
          // If rawFloat is too big, assume shares and convert to millions
          floatM = rawFloat > 1000 ? rawFloat / 1_000_000 : rawFloat; 
        }
      }

      const sRow = sMap.get(t);
      result.push({ ticker: t, price, gapPct, volume, relVol, perf10m, floatM, score: sRow?.score });
    }
    return result;
  };

  const addAlertsForNew = (merged: any[]) => {
    const prev = new Set(rowsRef.current.map((x: any) => x.ticker));
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
    const added: Alert[] = [];
    for (const m of merged) {
      if (!prev.has(m.ticker)) {
        const g = m.gapPct ?? 0;
        const lvl: Alert["level"] = g >= 40 ? "HIGH" : g >= 15 ? "MEDIUM" : "LOW";
        added.push({ id: `${m.ticker}-${Date.now()}`, level: lvl, at: ts, ticker: m.ticker, price: m.price, gapPct: m.gapPct });
      }
    }
    if (added.length) setAlerts((a) => [...added, ...a].slice(0, 20));
  };

  const pull = async () => {
    try {
      const sRes = await fetch("/today_scores.json", { cache: "no-store" });
      const sPayload = sRes.ok ? ((await sRes.json()) as ScoresPayload) : { generatedAt: null, scores: [] };
      setScores(sPayload);

      const cRes = await fetch("/today_candidates.csv", { cache: "no-store" });
      const cText = cRes.ok ? await cRes.text() : "";
      const parsed = Papa.parse<CandidateRow>(cText, { header: true, skipEmptyLines: true });
      const cRows = (parsed.data || []).filter(Boolean);
      setCandidates(cRows);
      detectFields(cRows);

      const nRes = await fetch("/today_news.json", { cache: "no-store" });
      const nPayload = nRes.ok ? ((await nRes.json()) as NewsPayload) : { items: [] };
      setNews(nPayload);

      const merged = buildMergedRows(sPayload, cRows, newsOnly ? nPayload.items : undefined);
      addAlertsForNew(merged);
      setRows((prev) => mergeByTicker(prev, merged));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch { /* ignore transient */ }
  };

  useEffect(() => {
    pull();
    const id = setInterval(pull, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const merged = buildMergedRows(scores, candidates, newsOnly ? (news?.items ?? []) : undefined);
    setRows((prev) => mergeByTicker(prev, merged));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsOnly, candidates, scores, news]);

  // First-seen stamp
  const firstSeen = useRef<Map<string, string>>(new Map());
  const rowsWithSince = useMemo(() => {
    const now = new Date().toLocaleTimeString();
    return rows.map((r) => {
      if (!firstSeen.current.has(r.ticker)) firstSeen.current.set(r.ticker, now);
      return { ...r, firstSeenAt: firstSeen.current.get(r.ticker) };
    });
  }, [rows]);

  // Filters
  const filtered = useMemo(() => {
    return rowsWithSince.filter((r) => {
      if (r.price === undefined) return false;
      if (r.price < priceMin || r.price > priceMax) return false;
      if (r.gapPct !== undefined && r.gapPct < minGap) return false;
      if (hasRelVol && minRelVol && r.relVol !== undefined && r.relVol < minRelVol) return false;
      if (hasPerf10m && minPerf10m && r.perf10m !== undefined && r.perf10m < minPerf10m) return false;
      if (hasFloatM && maxFloatM && r.floatM !== undefined && r.floatM > maxFloatM) return false;
      return true;
    });
  }, [rowsWithSince, priceMin, priceMax, minGap, hasRelVol, minRelVol, hasPerf10m, minPerf10m, hasFloatM, maxFloatM]);

  // Metrics
  const avgGap =
    filtered.length > 0
      ? (filtered.reduce((a, r) => a + (r.gapPct ?? 0), 0) / filtered.length).toFixed(1)
      : "0.0";
  const totalVol = filtered.reduce((a, r) => a + (r.volume ?? 0), 0);

  const shownTickers = new Set(filtered.map((f) => f.ticker));
  const newsShown = (news?.items || [])
    .filter((n) => n.ticker && shownTickers.has(n.ticker.toUpperCase()))
    .slice(0, 10);

  const onLogout = () => { sessionStorage.removeItem("sf_auth_ok"); r.push("/"); };
  const onRefresh = () => pull();
  const markAllRead = () => setAlerts((a) => a.map((x) => ({ ...x, read: true })));
  const clearAll = () => setAlerts([]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2a1459] via-[#180a36] to-black text-white">
      {/* Top bar */}
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow size={36} className="text-green-400 rotate-0" />
          <div className="text-xl font-bold">StockFlow</div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => r.push("/")} className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2" title="Home">🏠</button>
          <button onClick={onRefresh} className="rounded-xl bg-green-500 text-black px-4 py-2 font-semibold hover:brightness-110" title="Refresh now">Refresh</button>
          <div className="text-xs text-white/70 ml-1">Last Update {lastUpdated ?? "—"} • Auto: 60s</div>
          <button onClick={onLogout} className="ml-3 rounded-xl bg-red-500 text-white px-4 py-2 font-semibold hover:brightness-110">Logout</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-7xl mx-auto px-5 grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        <KPI label={<span>🔥 High momentum</span>} value={Math.min(filtered.length, 10).toString()} sub={<span className="text-white/70">Top movers by filters</span>} />
        <KPI label={<span>📊 Gap percentage</span>} value={`${avgGap}%`} sub={<span className="text-white/70">Average of shown</span>} />
        <KPI label={<span>💰 Total volume</span>} value={humanVol(totalVol)} sub={<span className="text-white/70">Combined volume</span>} />
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-5 mt-6 rounded-2xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => { setPriceMin(1); setPriceMax(5); setMinGap(5); setNewsOnly(false); setMinRelVol(1.3); setMinPerf10m(10); setMaxFloatM(20); }}
          >
            🔄 Reset Filters
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newsOnly} onChange={(e) => setNewsOnly(e.target.checked)} />
            📢 News Catalyst Only
          </label>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
          <RangeSlider label={`Price Range: $${priceMin} - $${priceMax}`} min={0.5} max={50} step={0.5} value={[priceMin, priceMax]} onChange={(a, b) => { setPriceMin(a); setPriceMax(b); }} />

          <SingleSlider label={`Gap Percentage: ${minGap}%+`} min={0} max={100} step={1} value={minGap} onChange={setMinGap} />

          <SingleSlider
            label={`Volume Multiplier: ${minRelVol.toFixed(1)}x+${hasRelVol ? "" : " (data missing)"}`}
            min={1} max={20} step={0.1} value={minRelVol} onChange={setMinRelVol}
            disabled={!hasRelVol}
          />

          <SingleSlider
            label={`Performance: ${minPerf10m}%+${hasPerf10m ? "" : " (data missing)"}`}
            min={0} max={100} step={1} value={minPerf10m} onChange={setMinPerf10m}
            disabled={!hasPerf10m}
          />

          <SingleSlider
            label={`Float Max: ${maxFloatM}M${hasFloatM ? "" : " (data missing)"}`}
            min={1} max={500} step={1} value={maxFloatM} onChange={setMaxFloatM}
            disabled={!hasFloatM}
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
                  if (hasRelVol && (r.relVol ?? 0) >= 5) badges.push("📢 High Volume");
                  if (hasPerf10m && (r.perf10m ?? 0) >= 10) badges.push("⚡ Strong Momentum");
                  return (
                    <tr key={r.ticker} className="border-t border-white/10">
                      <Td className="font-mono">{r.ticker}</Td>
                      <Td>{r.price !== undefined ? `$${r.price.toFixed(2)}` : "—"}</Td>
                      <Td>{r.gapPct !== undefined ? `${r.gapPct.toFixed(1)}%` : "—"}</Td>
                      <Td>{r.score !== undefined ? r.score.toFixed(3) : "—"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {badges.map((b: string, i: number) => (
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
                  <Td colSpan={6} className="text-center text-white/60 py-6">
                    No matches yet. Current CSV columns detected:
                    {" "}
                    <code className="text-white/80">
                      {Object.keys(candidates[0] || {}).join(", ") || "—"}
                    </code>.
                    Add <code>RelVol</code>/<code>AvgVolume</code>, <code>Perf10m</code>, and <code>FloatM</code> to enable all filters.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts + News */}
      <div className="max-w-7xl mx-auto px-5 mt-6 mb-12 grid md:grid-cols-2 gap-6">
        {/* Real-Time Alerts */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">Real-Time Alerts</h3>
            <div className="flex items-center gap-2">
              <button onClick={markAllRead} className="text-xs rounded-lg border border-white/15 px-2 py-1 hover:bg-white/10">Mark All Read</button>
              <button onClick={clearAll} className="text-xs rounded-lg border border-white/15 px-2 py-1 hover:bg-white/10">Clear All</button>
            </div>
          </div>
          <div className="text-sm text-white/70 mb-3">{alerts.filter(a => !a.read).length} unread</div>
          <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
            {alerts.slice(0, 10).map((a) => (
              <div
                key={a.id}
                className={`rounded-xl border p-3 ${
                  a.level === "HIGH" ? "border-red-400/40 bg-red-400/10" :
                  a.level === "MEDIUM" ? "border-amber-300/40 bg-amber-300/10" :
                  "border-white/15 bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">🚀 {a.level} • <span className="font-mono">{a.at}</span></div>
                  <button className="text-xs underline" onClick={() => setAlerts((arr) => arr.map(x => x.id === a.id ? {...x, read: true} : x))}>Mark Read</button>
                </div>
                <div className="mt-1">
                  🚀 NEW GAPPER: <span className="font-mono">{a.ticker}</span>{" "}
                  gapping {a.gapPct !== undefined ? `${a.gapPct.toFixed(1)}%` : "—"}
                </div>
                <div className="text-sm text-white/80 mt-1">Price: {a.price !== undefined ? `$${a.price.toFixed(2)}` : "—"}</div>
              </div>
            ))}
            {alerts.length === 0 && <div className="text-sm text-white/60">No alerts yet</div>}
          </div>
        </div>

        {/* Market News (only for shown tickers, max 10) */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <h3 className="font-semibold text-lg mb-2">📰 Market News</h3>
          {(news?.items || []).filter((n) => n.ticker && shownTickers.has(n.ticker.toUpperCase())).slice(0, 10).length ? (
            <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
              {(news?.items || [])
                .filter((n) => n.ticker && shownTickers.has(n.ticker.toUpperCase()))
                .slice(0, 10)
                .map((n, i) => {
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
                        {n.url && <> • <a className="underline" href={n.url} target="_blank" rel="noreferrer">Read more →</a></>}
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

function KPI({ label, value, sub }: { label: React.ReactNode; value: string; sub: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-sm">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{sub}</div>
    </div>
  );
}
function Th({ children }: { children: any }) {
  return <th className="text-left px-3 py-2 text-xs font-semibold text-white/70">{children}</th>;
}
function Td({ children, className = "", colSpan }: { children: any; className?: string; colSpan?: number }) {
  return <td className={`px-3 py-2 ${className}`} colSpan={colSpan}>{children}</td>;
}
function SingleSlider({ label, min, max, step, value, onChange, disabled = false }: any) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="text-sm font-medium mb-1">{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" disabled={disabled} />
    </div>
  );
}
function RangeSlider({ label, min, max, step, value, onChange }: any) {
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
