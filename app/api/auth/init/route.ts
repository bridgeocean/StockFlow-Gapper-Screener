/* Optional GET handler so hitting the URL in a browser works */
import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Init endpoint is alive — send a POST request to create the default admin user.",
  })
}

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
