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
   3.  GET  /api/admin/pending-users
   ------------------------------------------------------------------ */
export async function GET(request: Request) {
  try {
    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       3A.  SIMPLE AUTH CHECK
    –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––– */
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       3B.  PREVIEW / DEV  –  **NO AWS SDK**
    –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––– */
    if (!IS_PRODUCTION) {
      const storage = getPreviewStorage()

      console.log("🔍 [Preview] Fetching from storage...")
      console.log("📊 [Preview] Storage contents:", storage.pendingUsers)
      console.log("📈 [Preview] Total pending users:", storage.pendingUsers.length)

      return NextResponse.json({
        success: true,
        data: storage.pendingUsers,
        count: storage.pendingUsers.length,
        debug: {
          storageInitialized: storage.initialized,
          timestamp: new Date().toISOString(),
        },
      })
    }

    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       3C.  PRODUCTION  –  **DYNAMIC AWS IMPORT**
    –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––– */
    const [{ DynamoDBClient }, { DynamoDBDocumentClient, ScanCommand }] = await Promise.all([
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

    const cmd = new ScanCommand({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "pending" },
    })

    const { Items: pending = [] } = await docClient.send(cmd)
    return NextResponse.json({ success: true, data: pending, count: pending.length })
  } catch (error) {
    console.error("Error fetching pending users:", error)
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 })
  }
}

/* ------------------------------------------------------------------
   4.  FORCE STATIC IN PREVIEW (no AWS)
   ------------------------------------------------------------------ */
export const dynamic = IS_PRODUCTION ? "auto" : "force-static"
