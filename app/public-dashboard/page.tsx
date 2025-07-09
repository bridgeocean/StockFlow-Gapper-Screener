"use client"

import { useState, useEffect } from "react"
import type { Stock, NewsItem, StockFilters } from "@/types/stock"
import { StockFiltersComponent } from "@/components/stock-filters"
import { formatCurrency, formatPercentage, formatNumber } from "@/lib/utils"
import { TrendingUp, RefreshCw, Home, AlertTriangle } from "lucide-react"
import Link from "next/link"

export default function PublicDashboard() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [filteredStocks, setFilteredStocks] = useState<Stock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [dataSource, setDataSource] = useState<string>("unknown")
  const [filters, setFilters] = useState<StockFilters>({
    priceRange: [0.1, 20],
    volumeMultiplier: 1,
    gapPercent: 1,
    performance: 0,
    floatMax: 20, // Default to 20M
    newsCatalyst: false,
  })

  const fetchStocks = async () => {
    try {
      console.log("🔍 Fetching stocks from API...")
      const response = await fetch("/api/stocks")
      console.log("📡 API Response status:", response.status)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log("📊 Raw API data:", data)
      console.log("📈 Stocks array:", data.data)
      console.log("📋 Number of stocks received:", data.data?.length || 0)

      if (data.success) {
        setStocks(data.data || [])
        setDataSource(data.source || "unknown")
        setError(null)
        console.log("✅ Stocks state updated successfully")
      } else {
        setError(data.error || "Failed to fetch stocks")
        console.error("❌ API returned error:", data.error)
      }
    } catch (err: any) {
      console.error("💥 Error fetching stocks:", err)
      setError(err.message || "Network error occurred")
    }
  }

  const fetchNews = async (stockSymbols: string[] = []) => {
    try {
      const symbolsQuery = stockSymbols.length > 0 ? `?symbols=${stockSymbols.join(",")}` : ""
      const response = await fetch(`/api/news${symbolsQuery}`)
      if (!response.ok) {
        console.warn(`News API returned ${response.status}`)
        return
      }
      const data = await response.json()
      if (data.success) {
        setNews(
          data.data.map((n: any) => ({
            relatedSymbols: [],
            ...n,
          })),
        )
      }
    } catch (err) {
      console.error("Error fetching news:", err)
    }
  }

  const fetchData = async () => {
    setIsLoading(true)
    await Promise.all([fetchStocks()])
    setLastUpdate(new Date())
    setIsLoading(false)
  }

  const applyFilters = () => {
    console.log("🔧 Applying filters to", stocks.length, "stocks")
    console.log("🎛️ Current filters:", filters)

    const filtered = stocks.filter((stock) => {
      const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1
      const floatInMillions = stock.float > 0 ? stock.float / 1000000 : 1

      const priceCheck = stock.price >= filters.priceRange[0] && stock.price <= filters.priceRange[1]
      const volumeCheck = volumeRatio >= filters.volumeMultiplier
      const gapCheck = stock.gap >= filters.gapPercent
      const performanceCheck = stock.performance >= filters.performance
      const floatCheck = floatInMillions <= filters.floatMax

      // News catalyst filter
      const newsCatalystCheck =
        !filters.newsCatalyst ||
        stock.indicators.some(
          (indicator) => indicator.type === "catalyst" || indicator.type === "hot" || indicator.type === "momentum",
        )

      console.log(
        `📊 ${stock.symbol}: price=${priceCheck}, volume=${volumeCheck}, gap=${gapCheck}, perf=${performanceCheck}, float=${floatCheck}, catalyst=${newsCatalystCheck}`,
      )

      return priceCheck && volumeCheck && gapCheck && performanceCheck && floatCheck && newsCatalystCheck
    })

    console.log("✅ Filtered stocks:", filtered.length, "out of", stocks.length)
    setFilteredStocks(filtered)

    // Fetch news relevant to filtered stocks
    const topSymbols = filtered.slice(0, 10).map((stock) => stock.symbol)
    if (topSymbols.length > 0) {
      fetchNews(topSymbols)
    }
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchStocks()
      const topSymbols = filteredStocks.slice(0, 10).map((stock) => stock.symbol)
      if (topSymbols.length > 0) {
        fetchNews(topSymbols)
      }
      setLastUpdate(new Date())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    applyFilters()
  }, [stocks, filters])

  if (isLoading && stocks.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading StockFlow Scanner...</div>
      </div>
    )
  }

  const stats = {
    totalStocks: filteredStocks.length,
    avgGap:
      filteredStocks.length > 0 ? filteredStocks.reduce((sum, stock) => sum + stock.gap, 0) / filteredStocks.length : 0,
    totalVolume: filteredStocks.reduce((sum, stock) => sum + stock.volume, 0),
    hotStocks: filteredStocks.filter((stock) => stock.indicators.some((indicator) => indicator.type === "hot")).length,
  }

  const exportToCSV = () => {
    const headers = [
      "Symbol",
      "Company",
      "Price",
      "Change",
      "Change%",
      "Gap%",
      "Volume",
      "Avg Volume",
      "Vol Ratio",
      "Performance%",
      "Market Cap",
      "Float",
      "Sector",
      "Industry",
    ]

    const csvData = filteredStocks.map((stock) => [
      stock.symbol,
      stock.company,
      stock.price,
      stock.change,
      stock.changePercent,
      stock.gap,
      stock.volume,
      stock.avgVolume,
      stock.avgVolume > 0 ? (stock.volume / stock.avgVolume).toFixed(2) : "N/A",
      stock.performance,
      stock.marketCap,
      stock.float,
      stock.sector,
      stock.industry,
    ])

    const csvContent = [headers, ...csvData].map((row) => row.join(",")).join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `stockflow_gap_scanner_${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Fix data source detection - finviz_elite_csv_api should be considered live data
  const isRealData = dataSource === "finviz_elite_api" || dataSource === "finviz_elite_csv_api"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-green-400" />
              <h1 className="text-2xl font-bold text-white">StockFlow Initiative</h1>
              <span className="text-sm text-gray-400">by ThePhDPush</span>
              <div
                className={`px-2 py-1 text-xs rounded border ${
                  isRealData
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                }`}
              >
                {isRealData ? "🟢 LIVE DATA" : "⚠️ DEMO DATA"}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="text-xs text-gray-400">Last updated: {lastUpdate.toLocaleTimeString()}</div>
              <Link href="/">
                <button className="px-4 py-2 text-white hover:text-green-400 flex items-center">
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </button>
              </Link>
              <button
                onClick={fetchData}
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded flex items-center disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Data Source Status */}
        {!isRealData && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-4 rounded mb-6 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-3" />
            <div>
              <strong>Demo Mode:</strong> Currently using simulated data. The system attempted to connect to Finviz
              Elite API but fell back to demo data. Check server logs for connection details.
            </div>
          </div>
        )}

        {isRealData && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded mb-6 flex items-center">
            <div className="h-2 w-2 bg-green-400 rounded-full mr-3 animate-pulse"></div>
            <div>
              <strong>Live Data:</strong> Successfully connected to Finviz Elite API. Data is being updated in real-time
              from professional market sources.
            </div>
          </div>
        )}

        {error && <div className="bg-red-500/20 border border-red-500/50 text-red-400 p-4 rounded mb-6">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-black/40 border border-white/10 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Filtered Stocks</h3>
            <div className="text-2xl font-bold text-white">{stats.totalStocks}</div>
            <div className="text-xs text-green-400 flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              Active scanners
            </div>
          </div>
          <div className="bg-black/40 border border-white/10 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Average Gap</h3>
            <div className="text-2xl font-bold text-white">{stats.avgGap.toFixed(1)}%</div>
            <div className="text-xs text-yellow-400 flex items-center">
              <span className="mr-1">📊</span>
              Gap percentage
            </div>
          </div>
          <div className="bg-black/40 border border-white/10 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Total Volume</h3>
            <div className="text-2xl font-bold text-white">{formatNumber(stats.totalVolume)}</div>
            <div className="text-xs text-blue-400 flex items-center">
              <span className="mr-1">💰</span>
              Combined volume
            </div>
          </div>
          <div className="bg-black/40 border border-white/10 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Hot Stocks</h3>
            <div className="text-2xl font-bold text-white">{stats.hotStocks}</div>
            <div className="text-xs text-red-400 flex items-center">
              <span className="mr-1">🔥</span>
              High momentum
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters */}
          <div className="lg:col-span-1">
            <StockFiltersComponent filters={filters} onFiltersChange={setFilters} />
          </div>

          {/* Stocks Table */}
          <div className="lg:col-span-2">
            <div className="bg-black/40 border border-white/10 rounded-lg">
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Gap Scanner Results</h2>
                  <div className="flex items-center space-x-2">
                    <div className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30">
                      Top 10 of {filteredStocks.length} stocks
                    </div>
                    <button
                      onClick={exportToCSV}
                      disabled={filteredStocks.length === 0}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-xs rounded flex items-center"
                    >
                      <span className="mr-1">📥</span>
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                {filteredStocks.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">No stocks match current filters</p>
                    <p className="text-sm">Try adjusting the filter values or click "Show All Stocks"</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {stocks.length} stocks available • Showing top 10 results when filtered
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredStocks.slice(0, 10).map((stock) => {
                      const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1
                      return (
                        <div
                          key={stock.symbol}
                          className="border border-white/20 rounded p-4 hover:bg-white/10 bg-white/5"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-white text-lg">{stock.symbol}</div>
                              <div className="text-sm text-gray-300 font-medium">{stock.company}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-white text-lg">{formatCurrency(stock.price)}</div>
                              <div
                                className={`text-sm font-semibold ${stock.change >= 0 ? "text-green-400" : "text-red-400"}`}
                              >
                                {formatPercentage(stock.changePercent)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center space-x-2">
                              {stock.indicators.map((indicator, idx) => (
                                <span
                                  key={idx}
                                  className="text-sm bg-white/20 text-white px-2 py-1 rounded font-medium"
                                >
                                  {indicator.icon} {indicator.label}
                                </span>
                              ))}
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-yellow-300 font-semibold">Gap: {stock.gap.toFixed(1)}%</div>
                              <div className="text-xs text-blue-300">
                                Vol: {formatNumber(stock.volume)} ({volumeRatio.toFixed(1)}x)
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* News Feed */}
          <div className="lg:col-span-1">
            <div className="bg-black/40 border border-white/10 rounded-lg">
              <div className="p-4 border-b border-white/10">
                <h2 className="text-xl font-bold text-white flex items-center">
                  <span className="mr-2">📰</span>
                  Market News
                </h2>
              </div>
              <div className="p-4">
                {news.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <span className="text-4xl mb-4 block">📰</span>
                    <p>No news available</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {news.map((item) => (
                      <div key={item.id} className="border-b border-white/10 pb-4 last:border-b-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex space-x-2">
                            {(item.relatedSymbols ?? []).map((symbol: string) => (
                              <span key={symbol} className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                                {symbol}
                              </span>
                            ))}
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(item.publishedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <h3 className="text-white font-semibold mb-2 text-sm">{item.title}</h3>
                        <p className="text-gray-400 text-xs">{item.summary}</p>
                        <div className="text-xs text-gray-500 mt-2">Source: {item.source}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
