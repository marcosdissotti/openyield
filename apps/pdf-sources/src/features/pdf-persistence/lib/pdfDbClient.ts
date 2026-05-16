import type { DocumentRow, FundamentalSnapshotRow, NotebookRow, StudioReportRow } from '#shared/model/pdfLibraryDb'

export async function pdfDbLoadWorkspace(): Promise<{
  notebooks: NotebookRow[]
  activeNotebookId: string | null
  documents: DocumentRow[]
  reports: StudioReportRow[]
  fundamentals: FundamentalSnapshotRow[]
} | null> {
  const api = window.pdfSourcesElectron
  if (!api?.pdfDbLoadWorkspace) return null
  return api.pdfDbLoadWorkspace()
}

export async function pdfDbUpsertNotebook(row: {
  id: string
  title: string
  ticker: string | null
}): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbUpsertNotebook?.(row)
}

export async function pdfDbDeleteNotebook(notebookId: string): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbDeleteNotebook?.(notebookId)
}

export async function pdfDbSetActiveNotebook(notebookId: string): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbSetActiveNotebook?.(notebookId)
}

export async function pdfDbPersistDocument(payload: {
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
}): Promise<{ pdfPath: string; fileSha256: string; aiSummary?: string; aiSummaryUpdatedAt?: string } | void> {
  return window.pdfSourcesElectron?.pdfDbPersistDocument?.(payload)
}

export async function pdfDbDeleteDocument(documentId: string): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbDeleteDocument?.(documentId)
}

export async function pdfDbReadDocumentFile(documentId: string): Promise<File | null> {
  const payload = await window.pdfSourcesElectron?.pdfDbReadDocumentPdf?.(documentId)
  if (!payload) return null
  return new File([payload.bytes], payload.fileName, { type: 'application/pdf' })
}

export async function pdfDbPersistStudioReport(payload: {
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
}): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbPersistStudioReport?.(payload)
}

export async function pdfDbDeleteStudioReport(reportId: string): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbDeleteStudioReport?.(reportId)
}

export async function pdfDbPersistFundamentalSnapshot(payload: {
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
}): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbPersistFundamentalSnapshot?.(payload)
}

export async function pdfDbDeleteFundamentalSnapshot(snapshotId: string): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbDeleteFundamentalSnapshot?.(snapshotId)
}

export function isPdfDbAvailable(): boolean {
  return !!(
    window.pdfSourcesElectron?.pdfDbLoadWorkspace &&
    window.pdfSourcesElectron?.pdfDbPersistDocument
  )
}
