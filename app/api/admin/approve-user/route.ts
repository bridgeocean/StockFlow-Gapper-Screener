import { NextResponse } from "next/server"

/* ------------------------------------------------------------------
   1.  SHARED IN-MEMORY STORAGE FOR PREVIEW
   ------------------------------------------------------------------ */
const getPreviewStorage = () => {
  if (typeof globalThis !== "undefined") {
    if (!globalThis._previewStorage) {
      globalThis._previewStorage = {
        pendingUsers: [],
        initialized: true,
      }
    }
    return globalThis._previewStorage
  }
  return { pendingUsers: [], initialized: false }
}

/* ------------------------------------------------------------------
   2.  ENV CHECK
   ------------------------------------------------------------------ */
const IS_PRODUCTION = process.env.VERCEL_ENV === "production"

/* ------------------------------------------------------------------
   3.  POST  /api/admin/approve-user
   ------------------------------------------------------------------ */
export async function POST(request: Request) {
  try {
    const { email, action } = await request.json()

    if (!email || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, message: "Invalid request" })
    }

    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       3A.  PREVIEW / DEV  –  **NO AWS SDK**
    –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––– */
    if (!IS_PRODUCTION) {
      const storage = getPreviewStorage()

      // Find and remove the user from pending list
      const userIndex = storage.pendingUsers.findIndex((user: any) => user.email === email)

      if (userIndex === -1) {
        return NextResponse.json({ success: false, message: "User not found" })
      }

      const user = storage.pendingUsers[userIndex]
      storage.pendingUsers.splice(userIndex, 1)

      console.log(`🔄 [Preview] User ${email} ${action}d`)
      console.log(`📊 [Preview] Remaining pending users:`, storage.pendingUsers.length)

      return NextResponse.json({
        success: true,
        message: `User ${action}d successfully (preview mode)`,
        debug: {
          action,
          email,
          remainingPending: storage.pendingUsers.length,
        },
      })
    }

    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       3B.  PRODUCTION  –  **DYNAMIC AWS IMPORT**
    –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––– */
    const [{ DynamoDBClient }, { DynamoDBDocumentClient, UpdateCommand, DeleteCommand }] = await Promise.all([
      import("@aws-sdk/client-dynamodb"),
      import("@aws-sdk/lib-dynamodb"),
    ])

    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
    const docClient = DynamoDBDocumentClient.from(client)

    if (action === "approve") {
      // Update user status to approved
      await docClient.send(
        new UpdateCommand({
          TableName: process.env.DYNAMODB_USERS_TABLE,
          Key: { email },
          UpdateExpression: "SET #status = :status, approvedAt = :approvedAt",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":status": "approved",
            ":approvedAt": new Date().toISOString(),
          },
        }),
      )
    } else {
      // Delete rejected user
      await docClient.send(
        new DeleteCommand({
          TableName: process.env.DYNAMODB_USERS_TABLE,
          Key: { email },
        }),
      )
    }

    console.log(`✅ User ${email} ${action}d successfully`)
    return NextResponse.json({ success: true, message: `User ${action}d successfully` })
  } catch (error) {
    console.error(`Error ${action}ing user:`, error)
    return NextResponse.json({ success: false, message: "Server error" })
  }
}

/* ------------------------------------------------------------------
   4.  FORCE STATIC IN PREVIEW (no AWS)
   ------------------------------------------------------------------ */
export const dynamic = "force-static"
