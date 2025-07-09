"use client"
import type { Stock } from "@/types/stock"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils"
import { TrendingUp, TrendingDown, ExternalLink, X } from "lucide-react"

interface StockChartModalProps {
  stock: Stock | null
  isOpen: boolean
  onClose: () => void
}

export function StockChartModal({ stock, isOpen, onClose }: StockChartModalProps) {
  if (!stock) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-black/90 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h2 className="text-2xl font-bold">{stock.symbol}</h2>
                <p className="text-gray-400">{stock.company}</p>
              </div>
              <div className="flex space-x-2">
                {stock.indicators.map((indicator, index) => (
                  <Badge key={index} variant="outline" className={indicator.color}>
                    {indicator.icon} {indicator.label}
                  </Badge>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Price Information */}
          <div className="space-y-4">
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Price Information</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Price:</span>
                  <span className="font-semibold">{formatCurrency(stock.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Change:</span>
                  <div
                    className={`flex items-center space-x-1 ${stock.change >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {stock.change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <span>
                      {formatCurrency(Math.abs(stock.change))} ({formatPercentage(stock.changePercent)})
                    </span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Gap:</span>
                  <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                    {stock.gap.toFixed(2)}%
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Performance:</span>
                  <span className={stock.performance >= 0 ? "text-green-400" : "text-red-400"}>
                    {formatPercentage(stock.performance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Volume Information */}
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Volume Information</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Volume:</span>
                  <span className="font-semibold">{formatNumber(stock.volume)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Average Volume:</span>
                  <span>{formatNumber(stock.avgVolume)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Volume Ratio:</span>
                  <span className="font-semibold">
                    {stock.avgVolume > 0 ? `${((stock.volume / stock.avgVolume) * 100).toFixed(0)}%` : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Company Information */}
          <div className="space-y-4">
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Company Information</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Sector:</span>
                  <span>{stock.sector}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Industry:</span>
                  <span>{stock.industry}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Market Cap:</span>
                  <span>{formatNumber(stock.marketCap)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Float:</span>
                  <span>{formatNumber(stock.float)}</span>
                </div>
              </div>
            </div>

            {/* Chart Placeholder */}
            <div className="bg-white/5 rounded-lg p-4 h-48 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Chart visualization would go here</p>
                <p className="text-sm">Integration with charting library needed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-white/10">
          <div className="text-sm text-gray-400">Last updated: {new Date(stock.lastUpdated).toLocaleString()}</div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Finviz
            </Button>
            <Button variant="outline" size="sm">
              Add to Watchlist
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
