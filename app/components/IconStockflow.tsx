// app/components/IconStockflow.tsx
// Small, reusable UPWARD zig-zag icon (for headers, badges, etc.)

export default function IconStockflow({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* Soft glow/back-stroke */}
      <path
        d="M4 16 L9 11 L12 14 L18 8"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Main zigzag UP */}
      <path
        d="M4 16 L9 11 L12 14 L18 8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Arrow head pointing UP */}
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
