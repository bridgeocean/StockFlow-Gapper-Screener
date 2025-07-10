import { NextResponse } from "next/server"
import { authOperations } from "@/lib/auth"

export async function POST() {
  try {
    console.log("🚀 Initializing default admin user...")
    await authOperations.createDefaultAdmin()

    return NextResponse.json({
      success: true,
      message: "Default admin user initialized",
    })
  } catch (error) {
    console.error("❌ Init error:", error)
    return NextResponse.json({
      success: false,
      message: "Failed to initialize admin user",
    })
  }
}
