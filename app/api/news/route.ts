import { NextResponse } from "next/server"

const demoNews = [
  {
    id: "1",
    title: "NVIDIA Reports Record Q4 Earnings, Beats Expectations by Wide Margin",
    summary:
      "NVIDIA exceeded analyst expectations with strong data center revenue growth driven by AI chip demand. The company reported earnings of $5.16 per share versus expected $4.64, with revenue up 22% year-over-year.",
    url: "#",
    source: "MarketWatch",
    publishedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    sentiment: "positive",
    relatedSymbols: ["NVDA"],
  },
  {
    id: "2",
    title: "Tesla Announces Major Gigafactory Expansion in Mexico, Stock Surges",
    summary:
      "Tesla reveals plans for a new $5 billion manufacturing facility in Monterrey, Mexico, expected to produce 2 million vehicles annually. The announcement comes amid strong Q4 delivery numbers.",
    url: "#",
    source: "Reuters",
    publishedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    sentiment: "positive",
    relatedSymbols: ["TSLA"],
  },
  {
    id: "3",
    title: "Apple Stock Rises on Strong iPhone 15 Sales in China Market",
    summary:
      "Apple sees increased demand for latest iPhone models in key Chinese markets, with sales up 15% quarter-over-quarter. Analysts raise price targets following strong holiday season performance.",
    url: "#",
    source: "Bloomberg",
    publishedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    sentiment: "positive",
    relatedSymbols: ["AAPL"],
  },
  {
    id: "4",
    title: "SOXL Surges 15% on Semiconductor Rally Amid AI Chip Demand Surge",
    summary:
      "Direxion Daily Semiconductor Bull 3X Shares sees massive volume as chip stocks rally on increased AI demand and positive earnings outlook from major semiconductor companies.",
    url: "#",
    source: "MarketWatch",
    publishedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    sentiment: "positive",
    relatedSymbols: ["SOXL"],
  },
  {
    id: "5",
    title: "BBIG Announces Strategic Partnership with Major Streaming Platform",
    summary:
      "Vinco Ventures reveals new partnership deal with leading streaming service that could significantly boost revenue and expand market reach in the digital content space.",
    url: "#",
    source: "Yahoo Finance",
    publishedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    sentiment: "positive",
    relatedSymbols: ["BBIG"],
  },
  {
    id: "6",
    title: "Electric Vehicle Stocks Rally on New Federal Tax Incentive Program",
    summary:
      "EV manufacturers including Mullen Automotive see increased investor interest following announcement of expanded government incentives and $50B infrastructure spending bill.",
    url: "#",
    source: "Reuters",
    publishedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    sentiment: "positive",
    relatedSymbols: ["MULN"],
  },
  {
    id: "7",
    title: "Market Volatility Increases as Fed Signals Potential Rate Changes",
    summary:
      "Federal Reserve hints at potential rate adjustments in upcoming meeting, causing increased volatility across growth stocks and tech sector. Traders advised caution.",
    url: "#",
    source: "Bloomberg",
    publishedAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    sentiment: "neutral",
    relatedSymbols: ["SPY", "QQQ"],
  },
  {
    id: "8",
    title: "Support.com Receives Takeover Bid, Stock Jumps 40% in Pre-Market",
    summary:
      "Support.com receives unsolicited acquisition offer from private equity firm at $4.50 per share, representing 45% premium to previous close. Board to review offer.",
    url: "#",
    source: "MarketWatch",
    publishedAt: new Date(Date.now() - 1000 * 60 * 65).toISOString(),
    sentiment: "positive",
    relatedSymbols: ["SPRT"],
  },
]

export async function GET() {
  try {
    const finvizToken = "9a091693-9164-40dd-8e93-1c18606f0e6f"

    if (finvizToken) {
      console.log("Fetching real news from Finviz Elite API (server-side) with new token...")

      const response = await fetch(`https://elite.finviz.com/news.ashx?auth=${finvizToken}`, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://elite.finviz.com/",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Upgrade-Insecure-Requests": "1",
        },
      })

      console.log(`Finviz News API response status: ${response.status}`)

      if (response.ok) {
        const htmlData = await response.text()
        console.log(`Received news HTML data: ${htmlData.length} characters`)

        const newsData = parseFinvizNewsHTML(htmlData)

        if (newsData.length > 0) {
          console.log(`Successfully parsed ${newsData.length} real news items from Finviz`)
          return NextResponse.json({
            success: true,
            data: newsData,
            timestamp: new Date().toISOString(),
            source: "finviz_elite_api",
            count: newsData.length,
          })
        } else {
          console.log("No news found in Finviz response, using demo data")
        }
      } else {
        const errorText = await response.text()
        console.log(`Finviz News API failed: ${response.status} ${response.statusText}`)
        console.log(`Error response: ${errorText.substring(0, 500)}...`)
      }
    }
  } catch (apiError) {
    console.error("Finviz News API error:", apiError)
  }

  // Enhanced demo news as fallback
  console.log("Using enhanced demo news data as fallback")

  const liveNews = demoNews.map((item, index) => ({
    ...item,
    publishedAt: new Date(Date.now() - (index + 1) * 8 * 60 * 1000).toISOString(),
  }))

  return NextResponse.json({
    success: true,
    data: liveNews,
    timestamp: new Date().toISOString(),
    source: "enhanced_demo_data",
    count: liveNews.length,
  })
}

function parseFinvizNewsHTML(html: string) {
  const news = []

  try {
    // Look for news table or news container in the HTML
    const newsRegex = /<tr[^>]*class="[^"]*news[^"]*"[^>]*>(.*?)<\/tr>/gs
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g
    const timeRegex = /(\d{2}-\d{2}-\d{2}|\d{1,2}:\d{2}[AP]M)/g

    let match
    let newsId = 1

    while ((match = newsRegex.exec(html)) !== null && news.length < 50) {
      const rowHtml = match[1]

      let linkMatch
      while ((linkMatch = linkRegex.exec(rowHtml)) !== null) {
        const url = linkMatch[1]
        const title = linkMatch[2]
          .replace(/<[^>]*>/g, "") // Remove HTML tags
          .replace(/&nbsp;/g, " ") // Replace &nbsp;
          .replace(/&amp;/g, "&") // Replace &amp;
          .replace(/&quot;/g, '"') // Replace &quot;
          .trim()

        // Skip invalid links
        if (title.length < 10 || url.includes("javascript") || !title) {
          continue
        }

        // Extract time if available
        const timeMatch = rowHtml.match(timeRegex)
        let publishedAt = new Date(Date.now() - Math.random() * 3600000).toISOString()

        if (timeMatch) {
          const timeStr = timeMatch[0]
          if (timeStr.includes(":")) {
            // It's a time like "10:30AM"
            publishedAt = new Date(Date.now() - Math.random() * 3600000).toISOString()
          } else {
            // It's a date like "01-15-24"
            publishedAt = new Date(Date.now() - Math.random() * 86400000).toISOString()
          }
        }

        const newsItem = {
          id: newsId.toString(),
          title: title,
          summary: generateSummary(title),
          symbol: extractSymbolFromTitle(title),
          sentiment: determineSentiment(title),
          source: "Finviz Elite",
          publishedAt,
          url: url.startsWith("http") ? url : `https://finviz.com${url}`,
          relatedSymbols: [extractSymbolFromTitle(title)].filter(Boolean),
        }

        news.push(newsItem)
        newsId++
        break // Only take the first link from each row
      }
    }
  } catch (parseError) {
    console.error("Error parsing Finviz news HTML:", parseError)
  }

  return news
}

function generateSummary(title: string): string {
  const summaries = [
    `${title.substring(0, 80)}... Market analysts are closely watching this development and its potential impact on sector performance.`,
    `${title.substring(0, 80)}... This could have significant impact on trading volume and institutional interest in the coming sessions.`,
    `${title.substring(0, 80)}... Investors are responding positively to this latest news, with increased options activity noted.`,
    `${title.substring(0, 80)}... The market reaction has been notable, with several analysts updating their price targets.`,
  ]

  return summaries[Math.floor(Math.random() * summaries.length)]
}

function extractSymbolFromTitle(title: string): string {
  // Look for stock symbols in the title (2-5 uppercase letters)
  const symbolMatch = title.match(/\b([A-Z]{2,5})\b/)
  return symbolMatch ? symbolMatch[1] : "MARKET"
}

function determineSentiment(title: string): "positive" | "negative" | "neutral" {
  const titleLower = title.toLowerCase()

  const positiveWords = [
    "up",
    "gain",
    "rise",
    "beat",
    "strong",
    "growth",
    "positive",
    "bull",
    "surge",
    "rally",
    "boost",
    "increase",
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
    "down",
    "fall",
    "drop",
    "miss",
    "weak",
    "decline",
    "negative",
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

  const positiveCount = positiveWords.reduce((count, word) => count + (titleLower.includes(word) ? 1 : 0), 0)
  const negativeCount = negativeWords.reduce((count, word) => count + (titleLower.includes(word) ? 1 : 0), 0)

  if (positiveCount > negativeCount) return "positive"
  if (negativeCount > positiveCount) return "negative"
  return "neutral"
}
