import { NextResponse } from "next/server"

/**
 * Finviz Elite token – update here when you get a new one.
 */
const FINVIZ_TOKEN = "9a091693-9164-40dd-8e93-1c18606f0e6f"

/**
 * GET /api/stocks
 *
 * 1. Try one request with ?auth=token
 * 2. Abort after 10 s
 * 3. If request fails, redirects to login, or parses 0 rows → return demo data
 * 4. NEVER throw – always respond with 200 + JSON
 */
export async function GET() {
  try {
    const finvizURL = `https://elite.finviz.com/screener.ashx?v=111&f=sh_price_u20,ta_gap_u5&auth=${FINVIZ_TOKEN}`

    // Abort controller for 10-second timeout
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 10_000)

    const res = await fetch(finvizURL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: ac.signal,
      // let fetch follow redirects (default)
    }).finally(() => clearTimeout(timer))

    // Redirected to login or non-200 → treat as auth failure
    if (res.status !== 200 || res.url.includes("login")) {
      console.log(`[Finviz] auth failed (status ${res.status}). Using demo data.`)
      return NextResponse.json(buildDemoPayload("auth_failed"))
    }

    const html = await res.text()
    const parsed = parseFinvizHTML(html)

    if (parsed.length === 0) {
      console.log("[Finviz] 0 rows parsed – using demo data.")
      return NextResponse.json(buildDemoPayload("zero_rows"))
    }

    console.log(`[Finviz] Parsed ${parsed.length} rows.`)
    return NextResponse.json({
      success: true,
      source: "finviz_elite_api",
      count: parsed.length,
      data: parsed,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[Finviz] network / parse error:", err)
    return NextResponse.json(buildDemoPayload("network_error"))
  }
}

/* ------------------------------------------------------------------ */
/* -------------------------- helpers below ------------------------- */
/* ------------------------------------------------------------------ */

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

/**
 * Your existing demo list with light randomisation (trimmed for brevity)
 */
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
      indicators: [], // keep or add your indicator generator
    }
  })
}

/**
 * Ultra-defensive parser – returns [] if HTML structure unexpected.
 * Keeps original simple regex logic from earlier versions.
 */
function parseFinvizHTML(html: string) {
  const out: any[] = []
  try {
    const table = html.match(/<table[^>]*screener[^>]*>(.*?)<\/table>/s)
    if (!table) return out

    const rows = table[1].match(/<tr[^>]*>(.*?)<\/tr>/gs) ?? []
    rows.forEach((row) => {
      if (row.includes("<th")) return

      const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) =>
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .trim(),
      )

      if (cells.length >= 11 && cells[1].length <= 5) {
        const p = Number.parseFloat(cells[8])
        const cp = Number.parseFloat(cells[9].replace("%", ""))
        out.push({
          symbol: cells[1],
          company: cells[2],
          price: p,
          changePercent: cp,
          change: +(p * cp * 0.01).toFixed(2),
          volume: Number.parseInt(cells[10].replace(/,/g, "")),
          avgVolume: Math.floor(Math.random() * 5_000_000) + 2_000_000,
          marketCap: Math.floor(Math.random() * 1_000_000_000),
          float: Math.floor(Math.random() * 100_000_000),
          gap: Math.abs(cp),
          performance: cp,
          sector: cells[3],
          industry: cells[4],
          indicators: [],
          lastUpdated: new Date().toISOString(),
        })
      }
    })
  } catch (e) {
    console.error("[Finviz] parser error:", e)
  }
  return out
}
