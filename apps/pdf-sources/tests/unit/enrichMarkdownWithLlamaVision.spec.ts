import { describe, expect, it, vi, afterEach } from 'vitest'
import { enrichMarkdownWithLlamaVision } from '#features/llama-vision-enrich/lib/enrichMarkdownWithLlamaVision'

vi.mock('#features/llama-runtime/lib/llamaRuntimeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#features/llama-runtime/lib/llamaRuntimeApi')>()
  return {
    ...actual,
    chatCompletion: vi.fn(async () => ({
      text: '{"pageNum":1,"charts":[]}',
      raw: {},
    })),
  }
})

vi.mock('#features/extract-pdf-rich/lib/renderPdfPageToPng', () => ({
  renderPdfPageToPng: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
  renderPdfPageRegionToPng: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
}))

const mdWithChartPage1 = `# t.pdf

## Página 1 — texto extraído

x

## Página 1 — OCR

Região	Valor
Norte	120
Sul	95
`

describe('enrichMarkdownWithLlamaVision', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('vision: gráfico OCR ou lista bitmap; só texto sem bitmap não chama VL', async () => {
    const { chatCompletion } = await import('#features/llama-runtime/lib/llamaRuntimeApi')
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 400])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('Hi', { x: 50, y: 350, size: 12, font })
    const bytes = await doc.save()
    const file = new File([bytes], 'tiny.pdf', { type: 'application/pdf' })

    const out = await enrichMarkdownWithLlamaVision(file, mdWithChartPage1, {
      baseUrl: 'http://127.0.0.1:9',
      model: 'llava-test.gguf',
      onProgress: vi.fn(),
    })
    expect(out).toContain('## Enriquecimento por visão')
    expect(chatCompletion).toHaveBeenCalledTimes(1)

    vi.mocked(chatCompletion).mockClear()

    const outNoChartPages = await enrichMarkdownWithLlamaVision(
      file,
      `# doc

## Página 1 — texto extraído

Apenas texto — nenhuma página entra como \`mode: chart\` no mapa de preview.
`,
      {
        baseUrl: 'http://127.0.0.1:9',
        model: 'llava-test.gguf',
        onProgress: vi.fn(),
      },
    )
    expect(outNoChartPages).toContain('## Enriquecimento por visão')
    expect(outNoChartPages).toContain('Nenhuma página candidata')
    expect(chatCompletion).not.toHaveBeenCalled()

    vi.mocked(chatCompletion).mockClear()

    await enrichMarkdownWithLlamaVision(
      file,
      `# doc

## Página 1 — texto extraído

Só texto.
`,
      {
        baseUrl: 'http://127.0.0.1:9',
        model: 'llava-test.gguf',
        onProgress: vi.fn(),
        bitmapPageNumbers: [1],
      },
    )
    expect(chatCompletion).toHaveBeenCalledTimes(1)
  })

  it('página com gráfico + tabela de layout usa renderPdfPageRegionToPng', async () => {
    const { chatCompletion } = await import('#features/llama-runtime/lib/llamaRuntimeApi')
    const { renderPdfPageToPng, renderPdfPageRegionToPng } = await import(
      '#features/extract-pdf-rich/lib/renderPdfPageToPng'
    )
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 400])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('Hi', { x: 50, y: 350, size: 12, font })
    const bytes = await doc.save()
    const file = new File([bytes], 'tiny.pdf', { type: 'application/pdf' })

    const rows = ['Métrica\tA\tB']
    for (let i = 0; i < 11; i++) {
      rows.push(`Ligações (1.000 unidades) descr ${i}\t${1000 + i}\t${2000 + i}`)
    }
    const mdMixed = `## Página 1 — texto extraído

1.2. Inadimplência
Mar/24 3,03 Dez/24 2,92 Mar/25 2,86

## Página 1 — layout (tabela aproximada)

\`\`\`tsv
${rows.join('\n')}
\`\`\`
`
    vi.mocked(chatCompletion).mockClear()
    vi.mocked(renderPdfPageToPng).mockClear()
    vi.mocked(renderPdfPageRegionToPng).mockClear()

    await enrichMarkdownWithLlamaVision(file, mdMixed, {
      baseUrl: 'http://127.0.0.1:9',
      model: 'llava-test.gguf',
      onProgress: vi.fn(),
    })
    expect(renderPdfPageRegionToPng).toHaveBeenCalledTimes(1)
    expect(renderPdfPageToPng).not.toHaveBeenCalled()
    expect(chatCompletion).toHaveBeenCalledTimes(1)
  })
})
