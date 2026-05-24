export type GrahamValuationStatus = 'undervalued' | 'fairValue' | 'overvalued' | 'invalid'

export type GrahamGrowthSource = 'manual' | 'historicalCagr5y'

export interface GrahamModelInputs {
  ticker: string
  earningsPerShare: number
  expectedGrowthRate: number
  historicalCagr5y: number
  growthSource: GrahamGrowthSource
  currentPrice: number
}

export interface GrahamModelResult {
  intrinsicValue: number | null
  currentPrice: number
  upside: number | null
  status: GrahamValuationStatus
  effectiveGrowthRate: number
  warnings: string[]
  errors: string[]
}

export const GRAHAM_MAX_RECOMMENDED_GROWTH = 20
export const GRAHAM_FAIR_VALUE_TOLERANCE_PERCENT = 5

export function defaultGrahamInputs(ticker = 'TICKER'): GrahamModelInputs {
  return {
    ticker,
    earningsPerShare: 0,
    expectedGrowthRate: 0,
    historicalCagr5y: 0,
    growthSource: 'manual',
    currentPrice: 0,
  }
}
