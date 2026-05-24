import { useNotebookStore } from '#entities/notebook'
import { usePdfSourcesStore } from '#entities/pdf-source'
import { useStudioReportStore } from '#entities/studio-report'
import { useFundamentalSnapshotStore } from '#entities/fundamental-snapshot'
import { useFcdSnapshotStore } from '#entities/fcd-snapshot'
import { useGrahamSnapshotStore } from '#entities/graham-snapshot/model/grahamSnapshotStore'
import { useGrahamNumberSnapshotStore } from '#entities/graham-number-snapshot/model/grahamNumberSnapshotStore'
import { pdfDbLoadWorkspace } from './lib/pdfDbClient'

export async function bootstrapPdfWorkspace(): Promise<void> {
  const notebook = useNotebookStore()
  const pdf = usePdfSourcesStore()
  const reports = useStudioReportStore()
  const fundamentals = useFundamentalSnapshotStore()
  const fcd = useFcdSnapshotStore()
  const graham = useGrahamSnapshotStore()
  const grahamNumber = useGrahamNumberSnapshotStore()
  const state = await pdfDbLoadWorkspace()
  if (!state) {
    notebook.ensureDefaultInMemory()
    graham.hydrateFromRows([])
    grahamNumber.hydrateFromLocalStorage()
    return
  }
  notebook.hydrateFromRows(state.notebooks, state.activeNotebookId)
  pdf.hydrateFromDocuments(state.documents)
  reports.hydrateFromRows(state.reports ?? [])
  fundamentals.hydrateFromRows(state.fundamentals ?? [])
  fcd.hydrateFromRows(state.fcdSnapshots ?? [])
  graham.hydrateFromRows([])
  grahamNumber.hydrateFromLocalStorage()
}

export const refreshPdfWorkspaceFromDb = bootstrapPdfWorkspace
