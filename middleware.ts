import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { authOperations } from "@/lib/auth"

export function middleware(request: NextRequest) {
  // Check if accessing protected dashboard route
  if (request.nextUrl.pathname.startsWith("/public-dashboard")) {
    const sessionToken = request.cookies.get("stockflow_session")?.value

    console.log("🔒 Middleware check:", {
      path: request.nextUrl.pathname,
      hasToken: !!sessionToken,
    })

    if (!sessionToken) {
      console.log("❌ No session token, redirecting to login")
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Verify JWT token
    const user = authOperations.verifyToken(sessionToken)
    if (!user) {
      console.log("❌ Invalid token, redirecting to login")
      const response = NextResponse.redirect(new URL("/login", request.url))
      response.cookies.delete("stockflow_session")
      return response
    }

    console.log("✅ Valid session for:", user.email)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/public-dashboard/:path*"],
}
