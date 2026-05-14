import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLlmDocumentFromPdf } from '../../src/features/extract-pdf-rich/lib/buildLlmDocumentFromPdf'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** PNG 1×1 mínimo (bytes) para embed em PDF de teste */
const MIN_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
])

describe('buildLlmDocumentFromPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs OCR when forceOcrPageNumbers is set (tests / override)', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 400])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('Hi', { x: 50, y: 350, size: 12, font })
    const bytes = await doc.save()
    const file = new File([bytes], 'tiny.pdf', { type: 'application/pdf' })

    const progress: number[] = []
    const result = await buildLlmDocumentFromPdf(file, {
      forceOcrPageNumbers: [1],
      ocrAllPages: false,
      renderPage: async () => new Blob([new Uint8Array([137, 80])], { type: 'image/png' }),
      recognizeImage: async () => 'MOCK_OCR_LINE',
      onProgress: (p) => progress.push(p.percent),
    })

    expect(result.rawPlainText).toContain('Hi')
    expect(result.llmMarkdown).toContain('## Página 1 — OCR')
    expect(result.llmMarkdown).toContain('MOCK_OCR_LINE')
    expect(progress.length).toBeGreaterThan(0)
    expect(Math.max(...progress)).toBe(100)
  })

  it('processes real fixture: vector PDFs get full-page OCR (mocked in test)', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/sample.pdf')
    const buf = readFileSync(fixturePath)
    const file = new File([buf], 'sample.pdf', { type: 'application/pdf' })
    const result = await buildLlmDocumentFromPdf(file, {
      renderPage: async () => new Blob([MIN_PNG], { type: 'image/png' }),
      recognizeImage: async () => 'MOCK_OCR_FULL_PAGE',
    })
    expect(result.llmMarkdown).toContain('Hello Cypress Fixture')
    expect(result.llmMarkdown).toContain('## Página 1 — OCR')
    expect(result.llmMarkdown).toContain('MOCK_OCR_FULL_PAGE')
  })

  it('runs OCR when PDF embeds a bitmap (no force)', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 400])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const img = await doc.embedPng(MIN_PNG)
    page.drawImage(img, { x: 50, y: 200, width: 40, height: 40 })
    page.drawText('Legend', { x: 50, y: 350, size: 12, font })
    const bytes = await doc.save()
    const file = new File([bytes], 'with-png.pdf', { type: 'application/pdf' })

    const result = await buildLlmDocumentFromPdf(file, {
      renderPage: async () => new Blob([new Uint8Array([137, 80])], { type: 'image/png' }),
      recognizeImage: async () => 'OCR_FROM_BITMAP_PAGE',
    })

    expect(result.llmMarkdown).toContain('## Página 1 — OCR')
    expect(result.llmMarkdown).toContain('OCR_FROM_BITMAP_PAGE')
  })
})
