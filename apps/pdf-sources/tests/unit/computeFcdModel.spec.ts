import { describe, expect, it } from 'vitest'
import { computeFcdModel } from '#features/fcd-calc/lib/computeFcdModel'
import { defaultFcdInputs } from '#features/fcd-calc/model/fcdTypes'

describe('computeFcdModel', () => {
  it('replica CBAV3 / Cielo (preço justo ≈ R$ 20,45)', () => {
    const r = computeFcdModel(defaultFcdInputs('CBAV3'))
    const v = r.values
    expect(v.fcl!.value).toBeCloseTo(2_434_559, 0)
    expect(v.fairPricePerShare!.value).toBeCloseTo(20.4522, 2)
  })

  it('normaliza valores colados do Status Invest (÷1000)', () => {
    const r = computeFcdModel({
      ...defaultFcdInputs('CBAV3'),
      ebit: -1_381_380_000,
      equity: 5_323_480_000,
      totalLiabilities: 12_274_710_000,
    })
    expect(r.values.fairPricePerShare!.value).toBeCloseTo(20.4522, 2)
  })

  it('replica folha CSMG3 da planilha (valores literais)', () => {
    const r = computeFcdModel(defaultFcdInputs('CSMG3'))
    const v = r.values
    expect(v.noPat!.value).toBeCloseTo(1_090_287, 0)
    expect(v.varCg!.value).toBeCloseTo(-139_920, 0)
    expect(v.fcl!.value).toBeCloseTo(-1_376_643, 0)
    expect(v.we!.value).toBeCloseTo(0.550017021, 6)
    expect(v.ke!.value).toBeCloseTo(9.69158, 4)
    expect(v.wacc!.value).toBeCloseTo(0.1087432426, 8)
    expect(v.year1!.value).toBeCloseTo(-1_241_624.704, 1)
    expect(v.year2!.value).toBeCloseTo(-1_084_555.478, 1)
    expect(v.year3!.value).toBeCloseTo(-854_441.2647, 1)
    expect(v.terminal!.value).toBeCloseTo(-5_783_253.897, 1)
    expect(v.enterpriseValue!.value).toBeCloseTo(-8_963_875_344, 0)
    expect(v.fairPricePerShare!.value).toBeCloseTo(-23.57344641, 4)
  })
})
