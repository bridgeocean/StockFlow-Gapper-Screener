"use client";

export default function IconStockflow({
  className = "",
  size = 28,
}: { className?: string; size?: number }) {
  // A simple upward zigzag with an arrowhead. Sized via `size` prop.
  const s = size;
  const stroke = "currentColor";
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-label="StockFlow"
    >
      {/* Soft rounded square backdrop (optional subtle ring) */}
      <rect
        x="1"
        y="1"
        width="26"
        height="26"
        rx="8"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.2"
        fill="rgba(255,255,255,0.06)"
      />
      {/* Zigzag path */}
      <path
        d="M6 19 L11 14 L14 17 L19 12"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow head pointing up/right */}
      <path
        d="M19 12 L19 8 M19 12 L23 12"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
