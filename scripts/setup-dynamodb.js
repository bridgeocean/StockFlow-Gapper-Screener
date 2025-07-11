// Setup script to create DynamoDB table and add admin user
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb"

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const docClient = DynamoDBDocumentClient.from(client)

async function setupDynamoDB() {
  const tableName = process.env.DYNAMODB_USERS_TABLE || "stockflow_users"

  try {
    console.log("🚀 Setting up DynamoDB table:", tableName)

    // Check if table exists
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }))
      console.log("✅ Table already exists")
    } catch (error) {
      if (error.name === "ResourceNotFoundException") {
        console.log("📋 Creating new table...")

        // Create table
        const createCommand = new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            {
              AttributeName: "email",
              KeyType: "HASH", // Primary key
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: "email",
              AttributeType: "S",
            },
          ],
          BillingMode: "PAY_PER_REQUEST", // On-demand pricing
        })

        await client.send(createCommand)
        console.log("✅ Table created successfully")

        // Wait for table to be active
        console.log("⏳ Waiting for table to be active...")
        await new Promise((resolve) => setTimeout(resolve, 10000))
      } else {
        throw error
      }
    }

    // Add admin user
    console.log("👤 Adding admin user...")
    const adminCommand = new PutCommand({
      TableName: tableName,
      Item: {
        email: "bridgeocean@cyberservices.com",
        password: "admin123",
        name: "Admin User",
        company: "StockFlow Initiative",
        role: "admin",
        status: "approved",
        requestReason: "System Administrator",
        experience: "System Admin",
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(email)", // Only add if doesn't exist
    })

    try {
      await docClient.send(adminCommand)
      console.log("✅ Admin user added successfully")
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        console.log("ℹ️ Admin user already exists")
      } else {
        throw error
      }
    }

    console.log("🎉 DynamoDB setup complete!")
    console.log("📧 Admin login: bridgeocean@cyberservices.com")
    console.log("🔑 Admin password: admin123")
    console.log("🔗 Admin panel: /admin")
  } catch (error) {
    console.error("❌ Setup failed:", error)
    process.exit(1)
  }
}

// Run setup
setupDynamoDB()
