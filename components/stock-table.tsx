"use client"

import { useState } from "react"
import type { Stock } from "@/types/stock"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPercentage, formatNumber } from "@/lib/utils"
import { ChevronUp, ChevronDown, TrendingUp, TrendingDown } from "lucide-react"

interface StockTableProps {
  stocks: Stock[]
  onStockClick: (stock: Stock) => void
}

type SortField = "symbol" | "price" | "change" | "gap" | "volume" | "performance"
type SortDirection = "asc" | "desc"

export function StockTable({ stocks, onStockClick }: StockTableProps) {
  const [sortField, setSortField] = useState<SortField>("gap")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const sortedStocks = [...stocks].sort((a, b) => {
    let aValue: number | string = a[sortField]
    let bValue: number | string = b[sortField]

    if (typeof aValue === "string") {
      aValue = aValue.toLowerCase()
      bValue = (bValue as string).toLowerCase()
    }

    if (sortDirection === "asc") {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
    }
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
  }

  if (stocks.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg mb-2">No stocks available</p>
        <p className="text-sm">Check your filters or try refreshing the data</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("symbol")}
                className="text-gray-400 hover:text-white p-0 h-auto font-medium"
              >
                Symbol <SortIcon field="symbol" />
              </Button>
            </th>
            <th className="text-right p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("price")}
                className="text-gray-400 hover:text-white p-0 h-auto font-medium"
              >
                Price <SortIcon field="price" />
              </Button>
            </th>
            <th className="text-right p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("change")}
                className="text-gray-400 hover:text-white p-0 h-auto font-medium"
              >
                Change <SortIcon field="change" />
              </Button>
            </th>
            <th className="text-right p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("gap")}
                className="text-gray-400 hover:text-white p-0 h-auto font-medium"
              >
                Gap % <SortIcon field="gap" />
              </Button>
            </th>
            <th className="text-right p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("volume")}
                className="text-gray-400 hover:text-white p-0 h-auto font-medium"
              >
                Volume <SortIcon field="volume" />
              </Button>
            </th>
            <th className="text-right p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("performance")}
                className="text-gray-400 hover:text-white p-0 h-auto font-medium"
              >
                Performance <SortIcon field="performance" />
              </Button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedStocks.map((stock) => (
            <tr
              key={stock.symbol}
              className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
              onClick={() => onStockClick(stock)}
            >
              <td className="p-3">
                <div className="flex items-center space-x-2">
                  <div>
                    <div className="font-semibold text-white">{stock.symbol}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[120px]">{stock.company}</div>
                  </div>
                  <div className="flex space-x-1">
                    {stock.indicators.map((indicator, index) => (
                      <span key={index} className="text-xs" title={indicator.label}>
                        {indicator.icon}
                      </span>
                    ))}
                  </div>
                </div>
              </td>
              <td className="p-3 text-right">
                <div className="font-semibold text-white">{formatCurrency(stock.price)}</div>
              </td>
              <td className="p-3 text-right">
                <div className="flex items-center justify-end space-x-1">
                  {stock.change >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-400" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-400" />
                  )}
                  <div className={stock.change >= 0 ? "text-green-400" : "text-red-400"}>
                    <div className="font-semibold">{formatCurrency(Math.abs(stock.change))}</div>
                    <div className="text-xs">{formatPercentage(stock.changePercent)}</div>
                  </div>
                </div>
              </td>
              <td className="p-3 text-right">
                <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  {stock.gap.toFixed(1)}%
                </Badge>
              </td>
              <td className="p-3 text-right">
                <div className="text-white font-semibold">{formatNumber(stock.volume)}</div>
                <div className="text-xs text-gray-400">
                  {stock.avgVolume > 0 ? `${((stock.volume / stock.avgVolume) * 100).toFixed(0)}% avg` : "N/A"}
                </div>
              </td>
              <td className="p-3 text-right">
                <div className={stock.performance >= 0 ? "text-green-400" : "text-red-400"}>
                  {formatPercentage(stock.performance)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
