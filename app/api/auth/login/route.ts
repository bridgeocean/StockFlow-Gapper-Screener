import { NextResponse } from "next/server"
import { authOperations } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    console.log("🔐 Login attempt for:", email)

    if (!email || !password) {
      return NextResponse.json({
        success: false,
        message: "Email and password are required",
      })
    }

    // Authenticate user against DynamoDB
    const user = await authOperations.authenticateUser(email, password)

    if (!user) {
      console.log("❌ Authentication failed for:", email)
      return NextResponse.json({
        success: false,
        message: "Invalid email or password",
      })
    }

    console.log("✅ Authentication successful for:", email)

    // Generate JWT token
    const token = authOperations.generateToken(user)

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      token,
      user,
    })

    // Set secure cookie
    response.cookies.set("stockflow_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return response
  } catch (error) {
    console.error("❌ Login error:", error)
    return NextResponse.json({
      success: false,
      message: "Server error occurred",
    })
  }
}
