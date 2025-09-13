// app/page.tsx
"use client";

import { useRouter } from "next/navigation";
import IconStockflow from "./components/IconStockflow";

export default function HomePage() {
  const r = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#2a1459] via-[#180a36] to-black text-white">
      {/* Top nav */}
      <header className="max-w-7xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow size={36} className="text-green-400" />
          <h1 className="text-xl font-bold tracking-wide">StockFlow</h1>
        </div>
        <nav className="flex items-center gap-2">
          <button
            className="rounded-xl bg-green-500 text-black px-4 py-2 font-semibold hover:brightness-110"
            onClick={() => r.push("/login")}
          >
            Launch Scanner
          </button>
        </nav>
      </header>

      {/* Hero — centered, “Before They Move” highlighted */}
      <section className="max-w-5xl mx-auto px-5 text-center mt-10 md:mt-16">
        {/* Removed “Professional Gap Scanner” line as requested */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-sm text-white/80">
          StockFlow by ThePhDPush
        </div>

        <h2 className="mt-5 text-4xl md:text-5xl font-extrabold leading-tight">
          Find Gap Opportunities{" "}
          <span className="text-violet-300">Before They Move</span>
        </h2>

        <p className="mt-4 text-base md:text-lg text-white/80 max-w-3xl mx-auto">
          Advanced stock scanner powered by real-time data to identify gap-up
          opportunities with institutional-grade filtering and analysis tools.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => r.push("/login")}
            className="rounded-2xl bg-green-500 text-black px-6 py-3 font-semibold hover:brightness-110"
          >
            Start Scanning
          </button>
          <a
            href="#features"
            className="rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 px-6 py-3 font-semibold"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* Features — bigger blocks & icons */}
      <section id="features" className="max-w-6xl mx-auto px-5 mt-14 md:mt-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
            desc="Direct integration with pro data sources for real-time market screening."
          />
          <Feature
            icon="✨"
            title="Smart Indicators"
            desc="Visual tags for hot stocks, momentum plays, and news catalysts to prioritize your watchlist."
          />
          <Feature
            icon="📊"
            title="Volume Analysis"
            desc="Analyze relative volume patterns and ratios to confirm breakout potential."
          />
          <Feature
            icon="🛡️"
            title="Risk Management"
            desc="Built-in float analysis and risk cues to help with position sizing."
          />
        </div>
      </section>

      {/* CTA footer */}
      <section className="max-w-5xl mx-auto px-5 text-center mt-16 md:mt-20 mb-16">
        <h3 className="text-2xl md:text-3xl font-extrabold">
          Ready to Find Your Next Gap Play?
        </h3>
        <p className="mt-3 text-white/80">
          Join traders using our pro-grade gap scanner powered by live data.
        </p>
        <button
          onClick={() => r.push("/login")}
          className="mt-6 rounded-2xl bg-green-500 text-black px-6 py-3 font-semibold hover:brightness-110"
        >
          Launch Gap Scanner
        </button>
        <div className="mt-8 text-xs text-white/60">
          © 2024 StockFlow by ThePhDPush.
        </div>
      </section>
    </main>
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
    <div className="rounded-2xl p-5 md:p-6 bg-white/6 border border-white/10 hover:bg-white/10 transition">
      <div className="text-3xl md:text-4xl">{icon}</div>
      <div className="mt-3 text-lg md:text-xl font-semibold">{title}</div>
      <div className="mt-2 text-sm md:text-base text-white/80">{desc}</div>
    </div>
  );
}
