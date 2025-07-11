"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TrendingUp, Lock, Mail } from "lucide-react"

// Dev credentials for preview mode
const DEV_EMAIL = "bridgeocean@cyberservices.com"
const DEV_PASSWORD = "admin123"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    console.log("🔐 Login attempt:", { email, password: password.length + " chars" })

    // Check if we're in preview mode (no real API)
    const isPreview =
      window.location.hostname.includes("vusercontent.net") ||
      window.location.hostname.includes("localhost") ||
      process.env.NODE_ENV === "development"

    if (isPreview) {
      console.log("🔧 Preview mode - checking dev credentials")

      // Direct credential check in preview
      if (email === DEV_EMAIL && password === DEV_PASSWORD) {
        console.log("✅ Dev login successful")
        localStorage.setItem("stockflow_session", "dev-token-" + Date.now())
        router.push("/public-dashboard")
        return
      } else {
        console.log("❌ Invalid dev credentials")
        setError("Invalid credentials (Preview mode: use bridgeocean@cyberservices.com / admin123)")
        setIsLoading(false)
        return
      }
    }

    // Production API call
    try {
      console.log("🏭 Production mode - calling API")
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (data.success) {
        localStorage.setItem("stockflow_session", data.token)
        router.push("/public-dashboard")
      } else {
        setError(data.message || "Login failed")
      }
    } catch (err) {
      console.error("Network error:", err)
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <TrendingUp className="h-8 w-8 text-green-400" />
            <h1 className="text-2xl font-bold text-white">StockFlow Initiative</h1>
          </div>
          <p className="text-gray-400">Professional Gap Scanner Access</p>
        </div>

        <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <Lock className="h-5 w-5" />
              <span>Login Required</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                  placeholder="Enter your email address"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <Button type="submit" disabled={isLoading} className="w-full bg-green-600 hover:bg-green-700 text-white">
                {isLoading ? "Signing In..." : "Sign In"}
              </Button>
            </form>

            <div className="text-center pt-4 border-t border-white/10">
              <p className="text-gray-400 text-sm mb-3">Don't have access yet?</p>
              <Link href="/request-access">
                <Button
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10 bg-transparent"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Request Access
                </Button>
              </Link>
            </div>

            <div className="text-center">
              <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">
                ← Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
