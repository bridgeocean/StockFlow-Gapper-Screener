// app/page.tsx
"use client";

import Link from "next/link";
import Brand from "./components/Brand";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-black to-purple-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center p-6">
        {/* Brand: upward zig-zag arrow + text */}
        <Brand />

        <nav className="space-x-6">
          <Link href="/public-dashboard" className="hover:text-purple-300">
            Launch Scanner
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex flex-col items-center justify-center text-center flex-1 px-4">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
          Find Gap Opportunities <br />
          <span className="text-purple-300">Before They Move</span>
        </h1>

        {/* REMOVED the “Professional Gap Scanner” line per request */}

        <p className="text-lg max-w-2xl mb-8">
          Advanced stock scanner powered by real-time Live Feed data to identify
          gap-up opportunities with institutional-grade filtering and analysis tools.
        </p>

        <div className="flex space-x-4">
          <Link
            href="/public-dashboard"
            className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700"
          >
            Start Scanning
          </Link>
          <a
            href="#features"
            className="px-6 py-3 rounded-lg border border-purple-400 hover:bg-purple-800"
          >
            Learn More
          </a>
        </div>
      </main>

      {/* Features */}
      <section
        id="features"
        className="py-16 px-6 grid md:grid-cols-3 gap-10 max-w-6xl mx-auto"
      >
        <Feature
          icon="📈"
          title="Real-Time Gap Detection"
          desc="Instantly identify stocks gapping up with customizable percentage thresholds and volume confirmation."
        />
        <Feature
          icon="🎛️"
          title="Advanced Filtering"
          desc="Filter by price range, volume multipliers, float size, and performance metrics to find your ideal setups."
        />
        <Feature
          icon="🔌"
          title="Live Feed Integration"
          desc="Direct integration with Live Feed API for real-time market data and professional-grade screening."
        />
        <Feature
          icon="✨"
          title="Smart Indicators"
          desc="Visual indicators for hot stocks, momentum plays, and news catalysts to prioritize your watchlist."
        />
        <Feature
          icon="📊"
          title="Volume Analysis"
          desc="Analyze relative volume patterns and ratios to confirm breakout potential and institutional interest."
        />
        <Feature
          icon="🛡️"
          title="Risk Management"
          desc="Built-in risk indicators and float analysis to help you manage position sizing and risk exposure."
        />
      </section>

      <footer className="text-center text-sm text-gray-400 py-4">
        © {new Date().getFullYear()} StockFlow by ThePhDPush
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="text-center space-y-3">
      <div className="text-4xl">{icon}</div> {/* slightly larger per request */}
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="text-gray-300">{desc}</p>
    </div>
  );
}
