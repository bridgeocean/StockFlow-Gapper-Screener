import { NextResponse } from "next/server"

/* ------------------------------------------------------------------
   1.  ENV
   ------------------------------------------------------------------ */
const IS_PRODUCTION = process.env.VERCEL_ENV === "production"

/* ------------------------------------------------------------------
   2.  GET  /api/admin/pending-users
   ------------------------------------------------------------------ */
export async function GET(request: Request) {
  try {
    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       2A.  SIMPLE AUTH CHECK
    –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––– */
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       2B.  PREVIEW / DEV  –  **NO AWS SDK**
    –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––– */
    if (!IS_PRODUCTION) {
      const store = (globalThis as any)._previewPending ?? []
      return NextResponse.json({ success: true, data: store, count: store.length })
    }

    /* ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
       2C.  PRODUCTION  –  **DYNAMIC AWS IMPORT**
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
   3.  FORCE STATIC IN PREVIEW (no AWS)
   ------------------------------------------------------------------ */
export const dynamic = "force-dynamic"
