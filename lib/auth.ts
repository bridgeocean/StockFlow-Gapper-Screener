import bcrypt from "bcryptjs"
import { userOperations } from "./dynamodb"

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production"

export interface AuthUser {
  email: string
  role: string
  name?: string
}

// Lightweight base-64 “token” (NOT a real JWT – good enough for demo)
function encodeToken(data: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(data)).toString("base64url")
}
function decodeToken<T = any>(token: string): T | null {
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString()) as T
  } catch {
    return null
  }
}

export const authOperations = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12)
  },

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
  },

  async authenticateUser(email: string, password: string): Promise<AuthUser | null> {
    try {
      const user = await userOperations.getUserByEmail(email)

      if (!user || user.status !== "active") {
        return null
      }

      const isValidPassword = await this.verifyPassword(password, user.password)
      if (!isValidPassword) {
        return null
      }

      // Update last login
      await userOperations.updateLastLogin(email)

      return {
        email: user.email,
        role: user.role,
        name: user.name,
      }
    } catch (error) {
      console.error("Authentication error:", error)
      return null
    }
  },

  generateToken(user: AuthUser): string {
    return encodeToken({ ...user, iat: Date.now() })
  },

  verifyToken(token: string): AuthUser | null {
    return decodeToken<AuthUser>(token)
  },

  async createDefaultAdmin(): Promise<void> {
    try {
      // Check if admin already exists
      const existingAdmin = await userOperations.getUserByEmail("admin@thephdpush.com")
      if (existingAdmin) {
        console.log("✅ Default admin already exists")
        return
      }

      // Create default admin user
      const hashedPassword = await this.hashPassword("admin123")
      await userOperations.createUser({
        email: "admin@thephdpush.com",
        password: hashedPassword,
        role: "admin",
        status: "active",
        name: "System Administrator",
        company: "ThePhDPush",
      })

      console.log("✅ Default admin user created: admin@thephdpush.com / admin123")
    } catch (error) {
      console.error("❌ Error creating default admin:", error)
    }
  },
}
