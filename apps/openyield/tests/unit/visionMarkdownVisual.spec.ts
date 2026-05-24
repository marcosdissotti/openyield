import { describe, expect, it } from 'vitest'
import { extractVisionChartJsonByPage } from '#widgets/llm-markdown-preview/lib/extractVisionChartJsonByPage'
import { stripVisionEnrichmentAppendix } from '#widgets/llm-markdown-preview/lib/stripVisionEnrichmentAppendix'
import { tryParseVisionCellNumber, visionRecordToPageVisual } from '#widgets/llm-markdown-preview/lib/visionJsonToPageVisual'

describe('stripVisionEnrichmentAppendix', () => {
  it('remove anexo de visão após ---', () => {
    const md = '## Página 1 — OCR\n\nx\n\n---\n\n## Enriquecimento por visão (LLM)\n\n### Página 1\n'
    expect(stripVisionEnrichmentAppendix(md).trim()).toBe('## Página 1 — OCR\n\nx')
  })
})

describe('extractVisionChartJsonByPage', () => {
  it('extrai JSON por página na secção Enriquecimento por visão', () => {
    const md = `
## Página 14 — texto

x

---

## Enriquecimento por visão (LLM)

### Página 14

\`\`\`json
{"pageNum":14,"chartType":"bar","labels":["A"],"datasets":[{"label":"S","data":[1]}]}
\`\`\`

### Página 16

nota

\`\`\`json
{"pageNum":16,"chartType":"table","labels":["c"],"datasets":[{"label":"r","data":["t"]}]}
\`\`\`
`
    const m = extractVisionChartJsonByPage(md)
    expect(m.size).toBe(2)
    expect((m.get(14) as { chartType?: string }).chartType).toBe('bar')
    expect((m.get(16) as { chartType?: string }).chartType).toBe('table')
  })
})

describe('tryParseVisionCellNumber', () => {
  it('interpreta percentagens e parêntesis', () => {
    expect(tryParseVisionCellNumber('-10.3%')).toBeCloseTo(-10.3)
    expect(tryParseVisionCellNumber('(74.135)')).toBeCloseTo(-74.135)
    expect(tryParseVisionCellNumber('533.658')).toBeCloseTo(533.658)
  })
})

describe('visionRecordToPageVisual', () => {
  it('prefere tabela quando densidade numérica é baixa', () => {
    const v = visionRecordToPageVisual(16, {
      pageNum: 16,
      chartType: 'none',
      title: '',
      labels: ['a'],
      datasets: [{ label: 'L', data: ['texto longo sem número'] }],
    })
    expect(v?.kind).toBe('table')
  })
})
