"use client";

import { useState } from "react";
import ScoresTable from "../components/ScoresTable";
import NewsPanel from "../components/NewsPanel";

export default function DashboardPage() {
  const [visibleTickers, setVisibleTickers] = useState<string[]>([]);

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4">
      {/* Main grid: table + news */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: scanner/table */}
        <div className="lg:col-span-2">
          <ScoresTable onTopTickersChange={setVisibleTickers} />
        </div>

        {/* Right: market news that matches the current page's 10 tickers */}
        <div className="lg:col-span-1">
          <NewsPanel tickers={visibleTickers} />
        </div>
      </div>
    </div>
  );
}
