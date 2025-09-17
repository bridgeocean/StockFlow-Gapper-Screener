"use client";

import Link from "next/link";

export default function SiteHeader() {
  async function handleLogout() {
    try {
      // Try server-side cleanup (cookie)
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    // Clear common localStorage keys used in older code
    try {
      localStorage.removeItem("sf_session");
      localStorage.removeItem("session");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch {}
    // Go to login screen
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/40">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3 text-white">
        {/* Brand goes to /dashboard */}
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span>StockFlow</span>
        </Link>

        <nav className="ml-4 hidden md:flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="opacity-90 hover:opacity-100">Dashboard</Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm"
            title="Refresh"
          >
            Refresh
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm"
            title="Logout"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
