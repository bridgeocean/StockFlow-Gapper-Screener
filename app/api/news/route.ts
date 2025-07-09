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
export async function GET() {
  /* ⏩  Preview / dev – use demo immediately */
  if (IS_PREVIEW) {
    return NextResponse.json(buildEnhancedDemoNews())
  }

  // Try Alpha Vantage News API first (free tier, no key required for basic news)
  try {
    const news = await fetchAlphaVantageNews()
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
  return NextResponse.json(buildEnhancedDemoNews())
}

/**
 * Fetch news from Alpha Vantage (free tier)
 */
async function fetchAlphaVantageNews() {
  const url = "https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&limit=20&apikey=demo"

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "StockFlow-NewsBot/1.0" },
      cache: "no-store",
    })

    if (!res.ok) throw new Error(`status ${res.status}`)

    const data = await res.json().catch(() => ({}))

    /* If the response isn’t the expected shape, just return [] */
    if (!Array.isArray(data.feed)) return []

    return data.feed.slice(0, 15).map((item: any, i: number) => ({
      id: `av_${i + 1}`,
      title: item.title ?? "Market update",
      summary: item.summary ?? item.title ?? "Market news update",
      url: item.url ?? "#",
      source: item.source ?? "Alpha Vantage",
      publishedAt: item.time_published ? new Date(item.time_published).toISOString() : new Date().toISOString(),
      sentiment: mapSentiment(item.overall_sentiment_label),
      relatedSymbols: extractTickersFromText(`${item.title} ${item.summary ?? ""}`),
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
function buildEnhancedDemoNews() {
  const now = Date.now()
  const newsItems = [
    {
      title: "Federal Reserve Signals Potential Rate Cut in Next Meeting",
      summary:
        "Fed officials hint at possible interest rate reduction following recent inflation data, potentially boosting equity markets and growth stocks.",
      relatedSymbols: ["SPY", "QQQ", "IWM"],
      sentiment: "positive" as const,
    },
    {
      title: "Tech Sector Rallies on AI Infrastructure Spending Surge",
      summary:
        "Major technology companies report increased capital expenditure on AI infrastructure, driving semiconductor and cloud computing stocks higher.",
      relatedSymbols: ["NVDA", "AMD", "MSFT"],
      sentiment: "positive" as const,
    },
    {
      title: "Energy Stocks Decline Amid Oil Price Volatility",
      summary:
        "Crude oil prices fluctuate on global supply concerns, impacting energy sector performance and related equity valuations.",
      relatedSymbols: ["XOM", "CVX", "COP"],
      sentiment: "negative" as const,
    },
    {
      title: "Small-Cap Biotech Stocks See Increased M&A Activity",
      summary:
        "Several biotech companies announce acquisition deals, highlighting increased consolidation activity in the pharmaceutical sector.",
      relatedSymbols: ["XBI", "IBB", "ARKG"],
      sentiment: "positive" as const,
    },
    {
      title: "Market Volatility Increases Ahead of Earnings Season",
      summary:
        "Options activity surges as investors position for quarterly earnings reports from major corporations, increasing overall market volatility.",
      relatedSymbols: ["VIX", "SPY", "QQQ"],
      sentiment: "neutral" as const,
    },
    {
      title: "Electric Vehicle Stocks Rally on Infrastructure Bill Progress",
      summary:
        "EV manufacturers gain momentum following congressional progress on infrastructure spending that includes charging station expansion.",
      relatedSymbols: ["TSLA", "RIVN", "LCID"],
      sentiment: "positive" as const,
    },
  ]

  const data = newsItems.map((item, index) => ({
    id: `demo_${index + 1}`,
    title: item.title,
    summary: item.summary,
    url: "#",
    source: "Market Wire",
    publishedAt: new Date(now - (index + 1) * 12 * 60 * 1000).toISOString(), // Spread over last few hours
    sentiment: item.sentiment,
    relatedSymbols: item.relatedSymbols,
  }))

  return {
    success: true,
    fallback: true,
    reason: "using_enhanced_demo_news",
    source: "enhanced_demo_data",
    count: data.length,
    data,
    timestamp: new Date().toISOString(),
  }
}
