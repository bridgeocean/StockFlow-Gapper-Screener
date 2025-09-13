// app/components/auth.tsx
"use client";

// Only a local flag for any purely client checks.
// No credentials are kept on the client.
export const AUTH_KEY = "sf_auth_v1";

export function logoutLocal() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

export function isLoggedInLocal(): boolean {
  try { return typeof window !== "undefined" && localStorage.getItem(AUTH_KEY) === "1"; }
  catch { return false; }
}

// Old → new key migration (safe to call once on mount)
export function migrateOldAuthKey() {
  try {
    if (typeof window === "undefined") return;
    const legacy = localStorage.getItem("stockflow_session");
    if (legacy && !localStorage.getItem(AUTH_KEY)) {
      localStorage.setItem(AUTH_KEY, "1");
    }
  } catch {}
}
