import { NextResponse } from "next/server"

/**
 * Live Feed token – update here when you get a new one.
 */
const LIVE_FEED_API_BASE = "https://elite.finviz.com/export.ashx"
const LIVE_FEED_API_TOKEN = "9a091693-9164-40dd-8e93-1c18606f0e6f"

// 5 criteria filters for gap scanner
const GAPPER_FILTERS = {
  price: "sh_price_u20", // Price under $20 (matching your original filter)
  relativeVolume: "sh_relvol_o1", // Relative volume over 1x
  gap: "ta_gap_u5", // Gap up 5%+
  performance: "ta_perf_dup1", // Performance today +1%
  float: "sh_float_u100", // Float under 100M
}

/**
 * GET /api/stocks - Fetch real Finviz Elite data via CSV export
 */
export async function GET() {
  console.log("🚀 Starting Live Feed CSV API call...")

  try {
    // Build Finviz screener URL with filters
    const filterString = Object.values(GAPPER_FILTERS).join(",")
    const url = `${LIVE_FEED_API_BASE}?v=111&f=${filterString}&c=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20&auth=${LIVE_FEED_API_TOKEN}`

    console.log("📡 Fetching from Live Feed CSV API...")
    console.log("🔗 URL:", url.substring(0, 100) + "...")

    const response = await fetch(url, {
      headers: {
        "User-Agent": "StockFlow-Scanner/1.0",
        Accept: "text/csv,text/plain,*/*",
      },
    })

    console.log(`📊 Live Feed CSV response: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      throw new Error(`Live Feed CSV API error: ${response.status} ${response.statusText}`)
    }

    const csvData = await response.text()
    console.log(`📄 CSV data length: ${csvData.length} characters`)
    console.log(`📋 CSV preview: ${csvData.substring(0, 200)}...`)

    const stocks = parseLiveFeedCSV(csvData)
    console.log(`✅ Parsed ${stocks.length} stocks from CSV`)

    if (stocks.length > 0) {
      return NextResponse.json({
        success: true,
        source: "live_feed_csv_api",
        count: stocks.length,
        data: stocks,
        timestamp: new Date().toISOString(),
      })
    } else {
      console.log("⚠️ No stocks found in CSV, using demo data")
      return NextResponse.json(buildDemoPayload("no_csv_data"))
    }
  } catch (error) {
    console.error("❌ Live Feed CSV API error:", error)
    return NextResponse.json(buildDemoPayload("csv_api_error"))
  }
}

/**
 * Parse Live Feed CSV data into Stock objects
 */
function parseLiveFeedCSV(csvData: string) {
  const stocks: any[] = []

  try {
    const lines = csvData.trim().split("\n")
    console.log("📋 CSV Header:", lines[0])

    if (lines.length < 2) {
      console.log("⚠️ CSV has no data rows")
      return stocks
    }

    // Skip header row, process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Split CSV line, handling quoted values
      const columns = parseCSVLine(line)

      if (columns.length < 10) {
        console.log(`⚠️ Skipping malformed CSV line ${i}: ${line.substring(0, 50)}...`)
        continue
      }

      try {
        // Map CSV columns to our Stock interface
        const symbol = columns[1]?.replace(/"/g, "") || ""
        const company = columns[2]?.replace(/"/g, "") || ""
        const sector = columns[3]?.replace(/"/g, "") || ""
        const industry = columns[4]?.replace(/"/g, "") || ""
        const price = Number.parseFloat(columns[8]?.replace(/"/g, "") || "0")
        const changePercent = Number.parseFloat(columns[9]?.replace(/["%]/g, "") || "0")
        const volume = Number.parseInt(columns[10]?.replace(/[",]/g, "") || "0")

        if (!symbol || symbol.length > 5 || price <= 0) {
          continue // Skip invalid entries
        }

        const stock = {
          symbol,
          company,
          sector,
          industry,
          price,
          changePercent,
          change: +(price * changePercent * 0.01).toFixed(2),
          volume,
          avgVolume: Math.floor(volume * (0.5 + Math.random() * 0.8)), // Estimate avg volume
          marketCap: Math.floor(Math.random() * 10_000_000_000), // Placeholder
          float: Math.floor(Math.random() * 100_000_000), // Placeholder
          gap: Math.abs(changePercent), // Use change% as gap approximation
          performance: changePercent,
          indicators: generateIndicators(changePercent, volume),
          lastUpdated: new Date().toISOString(),
        }

        stocks.push(stock)
      } catch (parseError) {
        console.log(`⚠️ Error parsing CSV line ${i}:`, parseError)
      }
    }
  } catch (error) {
    console.error("❌ CSV parsing error:", error)
  }

  return stocks
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }

  result.push(current) // Add the last field
  return result
}

/**
 * Generate stock indicators based on performance
 */
function generateIndicators(changePercent: number, volume: number) {
  const indicators: any[] = []

  if (changePercent > 15) {
    indicators.push({ type: "hot", icon: "🔥", label: "Hot Stock", color: "text-red-500" })
  }

  if (changePercent > 8) {
    indicators.push({ type: "momentum", icon: "⚡", label: "Strong Momentum", color: "text-yellow-500" })
  }

  if (volume > 5_000_000) {
    indicators.push({ type: "catalyst", icon: "📢", label: "High Volume", color: "text-blue-500" })
  }

  return indicators
}

/**
 * Fallback demo data
 */
function buildDemoPayload(reason: string) {
  const data = generateDemoStocks()
  return {
    success: true,
    fallback: true,
    reason,
    source: "enhanced_demo_data",
    count: data.length,
    data,
    timestamp: new Date().toISOString(),
  }
}

function generateDemoStocks() {
  const base = [
    {
      symbol: "NVDA",
      company: "NVIDIA Corporation",
      price: 875.28,
      changePercent: 5.5,
      gap: 6.2,
      volume: 28_500_000,
      avgVolume: 25_000_000,
      marketCap: 2_150_000_000_000,
      float: 2_450_000_000,
      performance: 12.8,
      sector: "Technology",
      industry: "Semiconductors",
    },
    {
      symbol: "TSLA",
      company: "Tesla Inc",
      price: 248.42,
      changePercent: 5.2,
      gap: 5.8,
      volume: 45_000_000,
      avgVolume: 35_000_000,
      marketCap: 790_000_000_000,
      float: 3_160_000_000,
      performance: 8.9,
      sector: "Consumer Cyclical",
      industry: "Auto Manufacturers",
    },
    {
      symbol: "AAPL",
      company: "Apple Inc",
      price: 2.53,
      changePercent: 9.1,
      gap: 4.8,
      volume: 52000000,
      avgVolume: 48000000,
      marketCap: 2950000000000,
      float: 15300000000,
      performance: 7.2,
      sector: "Technology",
      industry: "Consumer Electronics",
    },
    {
      symbol: "SOXL",
      company: "Direxion Daily Semiconductor Bull 3X Shares",
      price: 1.67,
      changePercent: 14.4,
      gap: 8.2,
      volume: 15200000,
      avgVolume: 12000000,
      marketCap: 1200000000,
      float: 26000000,
      performance: 15.4,
      sector: "Technology",
      industry: "Semiconductors",
    },
    {
      symbol: "BBIG",
      company: "Vinco Ventures Inc",
      price: 2.45,
      changePercent: 37.6,
      gap: 42.1,
      volume: 8500000,
      avgVolume: 2100000,
      marketCap: 145000000,
      float: 59000000,
      performance: 28.9,
      sector: "Communication Services",
      industry: "Entertainment",
    },
    {
      symbol: "MULN",
      company: "Mullen Automotive Inc",
      price: 1.23,
      changePercent: 17.1,
      gap: 19.3,
      volume: 12400000,
      avgVolume: 8900000,
      marketCap: 89000000,
      float: 72000000,
      performance: 11.2,
      sector: "Consumer Cyclical",
      industry: "Auto Manufacturers",
    },
    {
      symbol: "SPRT",
      company: "Support.com Inc",
      price: 3.21,
      changePercent: 38.4,
      gap: 45.2,
      volume: 25600000,
      avgVolume: 4200000,
      marketCap: 78000000,
      float: 24000000,
      performance: 32.1,
      sector: "Technology",
      industry: "Software",
    },
    {
      symbol: "GREE",
      company: "Greenidge Generation Holdings Inc",
      price: 1.89,
      changePercent: 21.9,
      gap: 28.7,
      volume: 18900000,
      avgVolume: 7800000,
      marketCap: 156000000,
      float: 82000000,
      performance: 18.3,
      sector: "Financial Services",
      industry: "Capital Markets",
    },
  ]

  return base.map((s) => {
    const price = +(s.price + (Math.random() - 0.5) * s.price * 0.03).toFixed(2)
    const changePercent = +(s.changePercent + (Math.random() - 0.5) * 2).toFixed(2)
    return {
      ...s,
      price,
      changePercent,
      change: +(price * changePercent * 0.01).toFixed(2),
      gap: +(s.gap + (Math.random() - 0.5) * 3).toFixed(1),
      volume: Math.floor(s.volume * (0.8 + Math.random() * 0.4)),
      lastUpdated: new Date().toISOString(),
      indicators: generateIndicators(changePercent, s.volume),
    }
  })
}
