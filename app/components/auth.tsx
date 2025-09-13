// app/components/auth.tsx
"use client";

export const AUTH_KEY = "sf_auth_v1";

// Preview creds (same as server)
const DEMO_EMAIL = "bridgeocean@cyberservices.com";
const DEMO_PASS = "admin123";

// Optional local fallback (kept for compatibility)
export function loginLocal(email: string, pass: string): boolean {
  if (email.trim().toLowerCase() === DEMO_EMAIL && pass === DEMO_PASS) {
    localStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function logoutLocal() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

export function isLoggedInLocal(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
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
