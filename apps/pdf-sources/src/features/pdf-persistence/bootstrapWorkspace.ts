import { useNotebookStore } from '#entities/notebook'
import { usePdfSourcesStore } from '#entities/pdf-source'
import { pdfDbLoadWorkspace } from './lib/pdfDbClient'

export async function bootstrapPdfWorkspace(): Promise<void> {
  await refreshPdfWorkspaceFromDb()
}

export async function refreshPdfWorkspaceFromDb(): Promise<void> {
  const nb = useNotebookStore()
  const pdf = usePdfSourcesStore()
  const state = await pdfDbLoadWorkspace()
  if (state) {
    nb.hydrateFromRows(state.notebooks, state.activeNotebookId)
    pdf.hydrateFromDocuments(state.documents)
    const active = nb.activeNotebookId
    if (active) pdf.alignSelectionToNotebook(active)
  } else {
    nb.ensureDefaultInMemory()
  }
}
