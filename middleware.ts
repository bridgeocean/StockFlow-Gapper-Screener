import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROTECTED = ["/dashboard", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthed = req.cookies.get("sf_session")?.value === "1";

  if (isProtected && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + (req.nextUrl.search ? req.nextUrl.search : ""));
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && isAuthed) {
    const next = req.nextUrl.searchParams.get("next") || "/dashboard";
    const url = req.nextUrl.clone();
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/"], // include "/" so root redirect is covered
};
