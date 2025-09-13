// app/dashboard/page.tsx
"use client";

import { useState } from "react";
import IconStockflow from "../components/IconStockflow";
import ScoresTable from "../components/ScoresTable";
import NewsPanel from "../components/NewsPanel";
import { useRouter } from "next/navigation";
import { AUTH_KEY } from "../components/auth";

export default function DashboardPage() {
  const r = useRouter();
  const [topTickers, setTopTickers] = useState<string[]>([]);

  async function doLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    try { localStorage.removeItem(AUTH_KEY); } catch {}
    r.replace("/login");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1b0f3a] via-[#110726] to-black text-white">
      <header className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow className="text-green-400" />
          <div className="font-semibold">StockFlow</div>
          <span className="ml-3 px-2 py-0.5 rounded bg-green-900/40 text-green-300 text-xs">LIVE</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm hover:underline">Home</a>
          <button onClick={() => location.reload()} className="text-sm px-3 py-1 rounded bg-green-600 text-black hover:brightness-110">Refresh</button>
          <button onClick={doLogout} className="text-sm px-3 py-1 rounded bg-red-600 text-white hover:brightness-110">Logout</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2">
          <ScoresTable onTopTickersChange={setTopTickers} />
        </section>
        <aside>
          <NewsPanel tickers={topTickers} />
        </aside>
      </div>
    </main>
  );
}
