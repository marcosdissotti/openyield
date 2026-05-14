import { describe, expect, it } from 'vitest'
import {
  extractOcrSectionBodies,
  extractPageSectionBodies,
} from '../../src/widgets/chart-reconstruct/lib/extractOcrSectionsFromMarkdown'
import { tryBuildAllChartReconstructions } from '../../src/widgets/chart-reconstruct/lib/tryBuildAllOcrChartReconstructions'
import { buildPagePreviewVisualMap } from '../../src/widgets/chart-reconstruct/lib/buildPagePreviewVisualMap'
import {
  tryBuildChartFromTabularBody,
  tryBuildChartReconstructionFromOcrBody,
  tryBuildLooseTimeSeriesChart,
} from '../../src/widgets/chart-reconstruct/lib/tryBuildChartReconstructionFromOcrBody'

describe('OCR chart reconstruction', () => {
  it('extracts OCR bodies from markdown', () => {
    const md = `# x\n\n## Página 2 — texto\n\nHi\n\n## Página 2 — OCR\n\nA\t10\t20\nB\t11\t21\n\n## Página 3 — texto\n\n`
    const bodies = extractOcrSectionBodies(md)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]!.pageNum).toBe(2)
    expect(bodies[0]!.body).toContain('A')
  })

  it('extracts layout section bodies', () => {
    const md = `## Página 5 — layout (tabela aproximada)\n\n\`\`\`tsv\nPeríodo\t%\nMar/24\t3,03\n\`\`\`\n\n## Página 6 — OCR\n\nx`
    const bodies = extractPageSectionBodies(md, 'layout')
    expect(bodies).toHaveLength(1)
    expect(bodies[0]!.pageNum).toBe(5)
    expect(bodies[0]!.body).toContain('tsv')
  })

  it('builds line chart when first column looks like periods', () => {
    const body = `Dez/22\t100\t0\t0\nDez/23\t62\t38\t0\nMar/26\t21\t60\t19`
    const cfg = tryBuildChartReconstructionFromOcrBody(7, body)
    expect(cfg).not.toBeNull()
    expect(cfg!.chartKind).toBe('line')
    expect(cfg!.labels.length).toBe(3)
    expect(cfg!.datasets.length).toBe(3)
    expect(cfg!.datasets[0]!.data[0]).toBe(100)
  })

  it('builds bar chart for categorical first column', () => {
    const body = `Região\tValor\nNorte\t120\nSul\t95`
    const cfg = tryBuildChartReconstructionFromOcrBody(1, body)
    expect(cfg).not.toBeNull()
    expect(cfg!.chartKind).toBe('bar')
  })

  it('builds loose line series from scattered Mês/AA + decimals (inadimplência)', () => {
    const body = `1.2. Inadimplência\nMar/24 lixo 3,03 e depois Dez/24 2,92 Mar/25 2,86 Dez/25 2,91 Mar/26 3,09 fim`
    const cfg = tryBuildLooseTimeSeriesChart(5, body, 'texto')
    expect(cfg).not.toBeNull()
    expect(cfg!.chartKind).toBe('line')
    expect(cfg!.datasets[0]!.label).toBe('Inadimplência (%)')
    expect(cfg!.labels).toContain('Mar/24')
    expect(cfg!.datasets[0]!.data).toEqual([3.03, 2.92, 2.86, 2.91, 3.09])
  })

  it('builds multi-line percent chart (energia) from loose anchors', () => {
    const body = `1.5 Energia elétrica Mercado Cativo Mercado Livre Energia Fotovoltaica
Dez/22 100 0 0 Dez/23 62 38 0 Dez/24 40 46 13 Dez/25 27 55 19 Mar/26 21 60 19`
    const cfg = tryBuildLooseTimeSeriesChart(7, body, 'texto')
    expect(cfg).not.toBeNull()
    expect(cfg!.chartKind).toBe('line')
    expect(cfg!.labels).toEqual(['Dez/22', 'Dez/23', 'Dez/24', 'Dez/25', 'Mar/26'])
    expect(cfg!.datasets).toHaveLength(3)
    expect(cfg!.datasets[0]!.label).toBe('Mercado Cativo')
    expect(cfg!.datasets[0]!.data).toEqual([100, 62, 40, 27, 21])
    expect(cfg!.datasets[1]!.data).toEqual([0, 38, 46, 55, 60])
    expect(cfg!.datasets[2]!.label).toBe('Energia Fotovoltaica')
  })

  it('does not treat wide reporting TSV as chart', () => {
    const rows = ['Métrica (1.000 unidades)\tV1\tV2']
    for (let i = 0; i < 11; i++) {
      rows.push(`Ligações população atendida (habitantes) linha ${i}\t${120000 + i}\t${130000 + i}`)
    }
    const body = '```tsv\n' + rows.join('\n') + '\n```'
    expect(tryBuildChartFromTabularBody(4, body, 'layout')).toBeNull()
  })

  it('builds loose energy chart with 1T/YY anchors and Geração Própria', () => {
    const body = `1.5 Energia Mercado Cativo Mercado Livre Geração Própria
1T/22 100 0 0 1T/23 62 38 0 1T/24 40 46 14 1T/25 27 55 19 1T/26 21 60 19`
    const cfg = tryBuildLooseTimeSeriesChart(7, body, 'OCR')
    expect(cfg).not.toBeNull()
    expect(cfg!.labels).toEqual(['1T/22', '1T/23', '1T/24', '1T/25', '1T/26'])
    expect(cfg!.datasets[2]!.label).toBe('Geração Própria')
  })

  it('preview map uses table when layout is not chartable', () => {
    const rows = ['Métrica\tA\tB']
    for (let i = 0; i < 11; i++) {
      rows.push(`Ligações (1.000 unidades) descr ${i}\t${1000 + i}\t${2000 + i}`)
    }
    const md = `## Página 4 — texto extraído\n\nx\n\n## Página 4 — layout (tabela aproximada)\n\n\`\`\`tsv\n${rows.join('\n')}\n\`\`\`\n`
    const vis = buildPagePreviewVisualMap(md).get(4)
    expect(vis?.mode).toBe('table')
    expect(vis && vis.mode === 'table' && vis.tables[0]!.rows.length).toBeGreaterThanOrEqual(2)
  })

  it('aggregates best chart per page from layout TSV', () => {
    const md = `## Página 5 — layout (tabela aproximada)

\`\`\`tsv
Período\tInadimplência
Mar/24\t3,03
Dez/24\t2,92
Mar/25\t2,86
Dez/25\t2,91
Mar/26\t3,09
\`\`\`

## Página 5 — texto extraído

1.2. Inadimplência texto só.
`
    const cfgs = tryBuildAllChartReconstructions(md)
    const p5 = cfgs.filter((c) => c.pageNum === 5)
    expect(p5).toHaveLength(1)
    expect(p5[0]!.chartKind).toBe('line')
    expect(p5[0]!.labels.length).toBe(5)
  })
})
