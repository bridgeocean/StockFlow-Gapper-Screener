"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import IconStockflow from "./components/IconStockflow";

const VALID_EMAIL = "bridgeocean@cyberservices.com";
const VALID_PASS = "admin123";

export default function Landing() {
  const r = useRouter();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() === VALID_EMAIL && pass === VALID_PASS) {
      sessionStorage.setItem("sf_auth_ok", "1");
      r.push("/public-dashboard");
    } else {
      setErr("Invalid credentials.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2a1459] via-[#180a36] to-black text-white">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-green-400">
            <IconStockflow size={36} className="text-green-400" />
          </div>
          <div>
            <div className="text-xl font-bold">StockFlow</div>
            <div className="text-xs text-white/70">by ThePhDPush</div>
          </div>
        </div>
        <button
          onClick={() => setShowLogin(true)}
          className="rounded-xl bg-white text-black px-4 py-2 font-medium hover:opacity-90"
        >
          Launch Scanner
        </button>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-5">
        <section className="grid md:grid-cols-2 gap-10 items-center mt-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Professional <span className="text-[#b197fc]">Gap Scanner</span>
              <br /> Find Gap Opportunities <br /> Before They Move
            </h1>
            <p className="mt-4 text-white/80">
              Advanced stock scanner powered by real-time Live Feed data to identify gap-up
              opportunities with institutional-grade filtering and analysis tools.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowLogin(true)}
                className="rounded-xl bg-[#b197fc] text-black px-5 py-2 font-semibold hover:brightness-110"
              >
                Start Scanning
              </button>
              <a
                href="#features"
                className="rounded-xl border border-white/20 px-5 py-2 font-semibold hover:bg-white/5"
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Visual */}
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-6 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-3 inline-block text-green-400">
                <IconStockflow size={64} className="text-green-400" />
              </div>
              <div className="text-white/80">Professional gap scanning tools</div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mt-16 grid md:grid-cols-3 gap-6">
          {[
            {
              t: "Real-Time Gap Detection",
              d: "Instantly identify stocks gapping up with customizable percentage thresholds and volume confirmation.",
            },
            {
              t: "Advanced Filtering",
              d: "Filter by price range, volume multipliers, float size, and performance metrics to find your ideal setups.",
            },
            {
              t: "Live Feed Integration",
              d: "Direct integration with Live Feed API for real-time market data and professional-grade screening.",
            },
            {
              t: "Smart Indicators",
              d: "Visual indicators for hot stocks, momentum plays, and news catalysts to prioritize your watchlist.",
            },
            {
              t: "Volume Analysis",
              d: "Analyze relative volume patterns and ratios to confirm breakout potential and institutional interest.",
            },
            {
              t: "Risk Management",
              d: "Built-in risk indicators and float analysis to help you manage position sizing and risk exposure.",
            },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="text-lg font-bold">{f.t}</div>
              <div className="text-sm text-white/80 mt-2">{f.d}</div>
            </div>
          ))}
        </section>

        <footer className="py-10 text-white/60">
          © 2024 StockFlow by ThePhDPush. Professional gap scanning tools.
        </footer>
      </main>

      {/* Login modal (only when Launch/Start is clicked) */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur flex items-center justify-center p-4 z-50">
          <form
            onSubmit={onLogin}
            className="w-full max-w-sm rounded-2xl bg-[#0b0616] border border-white/10 p-6"
          >
            <div className="text-lg font-bold mb-1">Member Login</div>
            <div className="text-sm text-white/70 mb-4">Sign in to launch the scanner</div>
            {err && <div className="mb-3 text-sm text-red-300">{err}</div>}
            <label className="block text-sm mb-1">Email</label>
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 mb-3 outline-none"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <label className="block text-sm mb-1">Password</label>
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 mb-4 outline-none"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#b197fc] text-black px-4 py-2 font-semibold hover:brightness-110"
              >
                Launch Gap Scanner
              </button>
              <button
                type="button"
                onClick={() => setShowLogin(false)}
                className="rounded-xl border border-white/20 px-4 py-2 font-semibold hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
