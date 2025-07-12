import { NextResponse } from "next/server"

/* ------------------------------------------------------------------
   1.  ENV
   ------------------------------------------------------------------ */
const IS_PRODUCTION = process.env.VERCEL_ENV === "production"

/* ------------------------------------------------------------------
   2.  POST  /api/auth/request-access
   ------------------------------------------------------------------ */
export async function POST(request: Request) {
  try {
    const { name, email, company = "", reason, experience } = await request.json()

    // Basic validation
    if (!name || !email || !reason || !experience) {
      return NextResponse.json({ success: false, message: "Please fill in all required fields" })
    }

    /* --------------------------------------------------------------
       2A.  PREVIEW / DEV  –  **NO AWS SDK**
    ---------------------------------------------------------------- */
    if (!IS_PRODUCTION) {
      // Persist in-memory so the Admin panel still works in preview
      const store = (globalThis as any)._previewPending ?? []
      store.push({
        email,
        name,
        company,
        requestReason: reason,
        experience,
        status: "pending",
        createdAt: new Date().toISOString(),
      })
      ;(globalThis as any)._previewPending = store

      console.log("🔔 [Preview] Access request stored:", email)
      return NextResponse.json({ success: true, message: "Access request stored (preview mode)" })
    }

    /* --------------------------------------------------------------
       2B.  PRODUCTION  –  **DYNAMIC AWS IMPORT**
    ---------------------------------------------------------------- */
    // Dynamically load the AWS SDK modules (avoids fs.readFile polyfill errors in preview)
    const [{ DynamoDBClient }, { DynamoDBDocumentClient, PutCommand }] = await Promise.all([
      import("@aws-sdk/client-dynamodb"),
      import("@aws-sdk/lib-dynamodb"),
    ])

    // Initialise DynamoDB
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
    const docClient = DynamoDBDocumentClient.from(client)

    // Write the pending user
    await docClient.send(
      new PutCommand({
        TableName: process.env.DYNAMODB_USERS_TABLE,
        Item: {
          email,
          name,
          company,
          password: "temp123",
          role: "user",
          status: "pending",
          requestReason: reason,
          experience,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(email)",
      }),
    )

    console.log("🔔 NEW ACCESS REQUEST:", email)
    return NextResponse.json({ success: true, message: "Access request submitted successfully" })
  } catch (error: any) {
    console.error("Access request error:", error)

    if (error.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ success: false, message: "An access request with this email already exists" })
    }

    return NextResponse.json({ success: false, message: "Server error. Please try again." })
  }
}

/* ------------------------------------------------------------------
   3.  FORCE STATIC IN PREVIEW (no AWS)
   ------------------------------------------------------------------ */
export const dynamic = IS_PRODUCTION ? "auto" : "force-static"
