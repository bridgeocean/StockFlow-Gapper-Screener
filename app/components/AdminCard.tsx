"use client";

import { useEffect, useState } from "react";

type AdminStatus = {
  now?: string;
  newsGeneratedAt?: string | null;
  scoresGeneratedAt?: string | null;
};

function ts(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour12: false });
  } catch {
    return "—";
  }
}

export default function AdminCard() {
  const [s, setS] = useState<AdminStatus>({});

  async function load() {
    try {
      const res = await fetch("/api/admin/status", { cache: "no-store" });
      if (!res.ok) throw new Error("status fetch failed");
      setS(await res.json());
    } catch {
      setS({});
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const okNews = !!s.newsGeneratedAt;
  const okScores = !!s.scoresGeneratedAt;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-white">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold">Admin</h4>
        <button
          onClick={load}
          className="text-xs px-2 py-1 rounded border border-white/15 bg-white/5 hover:bg-white/10"
        >
          Refresh
        </button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span>News cache</span>
          <span className={`px-2 py-0.5 rounded text-xs ${okNews ? "bg-emerald-600/30 text-emerald-200" : "bg-red-600/30 text-red-200"}`}>
            {okNews ? `OK • ${ts(s.newsGeneratedAt)}` : "No data"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>AI scores</span>
          <span className={`px-2 py-0.5 rounded text-xs ${okScores ? "bg-emerald-600/30 text-emerald-200" : "bg-red-600/30 text-red-200"}`}>
            {okScores ? `OK • ${ts(s.scoresGeneratedAt)}` : "No data"}
          </span>
        </div>
      </div>
    </div>
  );
}
