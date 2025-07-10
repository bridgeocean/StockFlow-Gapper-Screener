import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { name, email, company, reason, experience } = await request.json()

    // Validate required fields
    if (!name || !email || !reason || !experience) {
      return NextResponse.json({
        success: false,
        message: "Please fill in all required fields",
      })
    }

    // In production, you would:
    // 1. Save to database
    // 2. Send email to info@thephdpush.com
    // 3. Send confirmation email to user

    // For now, we'll simulate the email sending
    const emailContent = `
New StockFlow Access Request:

Name: ${name}
Email: ${email}
Company: ${company || "Not provided"}
Experience: ${experience}
Reason: ${reason}

Submitted: ${new Date().toISOString()}
    `

    console.log("📧 Email would be sent to info@thephdpush.com:")
    console.log(emailContent)

    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    // await sendEmail({
    //   to: "info@thephdpush.com",
    //   subject: `StockFlow Access Request - ${name}`,
    //   text: emailContent
    // })

    return NextResponse.json({
      success: true,
      message: "Access request submitted successfully",
    })
  } catch (error) {
    console.error("Access request error:", error)
    return NextResponse.json({
      success: false,
      message: "Server error. Please try again.",
    })
  }
}
