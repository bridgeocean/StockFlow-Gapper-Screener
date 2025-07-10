import { NextResponse } from "next/server"

// Simple demo users - in production, this would be a database
const DEMO_USERS = [
  {
    email: "admin@thephdpush.com",
    password: "admin123", // In production, this would be hashed
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
    const { email, password } = await request.json()

    // Find user
    const user = DEMO_USERS.find((u) => u.email === email && u.password === password)

    if (!user) {
      return NextResponse.json({
        success: false,
        message: "Invalid email or password",
      })
    }

    // Create simple session token (in production, use JWT or proper session management)
    const token = Buffer.from(`${user.email}:${Date.now()}`).toString("base64")

    return NextResponse.json({
      success: true,
      token,
      user: {
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: "Server error",
    })
  }
}
