"use client"

import type { NewsItem } from "@/types/stock"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Newspaper, Clock } from "lucide-react"

interface NewsFeedProps {
  news?: NewsItem[]
}

export function NewsFeed({ news = [] }: NewsFeedProps) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`
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

  return (
    <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-white flex items-center space-x-2">
          <Newspaper className="h-5 w-5" />
          <span>Live Market News</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {news.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No news available</p>
          </div>
        ) : (
          news.map((item) => (
            <div key={item.id} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {item.relatedSymbols.map((symbol) => (
                    <Badge key={symbol} variant="outline" className="text-xs">
                      {symbol}
                    </Badge>
                  ))}
                  <Badge variant="outline" className={`text-xs ${getSentimentColor(item.sentiment)}`}>
                    {item.sentiment}
                  </Badge>
                </div>
                <div className="flex items-center text-xs text-gray-400">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatTimeAgo(item.publishedAt)}
                </div>
              </div>
              <h3 className="text-white font-semibold text-sm mb-2 line-clamp-2">{item.title}</h3>
              <p className="text-gray-400 text-xs mb-3 line-clamp-3">{item.summary}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Source: {item.source}</span>
                <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 p-0 h-auto">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Read More
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
