import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentRow, FcdSnapshotRow, FundamentalSnapshotRow, NotebookRow, StudioReportRow } from '../src/shared/model/pdfLibraryDb'

export interface HardwareSummaryPayload {
  vramBytes: number | null
  ramBytes: number | null
  sources: { vram?: string; ram?: string }
}

export type VectorMetadata = Record<string, unknown>

export interface VectorSearchResult {
  id: string
  score: number
  metadata: VectorMetadata
}

export interface OpenYieldElectronApi {
  getHardwareSummary: () => Promise<HardwareSummaryPayload>
  vectorInicializar: () => Promise<void>
  vectorAdicionar: (texto: string, metadados?: VectorMetadata) => Promise<{ id: string }>
  vectorBuscar: (queryTexto: string, limite?: number) => Promise<VectorSearchResult[]>
  vectorBuscarChunksNotebook: (queryTexto: string, notebookId: string, limite?: number) => Promise<VectorSearchResult[]>
  vectorGarantirChunksNotebook: (notebookId: string) => Promise<{ documentsIndexed: number; chunksIndexed: number }>
  pdfDbLoadWorkspace: () => Promise<{
    notebooks: NotebookRow[]
    activeNotebookId: string | null
    documents: DocumentRow[]
    reports: StudioReportRow[]
    fundamentals: FundamentalSnapshotRow[]
    fcdSnapshots: FcdSnapshotRow[]
  }>
  pdfDbUpsertNotebook: (row: { id: string; title: string; ticker: string | null }) => Promise<void>
  pdfDbDeleteNotebook: (notebookId: string) => Promise<void>
  pdfDbSetActiveNotebook: (notebookId: string) => Promise<void>
  pdfDbPersistDocument: (payload: {
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
  pdfDbDeleteDocument: (documentId: string) => Promise<void>
  pdfDbReadDocumentPdf: (documentId: string) => Promise<{ fileName: string; bytes: ArrayBuffer } | null>
  pdfDbPersistStudioReport: (payload: {
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
  pdfDbDeleteStudioReport: (reportId: string) => Promise<void>
  pdfDbPersistFundamentalSnapshot: (payload: {
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
  pdfDbDeleteFundamentalSnapshot: (snapshotId: string) => Promise<void>
  pdfDbPersistFcdSnapshot: (payload: {
    notebookId: string
    ticker: string | null
    inputsJson: string
  }) => Promise<void>
  pdfDbDeleteFcdSnapshot: (notebookId: string) => Promise<void>
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void) => () => void
}

const api: OpenYieldElectronApi = {
  getHardwareSummary: async () => ipcRenderer.invoke('get-hardware-summary'),
  vectorInicializar: async () => ipcRenderer.invoke('vector-inicializar'),
  vectorAdicionar: async (texto, metadados) => ipcRenderer.invoke('vector-adicionar', texto, metadados),
  vectorBuscar: async (queryTexto, limite) => ipcRenderer.invoke('vector-buscar', queryTexto, limite),
  vectorBuscarChunksNotebook: async (queryTexto, notebookId, limite) =>
    ipcRenderer.invoke('vector-buscar-chunks-notebook', queryTexto, notebookId, limite),
  vectorGarantirChunksNotebook: async (notebookId) => ipcRenderer.invoke('vector-garantir-chunks-notebook', notebookId),
  pdfDbLoadWorkspace: async () => ipcRenderer.invoke('pdf-db-load-workspace'),
  pdfDbUpsertNotebook: async (row) => ipcRenderer.invoke('pdf-db-upsert-notebook', row),
  pdfDbDeleteNotebook: async (notebookId) => ipcRenderer.invoke('pdf-db-delete-notebook', notebookId),
  pdfDbSetActiveNotebook: async (notebookId) => ipcRenderer.invoke('pdf-db-set-active-notebook', notebookId),
  pdfDbPersistDocument: async (payload) => ipcRenderer.invoke('pdf-db-persist-document', payload),
  pdfDbDeleteDocument: async (documentId) => ipcRenderer.invoke('pdf-db-delete-document', documentId),
  pdfDbReadDocumentPdf: async (documentId) => ipcRenderer.invoke('pdf-db-read-document-pdf', documentId),
  pdfDbPersistStudioReport: async (payload) => ipcRenderer.invoke('pdf-db-persist-studio-report', payload),
  pdfDbDeleteStudioReport: async (reportId) => ipcRenderer.invoke('pdf-db-delete-studio-report', reportId),
  pdfDbPersistFundamentalSnapshot: async (payload) => ipcRenderer.invoke('pdf-db-persist-fundamental-snapshot', payload),
  pdfDbDeleteFundamentalSnapshot: async (snapshotId) => ipcRenderer.invoke('pdf-db-delete-fundamental-snapshot', snapshotId),
  pdfDbPersistFcdSnapshot: async (payload) => ipcRenderer.invoke('pdf-db-persist-fcd-snapshot', payload),
  pdfDbDeleteFcdSnapshot: async (notebookId) => ipcRenderer.invoke('pdf-db-delete-fcd-snapshot', notebookId),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: async () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window-maximized-changed', listener)
    return () => ipcRenderer.removeListener('window-maximized-changed', listener)
  },
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('openYieldElectron', api)
}
