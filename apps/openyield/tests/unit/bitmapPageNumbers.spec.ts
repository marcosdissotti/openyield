import { describe, expect, it } from 'vitest'
import { bitmapPageNumbersFromFlags } from '#features/extract-pdf-rich/lib/bitmapPageNumbers'

describe('bitmapPageNumbersFromFlags', () => {
  it('lista índices 1-based onde o flag é true', () => {
    expect(bitmapPageNumbersFromFlags([false, true, false, true])).toEqual([2, 4])
    expect(bitmapPageNumbersFromFlags([])).toEqual([])
  })
})
