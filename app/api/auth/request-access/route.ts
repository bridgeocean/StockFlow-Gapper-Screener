import { NextResponse } from "next/server"

/* ------------------------------------------------------------------
   1.  SHARED IN-MEMORY STORAGE FOR PREVIEW
   ------------------------------------------------------------------ */
// Use a more persistent global storage approach
if (typeof globalThis !== "undefined" && !globalThis._previewStorage) {
  globalThis._previewStorage = {
    pendingUsers: [],
    initialized: true,
  }
}

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
   3.  POST  /api/auth/request-access
   ------------------------------------------------------------------ */
export async function POST(request: Request) {
  try {
    const { name, email, company = "", reason, experience } = await request.json()

    // Basic validation
    if (!name || !email || !reason || !experience) {
      return NextResponse.json({ success: false, message: "Please fill in all required fields" })
    }

    /* --------------------------------------------------------------
       3A.  PREVIEW / DEV  –  **NO AWS SDK**
    ---------------------------------------------------------------- */
    if (!IS_PRODUCTION) {
      const storage = getPreviewStorage()

      // Check for duplicates
      const existingUser = storage.pendingUsers.find((user: any) => user.email === email)
      if (existingUser) {
        return NextResponse.json({
          success: false,
          message: "An access request with this email already exists",
        })
      }

      // Add new user
      const newUser = {
        email,
        name,
        company,
        requestReason: reason,
        experience,
        status: "pending",
        createdAt: new Date().toISOString(),
      }

      storage.pendingUsers.push(newUser)

      console.log("🔔 [Preview] Access request stored:", email)
      console.log("📊 [Preview] Total pending users:", storage.pendingUsers.length)
      console.log("📋 [Preview] Storage contents:", storage.pendingUsers)

      return NextResponse.json({
        success: true,
        message: "Access request stored (preview mode)",
        debug: {
          totalPending: storage.pendingUsers.length,
          userAdded: email,
        },
      })
    }

    /* --------------------------------------------------------------
       3B.  PRODUCTION  –  **DYNAMIC AWS IMPORT**
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
   4.  FORCE STATIC IN PREVIEW (no AWS)
   ------------------------------------------------------------------ */
export const dynamic = IS_PRODUCTION ? "auto" : "force-static"
