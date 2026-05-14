import { describe, expect, it } from 'vitest'
import { selectPagesForVisionEnrich } from '#features/llama-vision-enrich/lib/selectPagesForVisionEnrich'

describe('selectPagesForVisionEnrich', () => {
  it('returns page numbers only for chart mode (skips pages sem gráfico no mapa)', () => {
    const mdChart = `# x

## Página 1 — texto extraído

ok

## Página 1 — OCR

Região	Valor
Norte	120
Sul	95
`
    expect(selectPagesForVisionEnrich(mdChart)).toContain(1)

    const mdTextOnly = `# doc

## Página 1 — texto extraído

Só texto — sem OCR nem layout que dispare gráfico no preview.
`
    expect(selectPagesForVisionEnrich(mdTextOnly)).toEqual([])

    const rows = ['Métrica\tA\tB']
    for (let i = 0; i < 11; i++) {
      rows.push(`Ligações (1.000 unidades) descr ${i}\t${1000 + i}\t${2000 + i}`)
    }
    const mdWideLayoutTable = `## Página 4 — texto extraído

x

## Página 4 — layout (tabela aproximada)

\`\`\`tsv
${rows.join('\n')}
\`\`\`
`
    expect(selectPagesForVisionEnrich(mdWideLayoutTable)).not.toContain(4)
  })
})
