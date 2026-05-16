/** Mensagens fim-a-fim entre main e `pdf-extract.worker` (só dados, sem proxies pdf.js). */
export type TextRowWire = {
  pageNum: number
  textContent: { items: Array<Record<string, unknown>> }
  lineText: string
  hasBitmap: boolean
}

export type OcrRowWire = {
  pageNum: number
  ocrText: string
}
