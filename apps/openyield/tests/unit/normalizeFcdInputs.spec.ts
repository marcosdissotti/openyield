import { describe, expect, it } from 'vitest'
import { normalizeFcdInputs, normalizeToThousands } from '#features/fcd-calc/lib/normalizeFcdInputs'
import { defaultFcdInputs } from '#features/fcd-calc/model/fcdTypes'

describe('normalizeFcdInputs', () => {
  it('divide valores colados em reais completos por 1000', () => {
    expect(normalizeToThousands(3_412_840_000)).toBe(3_412_840)
    expect(normalizeToThousands(1_651_950)).toBe(1_651_950)
  })

  it('preserva sinal da depreciação (CSMG3: negativa na planilha)', () => {
    const n = normalizeFcdInputs({ ...defaultFcdInputs('CSMG3'), depreciation: -777_010 })
    expect(n.depreciation).toBe(-777_010)
  })
})
