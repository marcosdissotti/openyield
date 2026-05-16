/// <reference types="vite/client" />

import type { HardwareSummaryPayload } from './src/shared/model/hardwareSummary'
import type { DocumentRow, NotebookRow } from './src/shared/model/pdfLibraryDb'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

export interface PdfSourcesElectronApi {
  getHardwareSummary: () => Promise<HardwareSummaryPayload>
  vectorInicializar?: () => Promise<void>
  vectorAdicionar?: (texto: string, metadados?: Record<string, unknown>) => Promise<{ id: string }>
  vectorBuscar?: (
    queryTexto: string,
    limite?: number,
  ) => Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>>
  pdfDbLoadWorkspace?: () => Promise<{
    notebooks: NotebookRow[]
    activeNotebookId: string | null
    documents: DocumentRow[]
  }>
  pdfDbUpsertNotebook?: (row: { id: string; title: string; ticker: string | null }) => Promise<void>
  pdfDbDeleteNotebook?: (notebookId: string) => Promise<void>
  pdfDbSetActiveNotebook?: (notebookId: string) => Promise<void>
  pdfDbPersistDocument?: (payload: {
    documentId: string
    notebookId: string
    fileName: string
    pdfBytes: ArrayBuffer
    rawPlainText: string
    llmMarkdown: string
    pageSections: Array<{
      page_num: number
      section_kind: 'texto' | 'layout' | 'ocr'
      body_markdown: string
      sort_order: number
    }>
  }) => Promise<{ pdfPath: string; fileSha256: string } | void>
  pdfDbDeleteDocument?: (documentId: string) => Promise<void>
  pdfDbReadDocumentPdf?: (documentId: string) => Promise<{ fileName: string; bytes: ArrayBuffer } | null>
}

declare global {
  interface Window {
    pdfSourcesElectron?: PdfSourcesElectronApi
  }
}

interface ImportMetaEnv {
  readonly VITE_LLM_API_BASE?: string
  readonly VITE_LM_STUDIO_TARGET?: string
  /**
   * `0` — OCR só em páginas com bitmap (mais rápido). Omitir ou outro valor — mesmo efeito que
   * `1`: OCR em todas as páginas (lento; útil para gráficos vectoriais sem imagem embutida).
   */
  readonly VITE_PDF_OCR_ALL_PAGES?: string
  /** Escala PDF→raster para visão (ex. 2.5). Omitir = defeito no código (~2.5). */
  readonly VITE_VISION_SCALE?: string
  /** Lado mais comprido (px) da imagem enviada ao VL; menor = menos VRAM. `0` = sem redimensionar. */
  readonly VITE_VISION_MAX_LONG_EDGE?: string
  /** Pausa (ms) entre pedidos de visão sequenciais (0–60000). */
  readonly VITE_VISION_COOLDOWN_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
