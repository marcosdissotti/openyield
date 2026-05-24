import { describe, expect, it } from 'vitest'
import { computeGrahamNumberModel } from '#features/graham-calc/lib/computeGrahamNumberModel'
import { defaultGrahamNumberInputs } from '#features/graham-calc/model/grahamNumberTypes'

describe('computeGrahamNumberModel', () => {
  it('calcula preço justo do exemplo BR (LPA=3,56, VPA=23,06)', () => {
    const result = computeGrahamNumberModel({
      ...defaultGrahamNumberInputs('TEST'),
      earningsPerShare: 3.56,
      bookValuePerShare: 23.06,
      currentPrice: 40,
    })

    expect(result.fairPrice).toBeCloseTo(42.98, 1)
    expect(result.status).toBe('undervalued')
  })

  it('rejeita LPA ou VPA <= 0', () => {
    const result = computeGrahamNumberModel({
      ...defaultGrahamNumberInputs('TEST'),
      earningsPerShare: 0,
      bookValuePerShare: 10,
    })

    expect(result.fairPrice).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
