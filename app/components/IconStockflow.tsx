// app/components/IconStockflow.tsx
import * as React from "react";

export default function IconStockflow({
  size = 28,
  className = "",
}: { size?: number; className?: string }) {
  // Upward zigzag with an upward arrowhead
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="StockFlow"
    >
      {/* Glow/soft background */}
      <path
        d="M4 16 L9 11 L12 14 L18 8"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Main zigzag up */}
      <path
        d="M4 16 L9 11 L12 14 L18 8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Upward arrow head */}
      <path
        d="M18 8 L18 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M18 8 L14.8 9.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 8 L19.6 11.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
