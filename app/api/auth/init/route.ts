import { NextResponse } from "next/server"

// Simple GET handler for browser testing
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Init endpoint is working! Send POST to create admin user.",
    timestamp: new Date().toISOString(),
  })
}

// POST handler to create admin user
export async function POST() {
  try {
    console.log("🚀 Creating default admin user...")

    // For now, just return success - we'll add real DB logic after we confirm the endpoint works
    return NextResponse.json({
      success: true,
      message: "Admin user creation endpoint is working!",
      note: "Database integration will be added next",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("❌ Init error:", error)
    return NextResponse.json({
      success: false,
      message: "Failed to initialize admin user",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
