import { NextResponse } from "next/server"

// Simple demo users - in production, this would be a database
const DEMO_USERS = [
  {
    email: "admin@thephdpush.com",
    password: "admin123",
    role: "admin",
  },
  {
    email: "demo@example.com",
    password: "demo123",
    role: "user",
  },
]

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("Login attempt:", { email: body.email, hasPassword: !!body.password })

    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({
        success: false,
        message: "Email and password are required",
      })
    }

    // Find user
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
    console.log("User found:", !!user)

    if (!user) {
      return NextResponse.json({
        success: false,
        message: "Invalid email or password",
      })
    }

    // Create simple session token
    const token = Buffer.from(`${user.email}:${Date.now()}`).toString("base64")

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      token,
      user: {
        email: user.email,
        role: user.role,
      },
    })

    // Set cookie for session
    response.cookies.set("stockflow_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({
      success: false,
      message: "Server error",
    })
  }
}
