// app/login/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IconStockflow from "../components/IconStockflow";
import { migrateOldAuthKey, AUTH_KEY } from "../components/auth";

export default function LoginPage() {
  const r = useRouter();

  // Read ?next=/some/path without useSearchParams (avoids Suspense requirement)
  const nextRef = useRef<string | null>(null);

  useEffect(() => {
    migrateOldAuthKey();
    if (typeof window !== "undefined") {
      nextRef.current = new URLSearchParams(window.location.search).get("next");
    }
  }, []);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setErr(data?.message || "Invalid credentials");
        setBusy(false);
        return;
      }

      // Optional client flag for any client-only checks
      try { localStorage.setItem(AUTH_KEY, "1"); } catch {}

      r.replace(nextRef.current || "/dashboard");
    } catch (e) {
      console.error(e);
      setErr("Network error, try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#2a1459] via-[#180a36] to-black text-white">
      <header className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconStockflow size={32} className="text-green-400" />
          <div className="font-semibold">StockFlow</div>
        </div>
      </header>

      <section className="max-w-md mx-auto mt-12 p-6 rounded-2xl bg-white/5 border border-white/10">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-white/70 text-sm mt-1">Members only.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 outline-none focus:border-violet-300"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="bridgeocean@cyberservices.com"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 outline-none focus:border-violet-300"
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="admin123"
            />
          </div>

          {err && <div className="text-red-400 text-sm">{err}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-green-500 text-black font-semibold py-2 hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
