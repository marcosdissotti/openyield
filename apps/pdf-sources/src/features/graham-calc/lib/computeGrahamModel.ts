import {
  GRAHAM_FAIR_VALUE_TOLERANCE_PERCENT,
  GRAHAM_MAX_RECOMMENDED_GROWTH,
  type GrahamModelInputs,
  type GrahamModelResult,
  type GrahamValuationStatus,
} from '../model/grahamTypes'

export function computeGrahamModel(inputs: GrahamModelInputs): GrahamModelResult {
  const warnings: string[] = []
  const errors: string[] = []

  const currentPrice = inputs.currentPrice
  const rawGrowth =
    inputs.growthSource === 'historicalCagr5y'
      ? inputs.historicalCagr5y
      : inputs.expectedGrowthRate

  if (inputs.earningsPerShare <= 0) {
    errors.push('O LPA (EPS) deve ser maior que zero.')
  }

  if (rawGrowth > GRAHAM_MAX_RECOMMENDED_GROWTH) {
    warnings.push(
      `Crescimento acima de ${GRAHAM_MAX_RECOMMENDED_GROWTH}% pode distorcer o resultado. O cálculo usa ${GRAHAM_MAX_RECOMMENDED_GROWTH}% como teto.`,
    )
  }

  const effectiveGrowthRate = Math.min(Math.max(rawGrowth, 0), GRAHAM_MAX_RECOMMENDED_GROWTH)

  if (errors.length > 0) {
    return {
      intrinsicValue: null,
      currentPrice,
      upside: null,
      status: 'invalid',
      effectiveGrowthRate,
      warnings,
      errors,
    }
  }

  const intrinsicValue = inputs.earningsPerShare * (8.5 + 2 * effectiveGrowthRate)

  let upside: number | null = null
  let status: GrahamValuationStatus = 'invalid'

  if (currentPrice > 0) {
    upside = ((intrinsicValue - currentPrice) / currentPrice) * 100
    status = classifyGrahamStatus(intrinsicValue, currentPrice, upside)
  } else {
    warnings.push('Informe o preço atual para calcular upside e status.')
  }

  return {
    intrinsicValue,
    currentPrice,
    upside,
    status,
    effectiveGrowthRate,
    warnings,
    errors,
  }
}

function classifyGrahamStatus(
  intrinsicValue: number,
  currentPrice: number,
  upside: number,
): GrahamValuationStatus {
  if (Math.abs(upside) <= GRAHAM_FAIR_VALUE_TOLERANCE_PERCENT) return 'fairValue'
  if (currentPrice < intrinsicValue) return 'undervalued'
  return 'overvalued'
}

export function grahamStatusLabel(status: GrahamValuationStatus): string {
  if (status === 'undervalued') return 'Potencialmente descontada'
  if (status === 'fairValue') return 'Preço justo'
  if (status === 'overvalued') return 'Potencialmente cara'
  return 'Indefinido'
}

export function grahamStatusTone(status: GrahamValuationStatus): string {
  if (status === 'undervalued') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (status === 'fairValue') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (status === 'overvalued') return 'border-rose-200 bg-rose-50 text-rose-900'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}
