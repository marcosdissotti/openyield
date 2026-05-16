import type { DocumentRow, NotebookRow } from '#shared/model/pdfLibraryDb'

export type { DocumentRow, NotebookRow }

export async function pdfDbLoadWorkspace(): Promise<{
  notebooks: NotebookRow[]
  activeNotebookId: string | null
  documents: DocumentRow[]
} | null> {
  const api = typeof window !== 'undefined' ? window.pdfSourcesElectron : undefined
  if (!api?.pdfDbLoadWorkspace) return null
  return api.pdfDbLoadWorkspace()
}

export async function pdfDbUpsertNotebook(row: {
  id: string
  title: string
  ticker: string | null
}): Promise<void> {
  const api = window.pdfSourcesElectron
  await api?.pdfDbUpsertNotebook?.(row)
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
}): Promise<{ pdfPath: string; fileSha256: string } | undefined> {
  const r = await window.pdfSourcesElectron?.pdfDbPersistDocument?.(payload)
  return r === undefined ? undefined : r
}

export async function pdfDbDeleteDocument(documentId: string): Promise<void> {
  await window.pdfSourcesElectron?.pdfDbDeleteDocument?.(documentId)
}

export function isPdfDbAvailable(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    window.pdfSourcesElectron?.pdfDbLoadWorkspace &&
    window.pdfSourcesElectron?.pdfDbPersistDocument
  )
}
