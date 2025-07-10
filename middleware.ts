import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Check if accessing protected dashboard route
  if (request.nextUrl.pathname.startsWith("/public-dashboard")) {
    // Check for session token in cookies
    const sessionToken = request.cookies.get("stockflow_session")?.value

    console.log("Middleware check:", {
      path: request.nextUrl.pathname,
      hasToken: !!sessionToken,
    })

    if (!sessionToken) {
      console.log("No session token, redirecting to login")
      // Redirect to login page
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Basic token validation (in production, decode and verify JWT)
    try {
      const decoded = Buffer.from(sessionToken, "base64").toString()
      if (!decoded.includes(":")) {
        throw new Error("Invalid token format")
      }
      console.log("Valid session token found")
    } catch (error) {
      console.log("Invalid token, redirecting to login")
      return NextResponse.redirect(new URL("/login", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/public-dashboard/:path*"],
}
