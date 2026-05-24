import type { GrahamValuationStatus } from './grahamTypes'

export const GRAHAM_NUMBER_MULTIPLIER = 22.5

export interface GrahamNumberModelInputs {
  ticker: string
  earningsPerShare: number
  bookValuePerShare: number
  currentPrice: number
}

export interface GrahamNumberModelResult {
  fairPrice: number | null
  currentPrice: number
  upside: number | null
  status: GrahamValuationStatus
  warnings: string[]
  errors: string[]
}

export function defaultGrahamNumberInputs(ticker = 'TICKER'): GrahamNumberModelInputs {
  return {
    ticker,
    earningsPerShare: 0,
    bookValuePerShare: 0,
    currentPrice: 0,
  }
}
