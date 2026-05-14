export interface BuildLlmDocumentOptions {
  onProgress?: (p: import('#shared/model/extractionProgress').ExtractionProgress) => void
  /** Escala do raster (DPI visual ≈ 72 * scale) */
  renderScale?: number
  /** Testes ou override: rasterização da página */
  renderPage?: (page: import('pdfjs-dist').PDFPageProxy, scale: number) => Promise<Blob>
  /** Testes: substituir Tesseract */
  recognizeImage?: (pngBlob: Blob) => Promise<string>
  /** Idiomas Tesseract, ex. por+eng */
  tesseractLang?: string
  /**
   * Só para testes: força OCR nestas páginas (índice 1-based), ignorando detecção de imagem.
   */
  forceOcrPageNumbers?: number[]
  /**
   * Rasteriza e corre OCR em **todas** as páginas (mais lento). Útil quando há bitmaps só na capa
   * mas gráficos vectoriais noutras páginas — sem isto, só páginas com imagem embutida recebem OCR.
   */
  ocrAllPages?: boolean
}

export interface BuildLlmDocumentResult {
  /** Texto plano (todas as páginas, camada de texto) para separador “Texto bruto” */
  rawPlainText: string
  /** Documento Markdown para prompts / separador “Markdown (LLM)” */
  llmMarkdown: string
}
