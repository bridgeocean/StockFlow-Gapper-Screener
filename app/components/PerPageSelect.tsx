"use client";

export default function PerPageSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="text-sm flex items-center gap-2">
      Rows per page
      <select
        className="rounded-lg bg-black/40 border border-white/15 px-2 py-1"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      >
        <option value={10}>10</option>
        <option value={25}>25</option>
        <option value={50}>50</option>
      </select>
    </label>
  );
}
