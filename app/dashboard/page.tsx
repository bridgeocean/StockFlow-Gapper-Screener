"use client";

import { useState } from "react";
import ScoresTable from "../components/ScoresTable";
import NewsPanel from "../components/NewsPanel";

export default function DashboardPage() {
  const [visibleTickers, setVisibleTickers] = useState<string[]>([]);

  return (
    <div className="min-h-screen w-full relative text-white">
      {/* Page background (behind content, no opacity on content) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 600px at 20% -10%, rgba(82,46,145,0.35) 0%, rgba(18,9,33,0.2) 35%, rgba(10,9,20,0.0) 60%), linear-gradient(to bottom, #140f26 0%, #0e0b1a 40%, #0a0917 100%)",
        }}
      />
      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 pt-4 md:pt-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ScoresTable onTopTickersChange={setVisibleTickers} />
          </div>
          <div className="lg:col-span-1">
            <NewsPanel tickers={visibleTickers} />
          </div>
        </div>
      </div>
    </div>
  );
}
