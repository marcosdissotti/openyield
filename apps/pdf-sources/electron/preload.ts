import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentRow, NotebookRow } from '../src/shared/model/pdfLibraryDb'

export interface HardwareSummaryPayload {
  vramBytes: number | null
  ramBytes: number | null
  sources: { vram?: string; ram?: string }
}

export interface PdfSourcesElectronApi {
  getHardwareSummary: () => Promise<HardwareSummaryPayload>
  pdfDbLoadWorkspace: () => Promise<{
    notebooks: NotebookRow[]
    activeNotebookId: string | null
    documents: DocumentRow[]
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
  }) => Promise<{ pdfPath: string; fileSha256: string } | void>
  pdfDbDeleteDocument: (documentId: string) => Promise<void>
}

const api: PdfSourcesElectronApi = {
  getHardwareSummary: async () => ipcRenderer.invoke('get-hardware-summary'),
  pdfDbLoadWorkspace: async () => ipcRenderer.invoke('pdf-db-load-workspace'),
  pdfDbUpsertNotebook: async (row) => ipcRenderer.invoke('pdf-db-upsert-notebook', row),
  pdfDbDeleteNotebook: async (notebookId) => ipcRenderer.invoke('pdf-db-delete-notebook', notebookId),
  pdfDbSetActiveNotebook: async (notebookId) => ipcRenderer.invoke('pdf-db-set-active-notebook', notebookId),
  pdfDbPersistDocument: async (payload) => ipcRenderer.invoke('pdf-db-persist-document', payload),
  pdfDbDeleteDocument: async (documentId) => ipcRenderer.invoke('pdf-db-delete-document', documentId),
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('pdfSourcesElectron', api)
}
