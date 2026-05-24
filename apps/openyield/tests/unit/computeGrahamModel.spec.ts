import { describe, expect, it } from 'vitest'
import { computeGrahamModel } from '#features/graham-calc/lib/computeGrahamModel'
import { defaultGrahamInputs } from '#features/graham-calc/model/grahamTypes'

describe('computeGrahamModel', () => {
  it('calcula valor intrínseco do exemplo (EPS=5, crescimento=10%)', () => {
    const result = computeGrahamModel({
      ...defaultGrahamInputs('TEST'),
      earningsPerShare: 5,
      expectedGrowthRate: 10,
      growthSource: 'manual',
      currentPrice: 100,
    })

    expect(result.intrinsicValue).toBeCloseTo(142.5, 2)
    expect(result.upside).toBeCloseTo(42.5, 2)
    expect(result.status).toBe('undervalued')
  })

  it('rejeita EPS <= 0', () => {
    const result = computeGrahamModel({
      ...defaultGrahamInputs('TEST'),
      earningsPerShare: 0,
      expectedGrowthRate: 10,
      currentPrice: 100,
    })

    expect(result.intrinsicValue).toBeNull()
    expect(result.status).toBe('invalid')
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('limita crescimento a 20% e avisa quando excede', () => {
    const result = computeGrahamModel({
      ...defaultGrahamInputs('TEST'),
      earningsPerShare: 5,
      expectedGrowthRate: 30,
      currentPrice: 100,
    })

    expect(result.effectiveGrowthRate).toBe(20)
    expect(result.intrinsicValue).toBeCloseTo(242.5, 2)
    expect(result.warnings.some((w) => w.includes('20%'))).toBe(true)
  })

  it('usa CAGR histórico quando selecionado', () => {
    const result = computeGrahamModel({
      ...defaultGrahamInputs('TEST'),
      earningsPerShare: 5,
      expectedGrowthRate: 5,
      historicalCagr5y: 12,
      growthSource: 'historicalCagr5y',
      currentPrice: 160,
    })

    expect(result.intrinsicValue).toBeCloseTo(162.5, 2)
    expect(result.status).toBe('fairValue')
  })
})
