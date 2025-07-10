import { NextResponse } from "next/server"
import { accessRequestOperations } from "@/lib/dynamodb"

export async function POST(request: Request) {
  try {
    const { name, email, company, reason, experience } = await request.json()

    console.log("📝 New access request:", { name, email, company })

    // Validate required fields
    if (!name || !email || !reason || !experience) {
      return NextResponse.json({
        success: false,
        message: "Please fill in all required fields",
      })
    }

    // Save to DynamoDB
    const requestId = await accessRequestOperations.createAccessRequest({
      name,
      email: email.toLowerCase(),
      company,
      reason,
      experience,
    })

    console.log("✅ Access request saved with ID:", requestId)

    // Email content that would be sent
    const emailContent = `
🚨 NEW STOCKFLOW ACCESS REQUEST 🚨

Request ID: ${requestId}
Name: ${name}
Email: ${email}
Company: ${company || "Not provided"}
Experience: ${experience}
Reason: ${reason}

Submitted: ${new Date().toLocaleString()}

Review at: [Your Admin Panel URL]
    `

    console.log("📧 EMAIL TO info@thephdpush.com:")
    console.log(emailContent)
    console.log("📧 EMAIL END")

    // Simulate email delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return NextResponse.json({
      success: true,
      message: "Access request submitted successfully",
      requestId,
    })
  } catch (error) {
    console.error("❌ Access request error:", error)
    return NextResponse.json({
      success: false,
      message: "Server error. Please try again.",
    })
  }
}
