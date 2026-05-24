import { getDocument } from 'pdfjs-dist'
import { ensurePdfWorker } from '#shared/config/pdfjs'
import { renderPdfPageRegionToPng, renderPdfPageToPng } from '#features/extract-pdf-rich/lib/renderPdfPageToPng'

/**
 * Gera URLs de object (PNG) por página para pré-visualização na UI.
 * O caller deve fazer `URL.revokeObjectURL` quando deixar de precisar.
 */
export async function createPdfPageThumbnailUrls(file: File, scale = 0.42): Promise<string[]> {
  ensurePdfWorker()
  const data = await file.arrayBuffer()
  const pdf = await getDocument({ data }).promise
  const urls: string[] = []
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const blob = await renderPdfPageToPng(page, scale)
      urls.push(URL.createObjectURL(blob))
    }
  } finally {
    await pdf.destroy()
  }
  return urls
}

/**
 * Renderiza uma única página a PNG e devolve um object URL (alta resolução para modal).
 * O caller deve fazer `URL.revokeObjectURL` quando deixar de precisar.
 */
export async function createPdfPagePngObjectUrl(
  file: File,
  pageNum: number,
  scale = 2.25,
): Promise<string> {
  ensurePdfWorker()
  const data = await file.arrayBuffer()
  const pdf = await getDocument({ data }).promise
  try {
    const page = await pdf.getPage(pageNum)
    const blob = await renderPdfPageToPng(page, scale)
    return URL.createObjectURL(blob)
  } finally {
    await pdf.destroy()
  }
}

/**
 * Renderiza um recorte normalizado de uma página. Usado como evidência visual inline
 * para comparar gráfico/tabela original com a reconstrução feita pela IA/OCR.
 */
export async function createPdfPageRegionPngObjectUrl(
  file: File,
  pageNum: number,
  norm: { x: number; y: number; w: number; h: number },
  scale = 1.35,
): Promise<string> {
  ensurePdfWorker()
  const data = await file.arrayBuffer()
  const pdf = await getDocument({ data }).promise
  try {
    const page = await pdf.getPage(pageNum)
    const blob = await renderPdfPageRegionToPng(page, scale, norm)
    return URL.createObjectURL(blob)
  } finally {
    await pdf.destroy()
  }
}
