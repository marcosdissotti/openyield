/// <reference lib="webworker" />

import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker } from 'tesseract.js'
import type { OcrRowWire, TextRowWire } from '../lib/pdfExtractWire'

/** Retorno de `page.getTextContent()` — `TextContent` não é exportado pelo pacote em algumas versões. */
type PdfPageTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>
type PdfTextItem = PdfPageTextContent['items'][number]

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const BITMAP_PAINT_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
])

async function pageHasBitmapImages(page: PDFPageProxy): Promise<boolean> {
  const opList = await page.getOperatorList()
  const { fnArray } = opList
  for (let i = 0; i < fnArray.length; i++) {
    if (BITMAP_PAINT_OPS.has(fnArray[i]!)) return true
  }
  return false
}

function serializeTextContent(tc: PdfPageTextContent): { items: Array<Record<string, unknown>> } {
  const items = tc.items.map((item: PdfTextItem) => {
    const o: Record<string, unknown> = {}
    if ('str' in item && typeof item.str === 'string') o.str = item.str
    if ('transform' in item && Array.isArray(item.transform)) o.transform = [...item.transform] as number[]
    if ('width' in item && typeof item.width === 'number') o.width = item.width
    if ('height' in item && typeof item.height === 'number') o.height = item.height
    return o
  })
  return { items }
}

async function handleText(msg: {
  pdfCopy: ArrayBuffer
  pages: number[]
  forceOcrPageNumbers?: number[]
}): Promise<TextRowWire[]> {
  const pdf = await getDocument({ data: msg.pdfCopy }).promise
  const force = msg.forceOcrPageNumbers ? new Set(msg.forceOcrPageNumbers) : null
  const rows: TextRowWire[] = []
  try {
    for (const p of [...msg.pages].sort((a, b) => a - b)) {
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      const line = tc.items
        .map((item: PdfTextItem) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
      const forced = force?.has(p) ?? false
      const hasBitmap = forced || (await pageHasBitmapImages(page))
      rows.push({
        pageNum: p,
        textContent: serializeTextContent(tc),
        lineText: line,
        hasBitmap,
      })
    }
    return rows
  } finally {
    await pdf.destroy()
  }
}

async function handleOcr(msg: { pdfCopy: ArrayBuffer; pages: number[]; scale: number; lang: string }): Promise<OcrRowWire[]> {
  const pdf = await getDocument({ data: msg.pdfCopy }).promise
  const tess = await createWorker(msg.lang, 1)
  const rows: OcrRowWire[] = []
  try {
    for (const p of [...msg.pages].sort((a, b) => a - b)) {
      const page = await pdf.getPage(p)
      const viewport = page.getViewport({ scale: msg.scale })
      const w = Math.max(1, Math.ceil(viewport.width))
      const h = Math.max(1, Math.ceil(viewport.height))
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('NO_2D_CONTEXT')
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise
      const blob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 })
      const { data } = await tess.recognize(blob)
      rows.push({ pageNum: p, ocrText: data.text ?? '' })
    }
    return rows
  } finally {
    await tess.terminate()
    await pdf.destroy()
  }
}

type WorkerInbound =
  | { kind: 'text'; id: string; pdfCopy: ArrayBuffer; pages: number[]; forceOcrPageNumbers?: number[] }
  | { kind: 'ocr'; id: string; pdfCopy: ArrayBuffer; pages: number[]; scale: number; lang: string }

self.addEventListener('message', (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data
  const id = 'id' in msg ? msg.id : ''
  void (async () => {
    try {
      if (msg.kind === 'text') {
        const rows = await handleText(msg)
        self.postMessage({ kind: 'text-result', id, rows })
      } else if (msg.kind === 'ocr') {
        const rows = await handleOcr(msg)
        self.postMessage({ kind: 'ocr-result', id, rows })
      }
    } catch (e) {
      self.postMessage({
        kind: 'error',
        id,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })()
})
