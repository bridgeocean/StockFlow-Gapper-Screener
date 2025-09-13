import { NextResponse } from "next/server";

// Keep secrets on the server only
const DEV_EMAIL = "bridgeocean@cyberservices.com";
const DEV_PASSWORD = "admin123";

// Ensure Node runtime & dynamic response
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const emailRaw = String(body?.email ?? "");
    const passRaw = String(body?.password ?? "");

    // Normalize inputs (fix trailing spaces, case, autofill quirks)
    const email = emailRaw.trim().toLowerCase();
    const password = passRaw.trim();

    if (email === DEV_EMAIL && password === DEV_PASSWORD) {
      const res = NextResponse.json({ success: true });

      // Set a simple session cookie (server-side auth)
      res.cookies.set({
        name: "sf_session",
        value: "1",
        httpOnly: true,
        secure: true,
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
