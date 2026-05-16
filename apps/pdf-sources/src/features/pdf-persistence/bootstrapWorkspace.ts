import { useNotebookStore } from '#entities/notebook'
import { usePdfSourcesStore } from '#entities/pdf-source'
import { pdfDbLoadWorkspace } from './lib/pdfDbClient'

export async function bootstrapPdfWorkspace(): Promise<void> {
  const notebook = useNotebookStore()
  const pdf = usePdfSourcesStore()
  const state = await pdfDbLoadWorkspace()
  if (!state) {
    notebook.ensureDefaultInMemory()
    return
  }
  notebook.hydrateFromRows(state.notebooks, state.activeNotebookId)
  pdf.hydrateFromDocuments(state.documents)
}

export const refreshPdfWorkspaceFromDb = bootstrapPdfWorkspace
