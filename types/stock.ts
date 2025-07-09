export interface Stock {
  symbol: string
  company: string
  price: number
  change: number
  changePercent: number
  volume: number
  avgVolume: number
  marketCap: number
  float: number
  gap: number
  performance: number
  sector: string
  industry: string
  indicators: StockIndicator[]
  lastUpdated: string
}

export interface StockIndicator {
  type: "hot" | "momentum" | "catalyst" | "risk"
  icon: string
  label: string
  color: string
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  url: string
  source: string
  publishedAt: string
  sentiment: "positive" | "negative" | "neutral"
  relatedSymbols: string[]
}

export interface StockFilters {
  priceRange: [number, number]
  volumeMultiplier: number
  gapPercent: number
  performance: number
  floatMax: number
  newsCatalyst?: boolean // Add news catalyst filter
}
