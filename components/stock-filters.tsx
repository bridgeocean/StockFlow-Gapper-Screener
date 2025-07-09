"use client"

import type { StockFilters } from "@/types/stock"

interface StockFiltersProps {
  filters: StockFilters
  onFiltersChange: (filters: StockFilters) => void
}

export function StockFiltersComponent({ filters, onFiltersChange }: StockFiltersProps) {
  const handlePriceRangeChange = (min: number, max: number) => {
    onFiltersChange({ ...filters, priceRange: [min, max] })
  }

  const handleVolumeMultiplierChange = (value: number) => {
    onFiltersChange({ ...filters, volumeMultiplier: value })
  }

  const handleGapPercentChange = (value: number) => {
    onFiltersChange({ ...filters, gapPercent: value })
  }

  const handlePerformanceChange = (value: number) => {
    onFiltersChange({ ...filters, performance: value })
  }

  const handleFloatMaxChange = (value: number) => {
    onFiltersChange({ ...filters, floatMax: value })
  }

  const resetFilters = () => {
    onFiltersChange({
      priceRange: [0.1, 20],
      volumeMultiplier: 1,
      gapPercent: 1,
      performance: 0,
      floatMax: 100,
    })
  }

  const showAllStocks = () => {
    onFiltersChange({
      priceRange: [0.01, 20],
      volumeMultiplier: 0.1,
      gapPercent: 0,
      performance: -100,
      floatMax: 1000,
    })
  }

  return (
    <div className="bg-black/40 border border-white/10 rounded-lg p-4">
      <div className="flex items-center space-x-2 mb-4">
        <span className="text-xl">🔍</span>
        <h2 className="text-xl font-bold text-white">Gap Scanner Filters</h2>
      </div>

      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex flex-col space-y-2">
          <button
            onClick={showAllStocks}
            className="w-full px-4 py-2 bg-transparent border border-white/20 text-white rounded hover:bg-white/10"
          >
            Show All Stocks
          </button>
          <button
            onClick={resetFilters}
            className="w-full px-4 py-2 bg-transparent text-white rounded hover:bg-white/10 flex items-center justify-center"
          >
            <span className="mr-2">🔄</span>
            Reset Filters
          </button>
        </div>

        {/* Price Range */}
        <div className="space-y-3">
          <label className="text-gray-300 block">
            Price Range: ${filters.priceRange[0]} - ${filters.priceRange[1] >= 20 ? "20+" : filters.priceRange[1]}
          </label>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-400">Min Price: ${filters.priceRange[0]}</label>
              <input
                type="range"
                min="0.01"
                max="20"
                step="0.01"
                value={filters.priceRange[0]}
                onChange={(e) => handlePriceRangeChange(Number.parseFloat(e.target.value), filters.priceRange[1])}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Max Price: ${filters.priceRange[1]}</label>
              <input
                type="range"
                min="0.01"
                max="20"
                step="0.01"
                value={filters.priceRange[1]}
                onChange={(e) => handlePriceRangeChange(filters.priceRange[0], Number.parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Volume Multiplier */}
        <div className="space-y-3">
          <label className="text-gray-300 block">Volume Multiplier: {filters.volumeMultiplier}x+</label>
          <input
            type="range"
            min="0.1"
            max="20"
            step="0.1"
            value={filters.volumeMultiplier}
            onChange={(e) => handleVolumeMultiplierChange(Number.parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Gap Percentage */}
        <div className="space-y-3">
          <label className="text-gray-300 block">Gap Percentage: {filters.gapPercent}%+</label>
          <input
            type="range"
            min="0"
            max="50"
            step="0.1"
            value={filters.gapPercent}
            onChange={(e) => handleGapPercentChange(Number.parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Performance */}
        <div className="space-y-3">
          <label className="text-gray-300 block">Performance: {filters.performance}%+</label>
          <input
            type="range"
            min="-50"
            max="100"
            step="1"
            value={filters.performance}
            onChange={(e) => handlePerformanceChange(Number.parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Float Max */}
        <div className="space-y-3">
          <label className="text-gray-300 block">Float Max: {filters.floatMax}M</label>
          <input
            type="range"
            min="1"
            max="1000"
            step="1"
            value={filters.floatMax}
            onChange={(e) => handleFloatMaxChange(Number.parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
