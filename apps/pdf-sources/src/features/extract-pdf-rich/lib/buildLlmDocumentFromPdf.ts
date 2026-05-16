import { getDocument } from 'pdfjs-dist'
import { ensurePdfWorker } from '#shared/config/pdfjs'
import {
  LLM_DOC_TITLE,
  markdownPageLayoutSection,
  markdownPageOcrSection,
  markdownPageTextSection,
} from '../config/outputFormat'
import type { BuildLlmDocumentOptions, BuildLlmDocumentResult } from '../model/types'
import type { ExtractionPhase, ExtractionProgress } from '#shared/model/extractionProgress'
import { bitmapPageNumbersFromFlags } from './bitmapPageNumbers'
import { layoutMarkdownFromTextContent, type TextContentLike } from './layoutMarkdownFromTextContent'
import { pageHasBitmapImages } from './pageHasBitmapImages'
import { renderPdfPageToPng } from './renderPdfPageToPng'
import { recognizePngWithTesseract } from './recognizePngWithTesseract'
import {
  canUsePdfExtractWorkerPool,
  chunkPageNumberList,
  chunkPageRanges,
  extractOcrChunksInParallel,
  extractTextChunksInParallel,
  textRowsToArrays,
} from './pdfWorkerPool'

const INCLUDE_LAYOUT_TABLES = true

function emit(onProgress: BuildLlmDocumentOptions['onProgress'], p: ExtractionProgress) {
  onProgress?.(p)
}

function extractionWorkerConcurrency(override?: number): number {
  if (override !== undefined) {
    const n = Math.floor(override)
    if (Number.isFinite(n)) return Math.min(12, Math.max(1, n))
  }
  try {
    const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0
    const n = hc && hc >= 2 ? Math.floor(hc / 2) : 2
    return Math.min(8, Math.max(2, n))
  } catch {
    return 2
  }
}

function computeIndicesNeedingOcr(
  numPages: number,
  pageHasImage: boolean[],
  ocrAllPages: boolean,
): number[] {
  const indicesNeedingOcrSet = new Set<number>()
  for (let i = 0; i < numPages; i++) {
    if (pageHasImage[i]) indicesNeedingOcrSet.add(i + 1)
  }
  let indicesNeedingOcr = Array.from(indicesNeedingOcrSet).sort((a, b) => a - b)
  if (ocrAllPages) {
    indicesNeedingOcr = Array.from({ length: numPages }, (_, i) => i + 1)
  } else if (indicesNeedingOcr.length === 0) {
    indicesNeedingOcr = Array.from({ length: numPages }, (_, i) => i + 1)
  }
  return indicesNeedingOcr
}

export async function buildLlmDocumentFromPdf(
  file: File,
  options: BuildLlmDocumentOptions = {},
): Promise<BuildLlmDocumentResult> {
  ensurePdfWorker()
  const scale = options.renderScale ?? 2
  const lang = options.tesseractLang ?? 'por+eng'
  const forceOcr = options.forceOcrPageNumbers?.length
    ? new Set(options.forceOcrPageNumbers)
    : null
  const { onProgress, recognizeImage, renderPage = renderPdfPageToPng, ocrAllPages = false } = options

  const data = await file.arrayBuffer()

  const tryWorkers = canUsePdfExtractWorkerPool({
    recognizeImage: options.recognizeImage,
    renderPage: options.renderPage,
    useWorkerPool: options.useWorkerPool,
  })

  if (tryWorkers) {
    try {
      return await buildLlmDocumentWithWorkerPool(file.name, data, {
        scale,
        lang,
        forceOcr,
        ocrAllPages,
        onProgress,
        extractParallelism: options.extractParallelism,
      })
    } catch (e) {
      console.warn('[pdf-sources] Extração paralela (workers) falhou; a usar modo sequencial.', e)
    }
  }

  return buildLlmDocumentSequential(file.name, data, {
    scale,
    lang,
    forceOcr,
    ocrAllPages,
    onProgress,
    recognizeImage,
    renderPage,
  })
}

async function buildLlmDocumentWithWorkerPool(
  fileName: string,
  data: ArrayBuffer,
  opts: {
    scale: number
    lang: string
    forceOcr: Set<number> | null
    ocrAllPages: boolean
    onProgress?: BuildLlmDocumentOptions['onProgress']
    extractParallelism?: number
  },
): Promise<BuildLlmDocumentResult> {
  const { scale, lang, forceOcr, ocrAllPages, onProgress, extractParallelism } = opts
  const startedAt = Date.now()

  function emitEta(
    phase: ExtractionPhase,
    pageCurrent: number,
    pageTotal: number,
    percent: number,
    label: string,
    detail: string,
  ) {
    const elapsedSec = (Date.now() - startedAt) / 1000
    const frac = percent / 100
    let etaSeconds: number | undefined
    if (frac >= 0.06 && percent < 100) {
      etaSeconds = Math.max(1, Math.round(elapsedSec / frac - elapsedSec))
    }
    emit(onProgress, { phase, pageCurrent, pageTotal, percent, label, detail, etaSeconds })
  }

  /** PDF.js transfere o `ArrayBuffer` para o pdf.worker em GetDocRequest — não passar o buffer partilhado sem cópia. */
  const pdfProbe = await getDocument({ data: data.slice(0) }).promise
  const numPages = pdfProbe.numPages
  await pdfProbe.destroy()

  if (numPages < 1) {
    throw new Error('EMPTY_PDF_TEXT')
  }

  const workers = extractionWorkerConcurrency(extractParallelism)
  const textChunks = chunkPageRanges(numPages, workers)
  const forceList = forceOcr ? [...forceOcr] : undefined

  emitEta('text', 0, numPages, 5, 'Paralelo', `A extrair texto e bitmaps em ${textChunks.length} workers…`)

  const textRows = await extractTextChunksInParallel(data, textChunks, forceList, workers)
  const { pageTexts, pageTextContents, pageHasImage } = textRowsToArrays(textRows, numPages)

  for (let i = 0; i < numPages; i++) {
    if (pageTexts[i] === undefined) pageTexts[i] = ''
    if (!pageTextContents[i]) pageTextContents[i] = { items: [] }
    if (pageHasImage[i] === undefined) pageHasImage[i] = false
  }

  emitEta('text', numPages, numPages, 40, `Análise ${numPages}/${numPages}`, 'Texto e deteção de bitmap concluídos (paralelo).')

  const indicesNeedingOcr = computeIndicesNeedingOcr(numPages, pageHasImage, ocrAllPages)
  const M = indicesNeedingOcr.length
  const rawPlainText = pageTexts.join('\n\n').trim()

  const mdParts: string[] = [LLM_DOC_TITLE(fileName), '']

  for (let i = 0; i < pageTexts.length; i++) {
    mdParts.push(markdownPageTextSection(i + 1, pageTexts[i]!))
    if (INCLUDE_LAYOUT_TABLES) {
      const layoutMd = layoutMarkdownFromTextContent(pageTextContents[i]!)
      if (layoutMd) {
        mdParts.push(markdownPageLayoutSection(i + 1, layoutMd))
      }
    }
  }

  const ocrTotalSteps = Math.max(1, M * 2)
  let ocrStep = 0
  const ocrPercent = () => 40 + Math.round((ocrStep / ocrTotalSteps) * 60)

  if (M > 0) {
    const ocrChunks = chunkPageNumberList(indicesNeedingOcr, workers)
    emitEta('raster', 0, numPages, ocrPercent(), 'Paralelo', `OCR em ${ocrChunks.length} workers (${M} páginas)…`)

    const ocrRows = await extractOcrChunksInParallel(data, ocrChunks, scale, lang, workers)
    ocrStep = M * 2 - 1
    const ocrMap = new Map(ocrRows.map((r) => [r.pageNum, r.ocrText]))
    for (const pageNum of indicesNeedingOcr) {
      mdParts.push(markdownPageOcrSection(pageNum, ocrMap.get(pageNum) ?? ''))
    }
  }

  emitEta('ocr', numPages, numPages, 100, 'Concluído', 'Extraction finished.')

  const bitmapPageNumbers = bitmapPageNumbersFromFlags(pageHasImage)
  return { rawPlainText, llmMarkdown: mdParts.join('\n'), bitmapPageNumbers }
}

async function buildLlmDocumentSequential(
  fileName: string,
  data: ArrayBuffer,
  opts: {
    scale: number
    lang: string
    forceOcr: Set<number> | null
    ocrAllPages: boolean
    onProgress?: BuildLlmDocumentOptions['onProgress']
    recognizeImage?: (png: Blob) => Promise<string>
    renderPage: (page: import('pdfjs-dist').PDFPageProxy, scale: number) => Promise<Blob>
  },
): Promise<BuildLlmDocumentResult> {
  const { scale, lang, forceOcr, ocrAllPages, onProgress, recognizeImage, renderPage } = opts
  const startedAt = Date.now()

  function emitEta(
    phase: ExtractionPhase,
    pageCurrent: number,
    pageTotal: number,
    percent: number,
    label: string,
    detail: string,
  ) {
    const elapsedSec = (Date.now() - startedAt) / 1000
    const frac = percent / 100
    let etaSeconds: number | undefined
    if (frac >= 0.06 && percent < 100) {
      etaSeconds = Math.max(1, Math.round(elapsedSec / frac - elapsedSec))
    }
    emit(onProgress, { phase, pageCurrent, pageTotal, percent, label, detail, etaSeconds })
  }

  const pdf = await getDocument({ data }).promise
  const numPages = pdf.numPages
  const pageTexts: string[] = []
  const pageTextContents: TextContentLike[] = []
  const pageHasImage: boolean[] = []

  try {
    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      pageTextContents[p - 1] = tc as TextContentLike
      const line = tc.items.map((item) => ('str' in item ? item.str : '')).filter(Boolean).join(' ')
      pageTexts[p - 1] = line

      const forced = forceOcr?.has(p) ?? false
      const hasBitmap = forced || (await pageHasBitmapImages(page))
      pageHasImage[p - 1] = hasBitmap

      emitEta(
        'text',
        p,
        numPages,
        Math.round((p / numPages) * 40),
        `Análise ${p}/${numPages}`,
        `Extracting text and checking for bitmap images on page ${p} of ${numPages}…`,
      )
    }

    const indicesNeedingOcr = computeIndicesNeedingOcr(numPages, pageHasImage, ocrAllPages)
    const M = indicesNeedingOcr.length

    const rawPlainText = pageTexts.join('\n\n').trim()

    if (numPages < 1) {
      throw new Error('EMPTY_PDF_TEXT')
    }

    const mdParts: string[] = [LLM_DOC_TITLE(fileName), '']

    for (let i = 0; i < pageTexts.length; i++) {
      mdParts.push(markdownPageTextSection(i + 1, pageTexts[i]!))
      if (INCLUDE_LAYOUT_TABLES) {
        const layoutMd = layoutMarkdownFromTextContent(pageTextContents[i]!)
        if (layoutMd) {
          mdParts.push(markdownPageLayoutSection(i + 1, layoutMd))
        }
      }
    }

    const ocrTotalSteps = Math.max(1, M * 2)
    let ocrStep = 0
    const ocrPercent = () => 40 + Math.round((ocrStep / ocrTotalSteps) * 60)

    for (const pageNum of indicesNeedingOcr) {
      ocrStep += 1
      emitEta(
        'raster',
        pageNum,
        numPages,
        ocrPercent(),
        `Raster página ${pageNum}`,
        `Rendering page ${pageNum} of ${numPages} to PNG before Optical Character Recognition…`,
      )

      const page = await pdf.getPage(pageNum)
      const png = await renderPage(page, scale)

      ocrStep += 1
      emitEta(
        'ocr',
        pageNum,
        numPages,
        ocrPercent(),
        `OCR página ${pageNum}`,
        `Performing Optical Character Recognition (Tesseract) on images of page ${pageNum} of ${numPages}…`,
      )

      const ocrText = recognizeImage
        ? await recognizeImage(png)
        : await recognizePngWithTesseract(png, lang, (msg) => {
            emitEta(
              'ocr',
              pageNum,
              numPages,
              ocrPercent(),
              `OCR página ${pageNum}`,
              `Performing Optical Character Recognition (Tesseract) on images of page ${pageNum} of ${numPages} (${msg})…`,
            )
          })

      mdParts.push(markdownPageOcrSection(pageNum, ocrText))
    }

    emitEta('ocr', numPages, numPages, 100, 'Concluído', 'Extraction finished.')

    const bitmapPageNumbers = bitmapPageNumbersFromFlags(pageHasImage)
    return { rawPlainText, llmMarkdown: mdParts.join('\n'), bitmapPageNumbers }
  } finally {
    await pdf.destroy()
  }
}
