"use client"

import { useState, useEffect } from "react"
import type { Stock } from "@/types/stock"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bell, BellRing, X } from "lucide-react"
import { formatCurrency, formatPercentage } from "@/lib/utils"

interface Alert {
  id: string
  type: "gap" | "volume" | "price" | "momentum"
  stock: Stock
  message: string
  timestamp: Date
  isRead: boolean
  priority: "low" | "medium" | "high"
}

interface AlertSystemProps {
  stocks: Stock[]
  className?: string
}

export function AlertSystem({ stocks, className }: AlertSystemProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [lastStockCheck, setLastStockCheck] = useState<Stock[]>([])

  // Generate alerts based on stock changes
  useEffect(() => {
    if (lastStockCheck.length === 0) {
      setLastStockCheck(stocks)
      return
    }

    const newAlerts: Alert[] = []

    stocks.forEach((currentStock) => {
      const previousStock = lastStockCheck.find((s) => s.symbol === currentStock.symbol)

      if (!previousStock) {
        // New stock appeared - high gap alert
        if (currentStock.gap >= 10) {
          newAlerts.push({
            id: `${currentStock.symbol}-${Date.now()}`,
            type: "gap",
            stock: currentStock,
            message: `🚀 NEW GAPPER: ${currentStock.symbol} gapping ${currentStock.gap.toFixed(1)}%`,
            timestamp: new Date(),
            isRead: false,
            priority: currentStock.gap >= 20 ? "high" : "medium",
          })
        }
        return
      }

      // Gap increase alert
      if (currentStock.gap > previousStock.gap + 5) {
        newAlerts.push({
          id: `${currentStock.symbol}-gap-${Date.now()}`,
          type: "gap",
          stock: currentStock,
          message: `📈 GAP EXPANSION: ${currentStock.symbol} gap increased to ${currentStock.gap.toFixed(1)}%`,
          timestamp: new Date(),
          isRead: false,
          priority: currentStock.gap >= 15 ? "high" : "medium",
        })
      }

      // Volume spike alert
      const currentVolumeRatio = currentStock.avgVolume > 0 ? currentStock.volume / currentStock.avgVolume : 1
      const previousVolumeRatio = previousStock.avgVolume > 0 ? previousStock.volume / previousStock.avgVolume : 1

      if (currentVolumeRatio > previousVolumeRatio + 2 && currentVolumeRatio >= 5) {
        newAlerts.push({
          id: `${currentStock.symbol}-volume-${Date.now()}`,
          type: "volume",
          stock: currentStock,
          message: `🔊 VOLUME SPIKE: ${currentStock.symbol} volume at ${currentVolumeRatio.toFixed(1)}x average`,
          timestamp: new Date(),
          isRead: false,
          priority: currentVolumeRatio >= 10 ? "high" : "medium",
        })
      }

      // Momentum alert
      if (currentStock.performance > previousStock.performance + 5 && currentStock.performance >= 15) {
        newAlerts.push({
          id: `${currentStock.symbol}-momentum-${Date.now()}`,
          type: "momentum",
          stock: currentStock,
          message: `⚡ MOMENTUM: ${currentStock.symbol} performance up ${currentStock.performance.toFixed(1)}%`,
          timestamp: new Date(),
          isRead: false,
          priority: currentStock.performance >= 25 ? "high" : "medium",
        })
      }
    })

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 50)) // Keep last 50 alerts

      // Play notification sound for high priority alerts
      const highPriorityAlerts = newAlerts.filter((alert) => alert.priority === "high")
      if (highPriorityAlerts.length > 0) {
        // Browser notification sound (if supported)
        try {
          const audioTest = new Audio()
          if (audioTest.canPlayType("audio/wav") !== "") {
            audioTest.src =
              "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT"
            audioTest.play().catch(() => {
              /* some browsers block autoplay – ignore */
            })
          }
        } catch {
          /* Audio not supported – safely ignore */
        }
      }
    }

    setLastStockCheck(stocks)
  }, [stocks, lastStockCheck])

  const unreadCount = alerts.filter((alert) => !alert.isRead).length

  const markAsRead = (alertId: string) => {
    setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, isRead: true } : alert)))
  }

  const markAllAsRead = () => {
    setAlerts((prev) => prev.map((alert) => ({ ...alert, isRead: true })))
  }

  const removeAlert = (alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId))
  }

  const clearAllAlerts = () => {
    setAlerts([])
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      default:
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
    }
  }

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "gap":
        return "🚀"
      case "volume":
        return "🔊"
      case "momentum":
        return "⚡"
      default:
        return "📈"
    }
  }

  return (
    <Card className={`bg-black/40 border-white/10 backdrop-blur-sm ${className}`}>
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {unreadCount > 0 ? (
              <BellRing className="h-5 w-5 text-yellow-400 animate-pulse" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
            <span>Real-Time Alerts</span>
            {unreadCount > 0 && (
              <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                {unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {alerts.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Mark All Read
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllAlerts}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear All
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-white md:hidden"
            >
              {isExpanded ? "Collapse" : "Expand"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${!isExpanded ? "hidden md:block" : ""}`}>
        {alerts.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No alerts yet</p>
            <p className="text-xs">Alerts will appear when stocks meet trigger conditions</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {alerts.slice(0, 20).map((alert) => (
              <div
                key={alert.id}
                className={`border rounded-lg p-3 ${
                  alert.isRead ? "border-white/10 bg-white/5" : "border-yellow-500/30 bg-yellow-500/10"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-lg">{getAlertIcon(alert.type)}</span>
                      <Badge variant="outline" className={`text-xs ${getPriorityColor(alert.priority)}`}>
                        {alert.priority.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-gray-400">{alert.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <p className="text-white text-sm font-medium mb-2">{alert.message}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-400">
                      <span>Price: {formatCurrency(alert.stock.price)}</span>
                      <span>Change: {formatPercentage(alert.stock.changePercent)}</span>
                      <span>Gap: {alert.stock.gap.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                    {!alert.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(alert.id)}
                        className="text-xs text-blue-400 hover:text-blue-300 p-1 h-auto"
                      >
                        Mark Read
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAlert(alert.id)}
                      className="text-gray-400 hover:text-red-400 p-1 h-auto"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
