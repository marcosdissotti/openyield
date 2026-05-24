import { describe, expect, it } from 'vitest'
import { formatFairPrice } from '#features/fcd-calc/lib/formatFcdNumber'

describe('formatFairPrice', () => {
  it('mostra valor absoluto com 2 casas decimais (CSMG3)', () => {
    expect(formatFairPrice(-23.57344641)).toBe('R$\u00a023,57')
  })
})
