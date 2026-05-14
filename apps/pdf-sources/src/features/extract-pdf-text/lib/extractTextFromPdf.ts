import { getDocument } from 'pdfjs-dist'
import { ensurePdfWorker } from '#shared/config/pdfjs'

export async function extractTextFromPdf(file: File): Promise<string> {
  ensurePdfWorker()
  const data = await file.arrayBuffer()
  const loadingTask = getDocument({ data })
  const pdf = await loadingTask.promise
  const pageTexts: string[] = []
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const line = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
      pageTexts.push(line)
    }
  } finally {
    await pdf.destroy()
  }
  const full = pageTexts.join('\n\n').trim()
  if (!full) {
    throw new Error('EMPTY_PDF_TEXT')
  }
  return full
}
