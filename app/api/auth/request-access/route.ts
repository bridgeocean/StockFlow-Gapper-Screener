import { NextResponse } from "next/server"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb"

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const docClient = DynamoDBDocumentClient.from(client)

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

    // Auto-add user to DynamoDB as pending
    const command = new PutCommand({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Item: {
        email: email,
        name: name,
        company: company || "",
        password: "temp123", // Temporary password, admin can change
        role: "user",
        status: "pending",
        requestReason: reason,
        experience: experience,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(email)", // Prevent duplicates
    })

    await docClient.send(command)

    // Console log for admin notification (hybrid approach)
    console.log("🔔 NEW ACCESS REQUEST:")
    console.log(`Name: ${name}`)
    console.log(`Email: ${email}`)
    console.log(`Company: ${company || "Not provided"}`)
    console.log(`Experience: ${experience}`)
    console.log(`Reason: ${reason}`)
    console.log(`Submitted: ${new Date().toISOString()}`)
    console.log(`Admin should visit /admin to approve`)

    return NextResponse.json({
      success: true,
      message: "Access request submitted successfully",
    })
  } catch (error) {
    console.error("Access request error:", error)

    if (error.name === "ConditionalCheckFailedException") {
      return NextResponse.json({
        success: false,
        message: "An access request with this email already exists",
      })
    }

    return NextResponse.json({
      success: false,
      message: "Server error. Please try again.",
    })
  }
}
