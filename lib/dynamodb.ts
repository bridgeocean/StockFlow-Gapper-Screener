/* lib/dynamodb.ts
 *
 *  ────────────────────────────────────────────────────────────
 *  Universal DynamoDB helper: real tables on the server,
 *  zero-dependency in-memory mock in the browser preview.
 *  ────────────────────────────────────────────────────────────
 */

import type { PutCommandInput, GetCommandInput, ScanCommandInput, UpdateCommandInput } from "@aws-sdk/lib-dynamodb" // type-only import → stripped in browser

const isBrowser = typeof window !== "undefined"

/* ──────────────────  Common TS Interfaces  ────────────────── */

export interface User {
  email: string
  password: string
  role: "admin" | "user"
  status: "active" | "pending" | "suspended"
  createdAt: string
  lastLogin?: string
  name?: string
  company?: string
}

export interface AccessRequest {
  id: string
  name: string
  email: string
  company?: string
  experience: string
  reason: string
  status: "pending" | "approved" | "rejected"
  createdAt: string
  reviewedAt?: string
  reviewedBy?: string
}

/* ──────────────────  Dynamic Server Impl  ─────────────────── */

let userOperations: {
  createUser(u: Omit<User, "createdAt">): Promise<void>
  getUserByEmail(email: string): Promise<User | null>
  updateLastLogin(email: string): Promise<void>
  getAllUsers(): Promise<User[]>
}

let accessRequestOperations: {
  createAccessRequest(data: Omit<AccessRequest, "id" | "createdAt" | "status">): Promise<string>
  getAccessRequest(id: string): Promise<AccessRequest | null>
  getAllAccessRequests(): Promise<AccessRequest[]>
  updateAccessRequestStatus(id: string, status: "approved" | "rejected", reviewedBy: string): Promise<void>
}

/* ──────────────────  REAL (server)  ───────────────────────── */

if (!isBrowser) {
  // Hide requires from the browser bundler
  const req = eval("require") as NodeRequire

  const { DynamoDBClient } = req("@aws-sdk/client-dynamodb")
  const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand } = req("@aws-sdk/lib-dynamodb")

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  const docClient = DynamoDBDocumentClient.from(client)

  const TABLES = {
    USERS: process.env.DYNAMODB_USERS_TABLE || "stockflow-users",
    ACCESS: process.env.DYNAMODB_ACCESS_REQUESTS_TABLE || "stockflow-access-requests",
  }

  userOperations = {
    async createUser(u) {
      const cmd: PutCommandInput = {
        TableName: TABLES.USERS,
        Item: { ...u, createdAt: new Date().toISOString() },
      }
      await docClient.send(new PutCommand(cmd))
    },

    async getUserByEmail(email) {
      const res = await docClient.send(
        new GetCommand({
          TableName: TABLES.USERS,
          Key: { email: email.toLowerCase() },
        } as GetCommandInput),
      )
      return (res.Item as User) ?? null
    },

    async updateLastLogin(email) {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.USERS,
          Key: { email: email.toLowerCase() },
          UpdateExpression: "SET lastLogin = :ts",
          ExpressionAttributeValues: { ":ts": new Date().toISOString() },
        } as UpdateCommandInput),
      )
    },

    async getAllUsers() {
      const res = await docClient.send(new ScanCommand({ TableName: TABLES.USERS } as ScanCommandInput))
      return (res.Items as User[]) ?? []
    },
  }

  accessRequestOperations = {
    async createAccessRequest(data) {
      const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const cmd: PutCommandInput = {
        TableName: TABLES.ACCESS,
        Item: {
          ...data,
          id,
          status: "pending",
          createdAt: new Date().toISOString(),
        },
      }
      await docClient.send(new PutCommand(cmd))
      return id
    },

    async getAccessRequest(id) {
      const res = await docClient.send(
        new GetCommand({
          TableName: TABLES.ACCESS,
          Key: { id },
        } as GetCommandInput),
      )
      return (res.Item as AccessRequest) ?? null
    },

    async getAllAccessRequests() {
      const res = await docClient.send(new ScanCommand({ TableName: TABLES.ACCESS } as ScanCommandInput))
      return (res.Items as AccessRequest[]) ?? []
    },

    async updateAccessRequestStatus(id, status, reviewedBy) {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.ACCESS,
          Key: { id },
          UpdateExpression: "SET #s = :s, reviewedAt = :ra, reviewedBy = :rb",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":s": status,
            ":ra": new Date().toISOString(),
            ":rb": reviewedBy,
          },
        } as UpdateCommandInput),
      )
    },
  }
}

/* ──────────────────  BROWSER MOCK  ────────────────────────── */

if (isBrowser) {
  console.warn("[StockFlow] DynamoDB disabled in preview — using in-memory store.")

  const memUsers = new Map<string, User>()
  const memReqs = new Map<string, AccessRequest>()

  userOperations = {
    async createUser(u) {
      memUsers.set(u.email.toLowerCase(), {
        ...u,
        createdAt: new Date().toISOString(),
      } as User)
    },
    async getUserByEmail(email) {
      return memUsers.get(email.toLowerCase()) ?? null
    },
    async updateLastLogin(email) {
      const u = memUsers.get(email.toLowerCase())
      if (u) u.lastLogin = new Date().toISOString()
    },
    async getAllUsers() {
      return Array.from(memUsers.values())
    },
  }

  accessRequestOperations = {
    async createAccessRequest(data) {
      const id = `mock_${Date.now()}`
      memReqs.set(id, {
        ...data,
        id,
        status: "pending",
        createdAt: new Date().toISOString(),
      } as AccessRequest)
      return id
    },
    async getAccessRequest(id) {
      return memReqs.get(id) ?? null
    },
    async getAllAccessRequests() {
      return Array.from(memReqs.values())
    },
    async updateAccessRequestStatus(id, status) {
      const r = memReqs.get(id)
      if (r) {
        r.status = status
        r.reviewedAt = new Date().toISOString()
      }
    },
  }
}

/* ──────────────────  EXPORTS  ─────────────────────────────── */

export { userOperations, accessRequestOperations }
