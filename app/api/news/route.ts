import { NextResponse } from "next/server"

const IS_PREVIEW = process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development"

/**
 * GET /api/news
 *
 * Fetch real market news from multiple sources:
 * 1. Alpha Vantage News API (free tier)
 * 2. NewsAPI.org (free tier)
 * 3. Fallback to enhanced demo data
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbolsParam = searchParams.get("symbols")
  const symbols = symbolsParam ? symbolsParam.split(",").filter(Boolean) : []

  /* ⏩  Preview / dev – use demo immediately */
  if (IS_PREVIEW) {
    return NextResponse.json(buildEnhancedDemoNews(symbols))
  }

  // Try Alpha Vantage News API first (free tier, no key required for basic news)
  try {
    const news = await fetchAlphaVantageNews(symbols)
    if (news.length > 0) {
      return NextResponse.json({
        success: true,
        source: "alpha_vantage_news",
        count: news.length,
        data: news,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error("[News API] Alpha Vantage error:", error)
  }

  // Try Yahoo Finance RSS as backup
  try {
    const news = await fetchYahooFinanceRSS()
    if (news.length > 0) {
      return NextResponse.json({
        success: true,
        source: "yahoo_finance_rss",
        count: news.length,
        data: news,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error("[News API] Yahoo Finance error:", error)
  }

  // Fallback to enhanced demo data
  return NextResponse.json(buildEnhancedDemoNews(symbols))
}

/**
 * Fetch news from Alpha Vantage (free tier)
 */
async function fetchAlphaVantageNews(symbols: string[] = []) {
  const symbolQuery = symbols.length > 0 ? `&tickers=${symbols.join(",")}` : ""
  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&limit=20${symbolQuery}&apikey=demo`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "StockFlow-NewsBot/1.0" },
      cache: "no-store",
    })

    if (!res.ok) throw new Error(`status ${res.status}`)

    const data = await res.json().catch(() => ({}))

    /* If the response isn't the expected shape, just return [] */
    if (!Array.isArray(data.feed)) return []

    return data.feed.slice(0, 15).map((item: any, i: number) => ({
      id: `av_${i + 1}`,
      title: item.title ?? "Market update",
      summary: item.summary ?? item.title ?? "Market news update",
      url: item.url ?? `https://finviz.com/news.ashx?t=${symbols[0] || "SPY"}`, // Use real URL or fallback to Finviz news
      source: item.source ?? "Alpha Vantage",
      publishedAt: item.time_published ? new Date(item.time_published).toISOString() : new Date().toISOString(),
      sentiment: mapSentiment(item.overall_sentiment_label),
      relatedSymbols: symbols.length > 0 ? symbols : extractTickersFromText(`${item.title} ${item.summary ?? ""}`),
    }))
  } catch (err) {
    console.error("[News API] Alpha Vantage fetch failed:", err)
    return []
  }
}

/**
 * Fetch news from Yahoo Finance RSS
 */
async function fetchYahooFinanceRSS() {
  const url = "https://feeds.finance.yahoo.com/rss/2.0/headline"

  const response = await fetch(url, {
    headers: {
      "User-Agent": "StockFlow-NewsBot/1.0",
      Accept: "application/rss+xml, text/xml",
    },
  })

  if (!response.ok) {
    throw new Error(`Yahoo Finance RSS error: ${response.status}`)
  }

  const xmlText = await response.text()
  return parseYahooRSS(xmlText)
}

/**
 * Parse Yahoo Finance RSS XML
 */
function parseYahooRSS(xml: string) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]

  return items.slice(0, 15).map(([, content], index) => {
    const getTag = (tag: string) => {
      const match = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
      return match ? match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : ""
    }

    const title = getTag("title")
    const description = getTag("description")
    const link = getTag("link")
    const pubDate = getTag("pubDate")

    return {
      id: `yf_${index + 1}`,
      title: title || "Yahoo Finance Update",
      summary: description || title || "Financial market update",
      url: link || "#",
      source: "Yahoo Finance",
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      sentiment: determineSentiment(title + " " + description),
      relatedSymbols: extractTickersFromText(title + " " + description),
    }
  })
}

/**
 * Extract stock tickers from text
 */
function extractTickersFromText(text: string): string[] {
  const tickerRegex = /\b([A-Z]{2,5})\b/g
  const matches = text.match(tickerRegex) || []

  // Filter out common false positives
  const commonWords = [
    "THE",
    "AND",
    "FOR",
    "ARE",
    "BUT",
    "NOT",
    "YOU",
    "ALL",
    "CAN",
    "HER",
    "WAS",
    "ONE",
    "OUR",
    "HAD",
    "BUT",
    "WHAT",
    "SO",
    "UP",
    "OUT",
    "IF",
    "ABOUT",
    "WHO",
    "GET",
    "WHICH",
    "GO",
    "ME",
  ]

  return [...new Set(matches.filter((ticker) => !commonWords.includes(ticker)))].slice(0, 3)
}

/**
 * Map Alpha Vantage sentiment to our format
 */
function mapSentiment(sentiment: string): "positive" | "negative" | "neutral" {
  if (!sentiment) return "neutral"

  const s = sentiment.toLowerCase()
  if (s.includes("positive") || s.includes("bullish")) return "positive"
  if (s.includes("negative") || s.includes("bearish")) return "negative"
  return "neutral"
}

/**
 * Determine sentiment from text content
 */
function determineSentiment(text: string): "positive" | "negative" | "neutral" {
  const lowerText = text.toLowerCase()

  const positiveWords = [
    "surge",
    "rise",
    "gain",
    "beat",
    "strong",
    "growth",
    "bull",
    "rally",
    "up",
    "high",
    "record",
    "profit",
    "beats",
    "exceeds",
    "announces",
    "partnership",
    "expansion",
  ]
  const negativeWords = [
    "fall",
    "drop",
    "decline",
    "miss",
    "weak",
    "bear",
    "crash",
    "loss",
    "cut",
    "reduce",
    "low",
    "warning",
    "concern",
    "fails",
    "disappoints",
    "cuts",
    "layoffs",
  ]

  const positiveCount = positiveWords.reduce((count, word) => count + (lowerText.includes(word) ? 1 : 0), 0)
  const negativeCount = negativeWords.reduce((count, word) => count + (lowerText.includes(word) ? 1 : 0), 0)

  if (positiveCount > negativeCount) return "positive"
  if (negativeCount > positiveCount) return "negative"
  return "neutral"
}

/**
 * Enhanced demo news with realistic market content
 */
function buildEnhancedDemoNews(symbols: string[] = []) {
  const now = Date.now()

  // Create catalyst news items relevant to the provided symbols
  const catalystNews =
    symbols.length > 0
      ? symbols.slice(0, 6).map((symbol, index) => {
          const catalystTypes = [
            "breakthrough announcement",
            "strong quarterly results",
            "strategic partnership",
            "FDA approval news",
            "acquisition rumors",
            "earnings beat",
          ]

          const gains = [12, 18, 24, 32, 26, 14, 19, 28, 35, 22]
          const sources = ["MarketWatch", "Financial Times", "Reuters", "Bloomberg", "Yahoo Finance"]

          const catalystType = catalystTypes[index % catalystTypes.length]
          const gain = gains[index % gains.length]
          const source = sources[index % sources.length]

          return {
            title: `${symbol} surges ${gain}% on ${catalystType}`,
            summary: `${symbol} shows strong momentum with ${gain}% gain on increased volume and positive market sentiment.`,
            relatedSymbols: [symbol],
            sentiment: "positive",
            source,
            timeOffset: (index + 1) * 15,
          }
        })
      : []

  const data = catalystNews.map((item, index) => ({
    id: `catalyst_${index + 1}`,
    title: item.title,
    summary: item.summary,
    url: `https://finviz.com/news.ashx?t=${item.relatedSymbols[0] || "SPY"}`, // Link to Finviz news page for symbol
    source: item.source,
    publishedAt: new Date(now - item.timeOffset * 60 * 1000).toISOString(),
    sentiment: item.sentiment,
    relatedSymbols: item.relatedSymbols,
  }))

  return {
    success: true,
    fallback: true,
    reason: "using_catalyst_demo_news",
    source: "catalyst_demo_data",
    count: data.length,
    data,
    timestamp: new Date().toISOString(),
  }
}
