import { NextResponse } from "next/server";

// Server-only check
const DEV_EMAIL = "bridgeocean@cyberservices.com";
const DEV_PASSWORD = "admin123";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "").trim();

    if (email === DEV_EMAIL && password === DEV_PASSWORD) {
      const res = NextResponse.json({ success: true });

      const SECURE =
        process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

      res.cookies.set({
        name: "sf_session",
        value: "1",
        httpOnly: true,
        secure: SECURE,        // secure on Vercel/HTTPS, not on localhost
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return res;
    }

    return NextResponse.json(
      { success: false, message: "Invalid email or password" },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
