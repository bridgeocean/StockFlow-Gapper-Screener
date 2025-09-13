// app/components/Brand.tsx
// Reusable StockFlow brand with an UPWARD zig-zag price-action arrow.

export default function Brand({
  size = 28,
  showText = true,
}: {
  size?: number;
  showText?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Upward zig-zag line */}
        <polyline
          points="2,18 7,13 11,15 16,10 19,12"
          fill="none"
          stroke="rgb(74, 222, 128)" /* tailwind's green-400 */
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Arrow head pointing UP/RIGHT */}
        <polyline
          points="17,7 22,7 22,12"
          fill="none"
          stroke="rgb(74, 222, 128)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && <span className="text-2xl font-bold">StockFlow</span>}
    </div>
  );
}
