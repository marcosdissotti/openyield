import type { TextContentLike } from './layoutMarkdownFromTextContent'
import type { TextRowWire, OcrRowWire } from './pdfExtractWire'

const WORKER_URL = new URL('../workers/pdf-extract.worker.ts', import.meta.url)

export function canUsePdfExtractWorkerPool(options: {
  recognizeImage?: (png: Blob) => Promise<string>
  renderPage?: unknown
  useWorkerPool?: boolean
}): boolean {
  if (options.useWorkerPool === false) return false
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false
  if (options.recognizeImage) return false
  if (options.renderPage !== undefined) return false
  return true
}

/** Partições contíguas 1..n em até `parts` grupos. */
export function chunkPageRanges(numPages: number, parts: number): number[][] {
  if (numPages < 1 || parts < 1) return []
  const p = Math.min(parts, numPages)
  const chunks: number[][] = []
  const base = Math.floor(numPages / p)
  let rem = numPages % p
  let start = 1
  for (let i = 0; i < p; i++) {
    const sz = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
    if (sz <= 0) continue
    chunks.push(Array.from({ length: sz }, (_, j) => start + j))
    start += sz
  }
  return chunks
}

/** Reparte a lista de números de página (ex.: OCR) em até `parts` grupos contíguos na ordem da lista. */
export function chunkPageNumberList(pages: number[], parts: number): number[][] {
  const n = pages.length
  if (n === 0) return []
  const idxChunks = chunkPageRanges(n, Math.min(parts, n))
  return idxChunks.map((idxs) => idxs.map((oneBased) => pages[oneBased - 1]!))
}

function runWorkerOnce<T>(payload: unknown, transfer: Transferable[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_URL, { type: 'module' })
    w.onmessage = (ev: MessageEvent<{ kind: string; rows?: T; message?: string; id?: string }>) => {
      const d = ev.data
      if (d.kind === 'error') {
        w.terminate()
        reject(new Error(d.message || 'WORKER_ERROR'))
        return
      }
      if (d.kind === 'text-result' || d.kind === 'ocr-result') {
        if (d.rows !== undefined) {
          w.terminate()
          resolve(d.rows as T)
        }
      }
    }
    w.onerror = (err) => {
      w.terminate()
      reject(err.error ?? err)
    }
    w.postMessage(payload, transfer)
  })
}

export async function extractTextChunksInParallel(
  pdfBytes: ArrayBuffer,
  pageChunks: number[][],
  forceOcrPageNumbers: number[] | undefined,
  concurrency: number,
): Promise<TextRowWire[]> {
  const all: TextRowWire[] = []
  const queue = [...pageChunks]
  const mutex = { next: 0 }

  async function workerSlot() {
    while (true) {
      const my = mutex.next++
      if (my >= queue.length) break
      const pages = queue[my]
      if (!pages?.length) continue
      const copy = pdfBytes.slice(0)
      const rows = await runWorkerOnce<TextRowWire[]>(
        {
          kind: 'text',
          id: `text-${my}`,
          pdfCopy: copy,
          pages,
          forceOcrPageNumbers,
        },
        [copy],
      )
      all.push(...rows)
    }
  }

  const n = Math.min(concurrency, queue.length)
  await Promise.all(Array.from({ length: Math.max(1, n) }, () => workerSlot()))
  all.sort((a, b) => a.pageNum - b.pageNum)
  return all
}

export async function extractOcrChunksInParallel(
  pdfBytes: ArrayBuffer,
  pageChunks: number[][],
  scale: number,
  lang: string,
  concurrency: number,
): Promise<OcrRowWire[]> {
  const all: OcrRowWire[] = []
  const queue = [...pageChunks]
  const mutex = { next: 0 }

  async function workerSlot() {
    while (true) {
      const my = mutex.next++
      if (my >= queue.length) break
      const pages = queue[my]
      if (!pages?.length) continue
      const copy = pdfBytes.slice(0)
      const rows = await runWorkerOnce<OcrRowWire[]>(
        {
          kind: 'ocr',
          id: `ocr-${my}`,
          pdfCopy: copy,
          pages,
          scale,
          lang,
        },
        [copy],
      )
      all.push(...rows)
    }
  }

  const n = Math.min(concurrency, queue.length)
  await Promise.all(Array.from({ length: Math.max(1, n) }, () => workerSlot()))
  all.sort((a, b) => a.pageNum - b.pageNum)
  return all
}

export function textRowsToArrays(
  rows: TextRowWire[],
  numPages: number,
): { pageTexts: string[]; pageTextContents: TextContentLike[]; pageHasImage: boolean[] } {
  const pageTexts: string[] = new Array(numPages)
  const pageTextContents: TextContentLike[] = new Array(numPages)
  const pageHasImage: boolean[] = new Array(numPages)
  for (const r of rows) {
    const i = r.pageNum - 1
    if (i < 0 || i >= numPages) continue
    pageTexts[i] = r.lineText
    pageTextContents[i] = r.textContent as TextContentLike
    pageHasImage[i] = r.hasBitmap
  }
  return { pageTexts, pageTextContents, pageHasImage }
}
