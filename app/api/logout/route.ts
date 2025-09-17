// app/api/logout/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Clear a couple of common cookie names safely (ignore if not present)
  res.cookies.set("sf_session", "", { maxAge: 0, path: "/" });
  res.cookies.set("session", "", { maxAge: 0, path: "/" });
  return res;
}
