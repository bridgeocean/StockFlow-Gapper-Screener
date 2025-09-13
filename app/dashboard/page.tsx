// app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import IconStockflow from "../components/IconStockflow";
import { isLoggedInLocal, logoutLocal } from "../components/auth";

// If you render client-side only, avoid dynamic({ ssr:false }) here.
// Import your panels/components directly (they should also be client components).
import NewsPanel from "../components/NewsPanel";      // make sure this has "use client" at top
import ScoresTable from "../components/ScoresTable";  // make sure this has "use client" at top

export default function DashboardPage() {
  const r = useRouter();
  const [ready, setReady] = useState(false);
  const authed = useMemo(() => isLoggedInLocal(), []);

  useEffect(() => {
    // client-side only check; prevents server redirect loops
    if (!authed) {
      r.replace("/login");
    } else {
      setReady(true);
    }
  }, [authed, r]);

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1b0f3a] via-[#110726] to-black text-white">
      <header className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow size={28} className="text-green-400" />
          <div className="font-semibold">StockFlow</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
            onClick={() => location.reload()}
          >
            Refresh
          </button>
          <button
            className="rounded-xl bg-red-500 text-black px-3 py-1.5 font-semibold hover:brightness-110"
            onClick={() => {
              logoutLocal();
              r.replace("/login");
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Your top summary row etc. */}
      <section className="max-w-7xl mx-auto px-5 mt-4 grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <ScoresTable />
        </div>
        <aside className="lg:col-span-1">
          <NewsPanel />
        </aside>
      </section>
    </main>
  );
}
