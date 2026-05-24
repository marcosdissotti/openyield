/// <reference types="vite/client" />

import type { HardwareSummaryPayload } from './src/shared/model/hardwareSummary'
import type { DocumentRow, FcdSnapshotRow, FundamentalSnapshotRow, NotebookRow, StudioReportRow } from './src/shared/model/pdfLibraryDb'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.png' {
  const src: string
  export default src
}

export interface OpenYieldElectronApi {
  getHardwareSummary: () => Promise<HardwareSummaryPayload>
  vectorInicializar?: () => Promise<void>
  vectorAdicionar?: (texto: string, metadados?: Record<string, unknown>) => Promise<{ id: string }>
  vectorBuscar?: (
    queryTexto: string,
    limite?: number,
  ) => Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>>
  vectorBuscarChunksNotebook?: (
    queryTexto: string,
    notebookId: string,
    limite?: number,
  ) => Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>>
  vectorGarantirChunksNotebook?: (notebookId: string) => Promise<{ documentsIndexed: number; chunksIndexed: number }>
  pdfDbLoadWorkspace?: () => Promise<{
    notebooks: NotebookRow[]
    activeNotebookId: string | null
    documents: DocumentRow[]
    reports: StudioReportRow[]
    fundamentals: FundamentalSnapshotRow[]
    fcdSnapshots: FcdSnapshotRow[]
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
  }) => Promise<{ pdfPath: string; fileSha256: string; aiSummary?: string; aiSummaryUpdatedAt?: string } | void>
  pdfDbDeleteDocument?: (documentId: string) => Promise<void>
  pdfDbReadDocumentPdf?: (documentId: string) => Promise<{ fileName: string; bytes: ArrayBuffer } | null>
  pdfDbPersistStudioReport?: (payload: {
    id: string
    notebookId: string
    type: 'risk'
    title: string
    subtitle: string
    status: 'generating' | 'ready' | 'error'
    body: string
    createdAt: string
    progressPercent: number
    etaLabel: string
  }) => Promise<void>
  pdfDbDeleteStudioReport?: (reportId: string) => Promise<void>
  pdfDbPersistFundamentalSnapshot?: (payload: {
    id: string
    notebookId: string
    ticker: string | null
    title: string
    status: 'generating' | 'ready' | 'error'
    fields: Array<{
      key: string
      label: string
      section: string
      value: string
      source?: string
      source_file?: string
      source_page?: string
      source_line?: string
      calculation?: string
      manual?: boolean
      calculated?: boolean
    }>
    error: string | null
    progressPercent: number
    etaLabel: string
    createdAt: string
  }) => Promise<void>
  pdfDbDeleteFundamentalSnapshot?: (snapshotId: string) => Promise<void>
  pdfDbPersistFcdSnapshot?: (payload: {
    notebookId: string
    ticker: string | null
    inputsJson: string
  }) => Promise<void>
  pdfDbDeleteFcdSnapshot?: (notebookId: string) => Promise<void>
  windowMinimize?: () => void
  windowMaximize?: () => void
  windowClose?: () => void
  windowIsMaximized?: () => Promise<boolean>
  onWindowMaximizedChanged?: (callback: (maximized: boolean) => void) => () => void
  workspaceExportPack?: (payload: {
    appVersion?: string
    llmSettings?: Record<string, unknown> | null
    localSnapshots?: Record<string, unknown> | null
  }) => Promise<{ canceled: boolean; path?: string }>
  workspaceImportPack?: (payload: {
    mode: 'replace' | 'merge'
    activeNotebookId?: string | null
  }) => Promise<{
    canceled: boolean
    fileName?: string
    mode?: 'replace' | 'merge'
    manifest?: Record<string, unknown>
    activeNotebookId?: string | null
  }>
}

declare global {
  interface Window {
    openYieldElectron?: OpenYieldElectronApi
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
