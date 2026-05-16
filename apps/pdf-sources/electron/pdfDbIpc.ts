import { ipcMain } from 'electron'
import {
  deleteDocument,
  deleteNotebook,
  loadWorkspaceState,
  persistPdfDocument,
  setActiveNotebookId,
  upsertNotebook,
} from './pdfDb'

export function registerPdfDbIpc(): void {
  ipcMain.handle('pdf-db-load-workspace', () => loadWorkspaceState())
  ipcMain.handle(
    'pdf-db-upsert-notebook',
    (_e, row: { id: string; title: string; ticker: string | null }) => {
      upsertNotebook(row)
    },
  )
  ipcMain.handle('pdf-db-delete-notebook', (_e, notebookId: string) => {
    deleteNotebook(notebookId)
  })
  ipcMain.handle('pdf-db-set-active-notebook', (_e, notebookId: string) => {
    setActiveNotebookId(notebookId)
  })
  ipcMain.handle(
    'pdf-db-persist-document',
    (
      _e,
      payload: {
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
      },
    ) => {
      const bytes = new Uint8Array(payload.pdfBytes)
      return persistPdfDocument({
        documentId: payload.documentId,
        notebookId: payload.notebookId,
        fileName: payload.fileName,
        pdfBytes: bytes,
        rawPlainText: payload.rawPlainText,
        llmMarkdown: payload.llmMarkdown,
        pageSections: payload.pageSections,
      })
    },
  )
  ipcMain.handle('pdf-db-delete-document', (_e, documentId: string) => {
    deleteDocument(documentId)
  })
}
