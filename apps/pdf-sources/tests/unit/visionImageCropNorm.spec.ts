import { describe, expect, it } from 'vitest'
import {
  visionImageCropNormForPage,
  VISION_MIXED_PAGE_CHART_TOP_FRACTION,
} from '#features/llama-vision-enrich/lib/visionImageCropNorm'

describe('visionImageCropNormForPage', () => {
  it('devolve recorte superior quando há gráfico + companionTables', () => {
    const rows = ['Métrica\tA\tB']
    for (let i = 0; i < 11; i++) {
      rows.push(`Ligações (1.000 unidades) descr ${i}\t${1000 + i}\t${2000 + i}`)
    }
    const md = `## Página 2 — texto extraído

1.2. Inadimplência
Mar/24 3,03 Dez/24 2,92 Mar/25 2,86

## Página 2 — layout (tabela aproximada)

\`\`\`tsv
${rows.join('\n')}
\`\`\`
`
    const norm = visionImageCropNormForPage(md, 2)
    expect(norm).toEqual({ x: 0, y: 0, w: 1, h: VISION_MIXED_PAGE_CHART_TOP_FRACTION })
  })

  it('devolve null para página só com gráfico OCR (sem tabelas de layout)', () => {
    const md = `## Página 1 — OCR

Região	Valor
Norte	120
Sul	95
`
    expect(visionImageCropNormForPage(md, 1)).toBeNull()
  })
})
