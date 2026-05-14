import { describe, expect, it } from 'vitest'
import { layoutMarkdownFromTextContent } from '../../src/features/extract-pdf-rich/lib/layoutMarkdownFromTextContent'

describe('layoutMarkdownFromTextContent', () => {
  it('returns TSV block for a simple 2x2 grid of positioned items', () => {
    const tc = {
      items: [
        { str: 'A', transform: [12, 0, 0, 12, 10, 700], width: 8, height: 12 },
        { str: 'B', transform: [12, 0, 0, 12, 60, 700], width: 8, height: 12 },
        { str: 'C', transform: [12, 0, 0, 12, 10, 680], width: 8, height: 12 },
        { str: 'D', transform: [12, 0, 0, 12, 60, 680], width: 8, height: 12 },
      ],
    }
    const md = layoutMarkdownFromTextContent(tc)
    expect(md).toContain('```tsv')
    expect(md).toContain('A\tB')
    expect(md).toContain('C\tD')
  })

  it('returns empty string for too few items', () => {
    expect(layoutMarkdownFromTextContent({ items: [{ str: 'x', transform: [1, 0, 0, 1, 0, 0] }] })).toBe('')
  })
})
