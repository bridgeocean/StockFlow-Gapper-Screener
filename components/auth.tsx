// app/components/auth.tsx
"use client";

export const AUTH_KEY = "sf_auth_v1";

// Hard-coded demo creds (you asked not to show on UI)
const DEMO_EMAIL = "bridgeocean@cyberservices.com";
const DEMO_PASS = "admin123";

export function loginLocal(email: string, pass: string): boolean {
  if (email.trim().toLowerCase() === DEMO_EMAIL && pass === DEMO_PASS) {
    localStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function logoutLocal() {
  localStorage.removeItem(AUTH_KEY);
}

export function isLoggedInLocal(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * One-time migration helper for users who still have the old key
 * ("stockflow_session") from the previous build. Safe to call on mount.
 */
export function migrateOldAuthKey() {
  try {
    if (typeof window === "undefined") return;
    const legacy = localStorage.getItem("stockflow_session");
    if (legacy && !localStorage.getItem(AUTH_KEY)) {
      localStorage.setItem(AUTH_KEY, "1");
    }
  } catch {}
}
