import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist'
import { ensurePdfWorker } from '../../src/shared/config/pdfjs'
import { pageHasBitmapImages } from '../../src/features/extract-pdf-rich/lib/pageHasBitmapImages'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MIN_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
])

describe('pageHasBitmapImages', () => {
  it('returns false for text-only fixture', async () => {
    ensurePdfWorker()
    const buf = readFileSync(path.join(__dirname, '../fixtures/sample.pdf'))
    const pdf = await getDocument({ data: new Uint8Array(buf) }).promise
    try {
      const page = await pdf.getPage(1)
      expect(await pageHasBitmapImages(page)).toBe(false)
    } finally {
      await pdf.destroy()
    }
  })

  it('returns true when page embeds PNG', async () => {
    ensurePdfWorker()
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const img = await doc.embedPng(MIN_PNG)
    page.drawImage(img, { x: 10, y: 10, width: 20, height: 20 })
    const bytes = await doc.save()
    const pdf = await getDocument({ data: bytes }).promise
    try {
      const p = await pdf.getPage(1)
      expect(await pageHasBitmapImages(p)).toBe(true)
    } finally {
      await pdf.destroy()
    }
  })
})
