import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, BarChart3, Zap, Shield, ArrowRight, DollarSign, Target, Lock } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-green-400" />
              <h1 className="text-2xl font-bold text-white">StockFlow Initiative</h1>
              <span className="text-sm text-gray-400">by ThePhDPush</span>
            </div>
            <div className="flex items-center space-x-3">
              <Link href="/login">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent">
                  <Lock className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
              </Link>
              <Link href="/request-access">
                <Button className="bg-green-600 hover:bg-green-700 text-white">
                  Request Access
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <Badge variant="secondary" className="mb-4 bg-green-500/20 text-green-400">
            Professional Gap Scanner - Access Required
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            Find Gap Opportunities
            <span className="block text-green-400">Before They Move</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
            Advanced stock scanner powered by real-time Finviz Elite data to identify gap-up opportunities with
            institutional-grade filtering and analysis tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/request-access">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8 py-3">
                Request Access
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10 text-lg px-8 py-3 bg-transparent"
              >
                <Lock className="h-5 w-5 mr-2" />
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Access Notice */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <Card className="bg-yellow-500/10 border-yellow-500/30 backdrop-blur-sm max-w-4xl mx-auto">
            <CardContent className="p-8 text-center">
              <Lock className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-4">Professional Access Required</h2>
              <p className="text-gray-300 mb-6">
                StockFlow Initiative is a professional-grade gap scanner designed for experienced traders and
                institutions. Access is granted on an approval basis to ensure responsible use of our real-time market
                data and advanced tools.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="font-semibold text-white mb-2">✅ Who Gets Access</h3>
                  <p className="text-gray-400">
                    Professional traders, institutions, and experienced investors with proven track records
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="font-semibold text-white mb-2">⚡ Review Process</h3>
                  <p className="text-gray-400">Applications reviewed within 24-48 hours by our team</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="font-semibold text-white mb-2">🔒 Secure Platform</h3>
                  <p className="text-gray-400">Enterprise-grade security with real-time Finviz Elite integration</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Powerful Scanning Features</h2>
            <p className="text-xl text-gray-300">Everything you need to identify profitable gap opportunities</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-green-400" />
                  </div>
                  <CardTitle className="text-white">Real-Time Gap Detection</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Instantly identify stocks gapping up with customizable percentage thresholds and volume confirmation.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-blue-400" />
                  </div>
                  <CardTitle className="text-white">Advanced Filtering</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Filter by price range, volume multipliers, float size, and performance metrics to find your ideal
                  setups.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Zap className="h-6 w-6 text-purple-400" />
                  </div>
                  <CardTitle className="text-white">Finviz Elite Integration</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Direct integration with Finviz Elite API for real-time market data and professional-grade screening.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Target className="h-6 w-6 text-yellow-400" />
                  </div>
                  <CardTitle className="text-white">Smart Indicators</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Visual indicators for hot stocks, momentum plays, and news catalysts to prioritize your watchlist.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <DollarSign className="h-6 w-6 text-red-400" />
                  </div>
                  <CardTitle className="text-white">Volume Analysis</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Analyze relative volume patterns and ratios to confirm breakout potential and institutional interest.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <Shield className="h-6 w-6 text-orange-400" />
                  </div>
                  <CardTitle className="text-white">Risk Management</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Built-in risk indicators and float analysis to help you manage position sizing and risk exposure.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Card className="bg-gradient-to-r from-green-900/80 to-blue-900/80 border-white/20 backdrop-blur-sm">
            <CardContent className="p-12 text-center">
              <h2 className="text-4xl font-bold text-white mb-4">Ready to Access Professional Gap Scanning?</h2>
              <p className="text-xl text-gray-300 mb-8">
                Join experienced traders using our professional-grade gap scanner powered by Finviz Elite
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/request-access">
                  <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8 py-3">
                    <TrendingUp className="mr-2 h-5 w-5" />
                    Request Access
                  </Button>
                </Link>
                <Link href="/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10 text-lg px-8 py-3 bg-transparent"
                  >
                    <Lock className="mr-2 h-5 w-5" />
                    Sign In
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/20 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4 text-center">
          <div className="text-gray-400">
            © 2024 StockFlow Initiative by ThePhDPush. Professional gap scanning tools.
          </div>
        </div>
      </footer>
    </div>
  )
}
