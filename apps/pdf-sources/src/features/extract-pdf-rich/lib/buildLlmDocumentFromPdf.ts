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
import { layoutMarkdownFromTextContent, type TextContentLike } from './layoutMarkdownFromTextContent'
import { pageHasBitmapImages } from './pageHasBitmapImages'
import { renderPdfPageToPng } from './renderPdfPageToPng'
import { recognizePngWithTesseract } from './recognizePngWithTesseract'

const INCLUDE_LAYOUT_TABLES = true

function emit(onProgress: BuildLlmDocumentOptions['onProgress'], p: ExtractionProgress) {
  onProgress?.(p)
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

  const data = await file.arrayBuffer()
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

    const indicesNeedingOcrSet = new Set<number>()
    for (let i = 0; i < numPages; i++) {
      if (pageHasImage[i]) indicesNeedingOcrSet.add(i + 1)
    }
    let indicesNeedingOcr = Array.from(indicesNeedingOcrSet).sort((a, b) => a - b)
    if (ocrAllPages) {
      indicesNeedingOcr = Array.from({ length: numPages }, (_, i) => i + 1)
    } else if (indicesNeedingOcr.length === 0) {
      /* PDF só com gráficos vectoriais / sem XObject de imagem: sem raster+OCR nunca há bloco
       * `## Página N — OCR` e o Chart.js da pré-visualização fica vazio. */
      indicesNeedingOcr = Array.from({ length: numPages }, (_, i) => i + 1)
    }
    const M = indicesNeedingOcr.length

    const rawPlainText = pageTexts.join('\n\n').trim()

    if (numPages < 1) {
      throw new Error('EMPTY_PDF_TEXT')
    }

    const mdParts: string[] = [LLM_DOC_TITLE(file.name), '']

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

    emitEta(
      'ocr',
      numPages,
      numPages,
      100,
      'Concluído',
      'Extraction finished.',
    )

    return { rawPlainText, llmMarkdown: mdParts.join('\n') }
  } finally {
    await pdf.destroy()
  }
}
