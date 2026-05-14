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

  it('calls vision only for chart-candidate pages (skips quando o mapa não tem gráfico)', async () => {
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
    expect(outNoChartPages).not.toContain('## Enriquecimento por visão')
    expect(chatCompletion).toHaveBeenCalledTimes(1)
  })
})
