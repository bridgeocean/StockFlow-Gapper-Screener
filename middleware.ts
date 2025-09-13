import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROTECTED = ["/dashboard", "/public-dashboard", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const session = req.cookies.get("sf_session")?.value;
  const isAuthed = session === "1";

  // Require login for protected pages
  if (isProtected && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already logged in? Skip /login
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
  // Only run middleware on the pages we actually want to protect
  matcher: ["/dashboard/:path*", "/public-dashboard/:path*", "/admin/:path*", "/login"],
};
