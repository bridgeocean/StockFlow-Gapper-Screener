import { NextResponse } from "next/server"

// Simple dev credentials for preview
const DEV_EMAIL = "bridgeocean@cyberservices.com"
const DEV_PASSWORD = "admin123"

export async function POST(request: Request) {
  console.log("🔐 Login API called")

  try {
    const body = await request.json()
    const { email, password } = body

    console.log("📨 Login attempt for:", email)

    // For now, just use dev credentials in preview
    if (email === DEV_EMAIL && password === DEV_PASSWORD) {
      console.log("✅ Login successful")

      const token = Buffer.from(`${email}:${Date.now()}`).toString("base64")

      return NextResponse.json({
        success: true,
        token,
        user: {
          email,
          name: "Dev Admin",
          role: "admin",
        },
      })
    }

    console.log("❌ Invalid credentials")
    return NextResponse.json({
      success: false,
      message: "Invalid email or password",
    })
  } catch (error) {
    console.error("💥 Login error:", error)
    return NextResponse.json({
      success: false,
      message: "Server error",
    })
  }
}
