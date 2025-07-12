import { NextResponse } from "next/server"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb"

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
    const { email, action } = await request.json()

    if (!email || !action) {
      return NextResponse.json({
        success: false,
        message: "Email and action are required",
      })
    }

    const newStatus = action === "approve" ? "approved" : "rejected"

    // Update user status
    const command = new UpdateCommand({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Key: {
        email: email,
      },
      UpdateExpression: "SET #status = :status, approvedAt = :approvedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": newStatus,
        ":approvedAt": new Date().toISOString(),
      },
    })

    await docClient.send(command)

    // Console log for notification (hybrid approach)
    console.log(`🔔 USER ${action.toUpperCase()}ED:`)
    console.log(`Email: ${email}`)
    console.log(`Status: ${newStatus}`)
    console.log(`Time: ${new Date().toISOString()}`)

    return NextResponse.json({
      success: true,
      message: `User ${action}d successfully`,
    })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({
      success: false,
      message: "Server error",
    })
  }
}
