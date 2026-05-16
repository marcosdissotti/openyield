import { ipcMain } from 'electron'
import { getVectorService, type VectorMetadata } from './vectorService'

function metadataObject(input: unknown): VectorMetadata {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input as VectorMetadata
  return {}
}

export function registerVectorIpc(): void {
  const service = getVectorService()

  ipcMain.handle('vector-inicializar', async () => {
    await service.inicializar()
  })

  ipcMain.handle('vector-adicionar', async (_event, texto: string, metadados?: unknown) => {
    return service.adicionarDocumento(String(texto ?? ''), metadataObject(metadados))
  })

  ipcMain.handle('vector-buscar', async (_event, queryTexto: string, limite?: number) => {
    return service.buscarSimilares(String(queryTexto ?? ''), limite)
  })

  ipcMain.handle('vector-buscar-chunks-notebook', async (_event, queryTexto: string, notebookId: string, limite?: number) => {
    return service.buscarChunksDoNotebook(String(queryTexto ?? ''), String(notebookId ?? ''), limite)
  })

  ipcMain.handle('vector-garantir-chunks-notebook', async (_event, notebookId: string) => {
    return service.garantirChunksDoNotebook(String(notebookId ?? ''))
  })

  ipcMain.handle('pdf-db-load-workspace', async () => service.loadWorkspaceState())

  ipcMain.handle(
    'pdf-db-upsert-notebook',
    (_event, row: { id: string; title: string; ticker: string | null }) => {
      service.upsertNotebook(row)
    },
  )

  ipcMain.handle('pdf-db-delete-notebook', async (_event, notebookId: string) => {
    await service.deleteNotebook(notebookId)
  })

  ipcMain.handle('pdf-db-set-active-notebook', (_event, notebookId: string) => {
    service.setActiveNotebook(notebookId)
  })

  ipcMain.handle(
    'pdf-db-persist-document',
    async (
      _event,
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
      return service.persistPdfDocument({
        documentId: payload.documentId,
        notebookId: payload.notebookId,
        fileName: payload.fileName,
        pdfBytes: new Uint8Array(payload.pdfBytes),
        rawPlainText: payload.rawPlainText,
        llmMarkdown: payload.llmMarkdown,
        pageSections: payload.pageSections,
      })
    },
  )

  ipcMain.handle('pdf-db-delete-document', async (_event, documentId: string) => {
    await service.deleteDocument(documentId)
  })

  ipcMain.handle('pdf-db-read-document-pdf', async (_event, documentId: string) => {
    return service.readDocumentPdf(String(documentId ?? ''))
  })

  ipcMain.handle(
    'pdf-db-persist-studio-report',
    async (
      _event,
      payload: {
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
      },
    ) => {
      await service.persistStudioReport(payload)
    },
  )

  ipcMain.handle('pdf-db-delete-studio-report', async (_event, reportId: string) => {
    await service.deleteStudioReport(String(reportId ?? ''))
  })

  ipcMain.handle('pdf-db-persist-fundamental-snapshot', async (_event, payload) => {
    await service.persistFundamentalSnapshot(payload)
  })

  ipcMain.handle('pdf-db-delete-fundamental-snapshot', async (_event, snapshotId: string) => {
    await service.deleteFundamentalSnapshot(String(snapshotId ?? ''))
  })
}
