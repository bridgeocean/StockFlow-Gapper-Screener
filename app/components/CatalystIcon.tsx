"use client";

import React from "react";

/**
 * Compact catalyst icons.
 * Codes:
 *  FDA = FDA / Clinical
 *  ERN = Earnings / Guidance
 *  OFF = Offering / Priced
 *  MA  = M&A / Buyout
 *  PRT = Partnership / Collaboration
 *  ANL = Analyst / PT / Rating
 *  CNT = Contract / Award / PO
 *  LEG = Legal / SEC / Lawsuit
 */
const MAP: Record<string, { icon: string; label: string }> = {
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
  const key = tag.toUpperCase();
  const info = MAP[key] ?? { icon: "📰", label: tag };
  return (
    <span title={info.label} aria-label={info.label} className="align-middle text-base leading-none">
      {info.icon}
    </span>
  );
}
