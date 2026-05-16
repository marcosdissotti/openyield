import { useNotebookStore } from '#entities/notebook'
import { usePdfSourcesStore } from '#entities/pdf-source'
import { useStudioReportStore } from '#entities/studio-report'
import { useFundamentalSnapshotStore } from '#entities/fundamental-snapshot'
import { pdfDbLoadWorkspace } from './lib/pdfDbClient'

export async function bootstrapPdfWorkspace(): Promise<void> {
  const notebook = useNotebookStore()
  const pdf = usePdfSourcesStore()
  const reports = useStudioReportStore()
  const fundamentals = useFundamentalSnapshotStore()
  const state = await pdfDbLoadWorkspace()
  if (!state) {
    notebook.ensureDefaultInMemory()
    return
  }
  notebook.hydrateFromRows(state.notebooks, state.activeNotebookId)
  pdf.hydrateFromDocuments(state.documents)
  reports.hydrateFromRows(state.reports ?? [])
  fundamentals.hydrateFromRows(state.fundamentals ?? [])
}

export const refreshPdfWorkspaceFromDb = bootstrapPdfWorkspace
