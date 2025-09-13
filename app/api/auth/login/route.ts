import { NextResponse } from "next/server";

const DEV_EMAIL = "bridgeocean@cyberservices.com";
const DEV_PASSWORD = "admin123";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (
      String(email || "").trim().toLowerCase() === DEV_EMAIL &&
      String(password || "") === DEV_PASSWORD
    ) {
      const res = NextResponse.json({ success: true });
      // Set a simple session cookie
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
  } catch (e) {
    console.error("Login error:", e);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
