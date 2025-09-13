import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const cookie = (req as any).cookies?.get?.("sf_session")?.value; // edge runtime shim
  // Fallback for node runtime
  const headers = new Headers((req as any).headers || {});
  const cookieHeader = headers.get("cookie") || "";
  const parsed = Object.fromEntries(
    cookieHeader.split(";").map(p => p.trim().split("=").map(decodeURIComponent)).filter(x => x[0])
  );
  const val = cookie ?? parsed["sf_session"];

  return NextResponse.json({ authed: val === "1" });
}
