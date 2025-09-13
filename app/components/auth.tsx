// app/components/auth.tsx
"use client";

export const AUTH_KEY = "sf_auth_v1";

export function isLoggedInLocal(): boolean {
  try { return typeof window !== "undefined" && localStorage.getItem(AUTH_KEY) === "1"; }
  catch { return false; }
}

export function logoutLocal() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

export function migrateOldAuthKey() {
  try {
    if (typeof window === "undefined") return;
    const legacy = localStorage.getItem("stockflow_session");
    if (legacy && !localStorage.getItem(AUTH_KEY)) {
      localStorage.setItem(AUTH_KEY, "1");
    }
  } catch {}
}
