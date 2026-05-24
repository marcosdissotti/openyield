import { GRAHAM_FAIR_VALUE_TOLERANCE_PERCENT } from '../model/grahamTypes'
import {
  GRAHAM_NUMBER_MULTIPLIER,
  type GrahamNumberModelInputs,
  type GrahamNumberModelResult,
} from '../model/grahamNumberTypes'
import { grahamStatusLabel, grahamStatusTone } from './computeGrahamModel'
import type { GrahamValuationStatus } from '../model/grahamTypes'

export { grahamStatusLabel, grahamStatusTone }

export function computeGrahamNumberModel(inputs: GrahamNumberModelInputs): GrahamNumberModelResult {
  const warnings: string[] = []
  const errors: string[] = []
  const currentPrice = inputs.currentPrice

  if (inputs.earningsPerShare <= 0) {
    errors.push('O LPA (EPS) deve ser maior que zero.')
  }
  if (inputs.bookValuePerShare <= 0) {
    errors.push('O VPA deve ser maior que zero.')
  }

  if (errors.length > 0) {
    return {
      fairPrice: null,
      currentPrice,
      upside: null,
      status: 'invalid',
      warnings,
      errors,
    }
  }

  const fairPrice = Math.sqrt(
    GRAHAM_NUMBER_MULTIPLIER * inputs.earningsPerShare * inputs.bookValuePerShare,
  )

  let upside: number | null = null
  let status: GrahamValuationStatus = 'invalid'

  if (currentPrice > 0) {
    upside = ((fairPrice - currentPrice) / currentPrice) * 100
    if (Math.abs(upside) <= GRAHAM_FAIR_VALUE_TOLERANCE_PERCENT) status = 'fairValue'
    else if (currentPrice < fairPrice) status = 'undervalued'
    else status = 'overvalued'
  } else {
    warnings.push('Informe o preço atual para calcular upside e status.')
  }

  return {
    fairPrice,
    currentPrice,
    upside,
    status,
    warnings,
    errors,
  }
}
