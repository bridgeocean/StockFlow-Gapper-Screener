"use client";

import React from "react";

/**
 * Compact catalyst icons used in the table and news panel.
 * Tag codes you’ll see:
 *  FDA  = FDA / clinical
 *  ERN  = Earnings / guidance
 *  OFF  = Offering / priced
 *  MA   = M&A / buyout
 *  PRT  = Partnership / collaboration
 *  ANL  = Analyst / PT / rating
 *  CNT  = Contract / award / PO
 *  LEG  = Legal / SEC / lawsuit
 */
const MAP: Record<
  string,
  { icon: string; label: string; className?: string }
> = {
  FDA: { icon: "💊", label: "FDA / Clinical" },
  ERN: { icon: "📈", label: "Earnings / Guidance" },
  OFF: { icon: "💸", label: "Offering / Priced" },
  MA:  { icon: "🤝", label: "M&A / Buyout" },
  PRT: { icon: "🤝", label: "Partnership / Collaboration" },
  ANL: { icon: "🧠", label: "Analyst / Price Target" },
  CNT: { icon: "🧾", label: "Contract / Award / PO" },
  LEG: { icon: "⚖️", label: "Legal / SEC / Lawsuit" },
};

export default function CatalystIcon({ tag }: { tag?: string }) {
  if (!tag) return null;
  const t = tag.toUpperCase();
  const info = MAP[t] ?? { icon: "📰", label: tag };
  return (
    <span
      title={info.label}
      aria-label={info.label}
      className={`align-middle text-base leading-none ${info.className ?? ""}`}
    >
      {info.icon}
    </span>
  );
}
