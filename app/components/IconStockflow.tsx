"use client";

export default function IconStockflow({
  className = "",
  size = 28,
}: { className?: string; size?: number }) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-label="StockFlow"
    >
      <rect
        x="1" y="1" width="26" height="26" rx="8"
        stroke="rgba(255,255,255,0.14)" strokeWidth="1.2"
        fill="rgba(255,255,255,0.06)"
      />
      <path
        d="M6 18 L11 13 L14.5 16.5 L20 11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* up-right arrow head */}
      <path
        d="M20 11 L23 11 M20 11 L20 8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
