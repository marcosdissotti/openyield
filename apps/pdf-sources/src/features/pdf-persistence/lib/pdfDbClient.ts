import type { DocumentRow, NotebookRow } from '#shared/model/pdfLibraryDb'

export async function pdfDbLoadWorkspace(): Promise<{
  notebooks: NotebookRow[]
  activeNotebookId: string | null
  documents: DocumentRow[]
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
}): Promise<{ pdfPath: string; fileSha256: string } | void> {
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

export function isPdfDbAvailable(): boolean {
  return !!(
    window.pdfSourcesElectron?.pdfDbLoadWorkspace &&
    window.pdfSourcesElectron?.pdfDbPersistDocument
  )
}
