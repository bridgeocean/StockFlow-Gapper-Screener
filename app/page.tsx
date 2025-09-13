"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Simple demo login gate (NOT production secure)
const VALID_EMAIL = "bridgeocean@cyberservices.com";
const VALID_PASS = "admin123";

export default function Landing() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const ok = sessionStorage.getItem("sf_auth_ok") === "1";
    if (ok) return;
  }, []);

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
      <header className="max-w-6xl mx-auto px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
            <span className="text-xl">🚀</span>
          </div>
          <div>
            <div className="text-xl font-bold">StockFlow</div>
            <div className="text-xs text-white/70">by ThePhDPush</div>
          </div>
        </div>
        <button
          onClick={() => r.push("/public-dashboard")}
          className="rounded-xl bg-white text-black px-4 py-2 font-medium hover:opacity-90"
        >
          Launch Scanner
        </button>
      </header>

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
                onClick={() => r.push("/public-dashboard")}
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

            <div className="mt-8 rounded-xl border border-green-500/30 bg-green-500/10 text-green-200 px-4 py-3">
              <div className="font-semibold">Live Data</div>
              <div className="text-sm">
                Successfully connected to Live Feed API. Data is being updated in real-time from professional market sources.
              </div>
            </div>
          </div>

          <form
            onSubmit={onLogin}
            className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-6"
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
            <button
              type="submit"
              className="w-full rounded-xl bg-[#b197fc] text-black px-4 py-2 font-semibold hover:brightness-110"
            >
              Launch Gap Scanner
            </button>
            <div className="text-xs text-white/60 mt-3">
              © 2024 StockFlow by ThePhDPush. Professional gap scanning tools.
            </div>
          </form>
        </section>

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
      </main>

      <footer className="max-w-6xl mx-auto px-5 py-10 text-white/60">
        Ready to Find Your Next Gap Play? Join thousands of traders using our professional-grade gap scanner powered by Live Feed.
      </footer>
    </div>
  );
}
