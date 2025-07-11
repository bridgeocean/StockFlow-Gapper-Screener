"use client"

import { useState } from "react"
import { Menu, X, TrendingUp, Home, Bell, Settings } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface MobileNavProps {
  alertCount?: number
  onLogout?: () => void
  isAuthenticated?: boolean
}

export function MobileNav({ alertCount = 0, onLogout, isAuthenticated = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="md:hidden">
      {/* Hamburger Button */}
      <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)} className="text-white hover:text-green-400">
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm">
          <div className="fixed inset-y-0 left-0 w-64 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 border-r border-white/10">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-6 w-6 text-green-400" />
                <span className="text-white font-bold">StockFlow</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-white">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="p-4 space-y-2">
              <Link href="/" onClick={() => setIsOpen(false)}>
                <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 text-white">
                  <Home className="h-5 w-5" />
                  <span>Home</span>
                </div>
              </Link>

              <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 text-white">
                <Bell className="h-5 w-5" />
                <span>Alerts</span>
                {alertCount > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">{alertCount}</span>
                )}
              </div>

              <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 text-white">
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </div>
              {isAuthenticated && onLogout && (
                <button
                  onClick={() => {
                    onLogout()
                    setIsOpen(false)
                  }}
                  className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 text-white w-full text-left"
                >
                  <span className="text-red-400">🚪</span>
                  <span>Logout</span>
                </button>
              )}
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
