"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Users, CheckCircle, XCircle, Clock } from "lucide-react"

interface PendingUser {
  email: string
  name: string
  company: string
  requestReason: string
  experience: string
  createdAt: string
}

export default function AdminPage() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchPendingUsers = async () => {
    try {
      const response = await fetch("/api/admin/pending-users", {
        headers: {
          Authorization: "Bearer admin", // Simple auth for now
        },
      })
      const data = await response.json()

      if (data.success) {
        setPendingUsers(data.data)
      } else {
        setError(data.message)
      }
    } catch (err) {
      setError("Failed to fetch pending users")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUserAction = async (email: string, action: "approve" | "reject") => {
    try {
      const response = await fetch("/api/admin/approve-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, action }),
      })

      const data = await response.json()

      if (data.success) {
        // Remove user from pending list
        setPendingUsers((prev) => prev.filter((user) => user.email !== email))
        console.log(`User ${email} ${action}d successfully`)
      } else {
        setError(data.message)
      }
    } catch (err) {
      setError(`Failed to ${action} user`)
    }
  }

  useEffect(() => {
    fetchPendingUsers()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Header */}
      <div className="container mx-auto mb-8">
        <div className="flex items-center space-x-3 mb-6">
          <TrendingUp className="h-8 w-8 text-green-400" />
          <h1 className="text-3xl font-bold text-white">StockFlow Admin</h1>
          <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
            ADMIN ONLY
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-black/40 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Clock className="h-8 w-8 text-yellow-400" />
                <div>
                  <div className="text-2xl font-bold text-white">{pendingUsers.length}</div>
                  <div className="text-sm text-gray-400">Pending Requests</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Users className="h-8 w-8 text-blue-400" />
                <div>
                  <div className="text-2xl font-bold text-white">-</div>
                  <div className="text-sm text-gray-400">Total Users</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-8 w-8 text-green-400" />
                <div>
                  <div className="text-2xl font-bold text-white">-</div>
                  <div className="text-sm text-gray-400">Approved Today</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pending Users */}
      <div className="container mx-auto">
        <Card className="bg-black/40 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Pending Access Requests</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded mb-4">{error}</div>
            )}

            {isLoading ? (
              <div className="text-center text-gray-400 py-8">Loading...</div>
            ) : pendingUsers.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pending requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((user) => (
                  <div key={user.email} className="border border-white/20 rounded-lg p-4 bg-white/5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">{user.name}</h3>
                          <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                            PENDING
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-gray-300">
                          <p>
                            <strong>Email:</strong> {user.email}
                          </p>
                          <p>
                            <strong>Company:</strong> {user.company || "Not provided"}
                          </p>
                          <p>
                            <strong>Experience:</strong> {user.experience}
                          </p>
                          <p>
                            <strong>Reason:</strong> {user.requestReason}
                          </p>
                          <p>
                            <strong>Requested:</strong> {new Date(user.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <Button
                          onClick={() => handleUserAction(user.email, "approve")}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleUserAction(user.email, "reject")}
                          variant="outline"
                          className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                          size="sm"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
