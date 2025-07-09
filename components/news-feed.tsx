"use client"

import type { NewsItem } from "@/types/stock"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Newspaper } from "lucide-react"

interface NewsFeedProps {
  news?: NewsItem[]
}

export function NewsFeed({ news = [] }: NewsFeedProps) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 60) {
      return `${diffInMinutes} min ago`
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d ago`
    }
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "negative":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  const getFinvizNewsUrl = (symbol: string, title: string) => {
    // Create Finviz news search URL for the specific symbol
    return `https://finviz.com/news.ashx?t=${symbol}`
  }

  return (
    <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-white flex items-center space-x-2">
          <Newspaper className="h-5 w-5" />
          <span>Catalyst News</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {news.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No catalyst news available</p>
          </div>
        ) : (
          news.map((item) => (
            <div key={item.id} className="border-l-4 border-green-500 pl-4 pb-4 last:pb-0">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  {item.relatedSymbols.map((symbol) => (
                    <Badge key={symbol} variant="outline" className="text-xs font-semibold">
                      {symbol}
                    </Badge>
                  ))}
                  <span className="text-xs text-gray-400">
                    {formatTimeAgo(item.publishedAt)} • {item.source}
                  </span>
                </div>
              </div>
              <h3 className="text-white font-semibold text-sm mb-2 line-clamp-2">{item.title}</h3>
              <p className="text-gray-400 text-xs mb-3 line-clamp-3">{item.summary}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={`text-xs ${getSentimentColor(item.sentiment)}`}>
                  {item.sentiment}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-400 hover:text-blue-300 p-0 h-auto text-xs"
                  onClick={() => {
                    const symbol = item.relatedSymbols[0] || "SPY"
                    // If we have a real URL from the news item, use that, otherwise use Finviz news search
                    const newsUrl = item.url && item.url !== "#" ? item.url : `https://finviz.com/news.ashx?t=${symbol}`
                    window.open(newsUrl, "_blank", "noopener,noreferrer")
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Full Story →
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
