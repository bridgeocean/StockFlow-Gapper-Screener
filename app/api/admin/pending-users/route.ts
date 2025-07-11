import { NextResponse } from "next/server"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb"

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const docClient = DynamoDBDocumentClient.from(client)

export async function GET(request: Request) {
  try {
    // Simple auth check - in production, verify admin token
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    // Get all pending users
    const command = new ScanCommand({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": "pending",
      },
    })

    const response = await docClient.send(command)
    const pendingUsers = response.Items || []

    return NextResponse.json({
      success: true,
      data: pendingUsers,
      count: pendingUsers.length,
    })
  } catch (error) {
    console.error("Error fetching pending users:", error)
    return NextResponse.json({
      success: false,
      message: "Server error",
    })
  }
}
