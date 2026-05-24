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

/**
 * Renderiza a página inteira e devolve um PNG recortado a `norm` (coordenadas 0–1 relativas ao viewport).
 * Útil para enviar só a zona do gráfico ao modelo de visão quando a folha mistura gráfico e tabelas.
 */
export async function renderPdfPageRegionToPng(
  page: PDFPageProxy,
  scale: number,
  norm: { x: number; y: number; w: number; h: number },
): Promise<Blob> {
  const viewport = page.getViewport({ scale })
  const fullW = viewport.width
  const fullH = viewport.height
  const sx = Math.max(0, Math.min(fullW - 1, Math.floor(norm.x * fullW)))
  const sy = Math.max(0, Math.min(fullH - 1, Math.floor(norm.y * fullH)))
  const sw = Math.max(1, Math.min(fullW - sx, Math.ceil(norm.w * fullW)))
  const sh = Math.max(1, Math.min(fullH - sy, Math.ceil(norm.h * fullH)))

  const fullCanvas = document.createElement('canvas')
  const fctx = fullCanvas.getContext('2d')
  if (!fctx) {
    throw new Error('NO_2D_CONTEXT')
  }
  fullCanvas.width = fullW
  fullCanvas.height = fullH
  const task = page.render({
    canvasContext: fctx,
    viewport,
  })
  await task.promise

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('NO_2D_CONTEXT')
  }
  ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
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
