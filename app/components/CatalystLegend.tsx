"use client";

import React from "react";

export default function CatalystLegend() {
  const tip =
    "💊 FDA / Clinical · 💸 Offering · 🤝 M&A / Partnership · 🧠 Analyst · 🧾 Contract · ⚖️ Legal · 📈 Earnings";

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-white/70"
      title={tip}
      aria-label={tip}
    >
      <span className="font-medium text-white/80">Legend</span>
      <span className="select-none">•</span>
      <span className="leading-none">💊</span>
      <span className="leading-none">💸</span>
      <span className="leading-none">🤝</span>
      <span className="leading-none">🧠</span>
      <span className="leading-none">🧾</span>
      <span className="leading-none">⚖️</span>
      <span className="leading-none">📈</span>
    </div>
  );
}
