import type { PDFPageProxy } from 'pdfjs-dist'

export async function renderPdfPageToPng(page: PDFPageProxy, scale = 2): Promise<Blob> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('NO_2D_CONTEXT')
  }
  canvas.width = viewport.width
  canvas.height = viewport.height
  const task = page.render({
    canvasContext: ctx,
    viewport,
  })
  await task.promise
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('PNG_BLOB_FAILED'))
      },
      'image/png',
      0.92,
    )
  })
}
