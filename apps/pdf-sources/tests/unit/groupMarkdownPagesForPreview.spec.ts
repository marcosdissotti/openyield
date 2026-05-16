import { describe, expect, it } from 'vitest'
import { groupMarkdownPagesForPreview } from '#widgets/llm-markdown-preview/lib/groupMarkdownPagesForPreview'

describe('groupMarkdownPagesForPreview', () => {
  it('agrupa por página e ordena texto → layout → OCR', () => {
    const md = `## Página 1 — OCR

x

## Página 1 — texto extraído

a

## Página 1 — layout (tabela aproximada)

\`\`\`tsv
A\tB
1\t2
\`\`\`
`
    const g = groupMarkdownPagesForPreview(md)
    expect(g.mode).toBe('structured')
    if (g.mode !== 'structured') return
    expect(g.pages).toHaveLength(1)
    expect(g.pages[0]!.pageNum).toBe(1)
    const titles = g.pages[0]!.sections.map((s) => s.title)
    expect(titles).toEqual(['Texto extraído', 'Layout (tabela aproximada)', 'OCR'])
  })

  it('modo single quando não há cabeçalhos de página', () => {
    const g = groupMarkdownPagesForPreview('# Só título\n\nOlá.')
    expect(g.mode).toBe('single')
  })
})
