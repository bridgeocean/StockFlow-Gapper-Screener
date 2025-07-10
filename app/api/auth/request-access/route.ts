import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { name, email, company, reason, experience } = await request.json()

    console.log("📧 Access request received:", { name, email, company })

    // Validate required fields
    if (!name || !email || !reason || !experience) {
      return NextResponse.json({
        success: false,
        message: "Please fill in all required fields",
      })
    }

    // Email content that would be sent
    const emailContent = `
🚨 NEW STOCKFLOW ACCESS REQUEST 🚨

Name: ${name}
Email: ${email}
Company: ${company || "Not provided"}
Experience: ${experience}
Reason: ${reason}

Submitted: ${new Date().toLocaleString()}

---
This request needs manual approval.
    `

    console.log("📧 EMAIL TO info@thephdpush.com:")
    console.log(emailContent)
    console.log("📧 EMAIL END")

    // Simulate email delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return NextResponse.json({
      success: true,
      message: "Access request submitted successfully",
      debug: {
        emailWouldBeSentTo: "info@thephdpush.com",
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("❌ Access request error:", error)
    return NextResponse.json({
      success: false,
      message: "Server error. Please try again.",
    })
  }
}
