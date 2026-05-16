import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ExtractionProgress } from '#shared/model/extractionProgress'
import type { DocumentRow } from '#shared/model/pdfLibraryDb'
import { isPdfDbAvailable, pdfDbDeleteDocument } from '#features/pdf-persistence/lib/pdfDbClient'

export interface PdfSource {
  id: string
  notebookId: string
  fileName: string
  /** Referência ao ficheiro: original no upload, ou restaurado do PDF persistido para miniaturas. */
  file?: File
  /** Caminho absoluto do PDF no disco (Electron, após persistência) */
  pdfPath?: string
  extractedText: string
  llmMarkdown: string
  status: 'pending' | 'ready' | 'error'
  error?: string
  extractionProgress?: ExtractionProgress
}

export const usePdfSourcesStore = defineStore('pdfSources', () => {
  const sources = ref<PdfSource[]>([])
  const selectedId = ref<string | null>(null)

  const selected = computed(() => sources.value.find((s) => s.id === selectedId.value) ?? null)

  function sourcesForNotebook(notebookId: string) {
    return sources.value.filter((s) => s.notebookId === notebookId)
  }

  function pickSelectionAfterMutation(notebookId: string) {
    const list = sourcesForNotebook(notebookId)
    const next =
      list.find((x) => x.status === 'ready') ??
      list.find((x) => x.status === 'error') ??
      list.find((x) => x.status === 'pending') ??
      null
    selectedId.value = next?.id ?? null
  }

  function addPending(file: File, notebookId: string): string {
    const id = crypto.randomUUID()
    sources.value.push({
      id,
      notebookId,
      fileName: file.name,
      file,
      extractedText: '',
      llmMarkdown: '',
      status: 'pending',
    })
    selectedId.value = id
    return id
  }

  function updateProgress(id: string, progress: ExtractionProgress) {
    const s = sources.value.find((x) => x.id === id)
    if (!s) return
    s.extractionProgress = { ...progress }
  }

  function clearProgress(id: string) {
    const s = sources.value.find((x) => x.id === id)
    if (!s) return
    s.extractionProgress = undefined
  }

  function complete(
    id: string,
    payload: { extractedText: string; llmMarkdown: string },
    opts?: { pdfPath?: string },
  ) {
    const s = sources.value.find((x) => x.id === id)
    if (!s) return
    s.extractedText = payload.extractedText
    s.llmMarkdown = payload.llmMarkdown
    s.extractionProgress = undefined
    s.status = 'ready'
    if (opts?.pdfPath) s.pdfPath = opts.pdfPath
    if (!selectedId.value) selectedId.value = id
  }

  function attachFile(id: string, file: File) {
    const s = sources.value.find((x) => x.id === id)
    if (!s) return
    s.file = file
  }

  function fail(id: string, message: string) {
    const s = sources.value.find((x) => x.id === id)
    if (!s) return
    s.status = 'error'
    s.error = message
    s.extractionProgress = undefined
    if (!selectedId.value) selectedId.value = id
  }

  async function remove(id: string) {
    const prevNb = sources.value.find((x) => x.id === id)?.notebookId
    sources.value = sources.value.filter((x) => x.id !== id)
    if (selectedId.value === id) {
      if (prevNb) pickSelectionAfterMutation(prevNb)
      else selectedId.value = null
    }
    if (isPdfDbAvailable()) await pdfDbDeleteDocument(id)
  }

  function removeAllForNotebook(notebookId: string) {
    const sel = selectedId.value
    const removesSelected = sel ? sources.value.some((s) => s.id === sel && s.notebookId === notebookId) : false
    sources.value = sources.value.filter((s) => s.notebookId !== notebookId)
    if (removesSelected) selectedId.value = null
  }

  function select(id: string | null) {
    selectedId.value = id
  }

  /** Ao trocar de caderno, manter a selecção se ainda for válida; senão a primeira fonte desse caderno. */
  function alignSelectionToNotebook(notebookId: string) {
    const list = sourcesForNotebook(notebookId)
    if (selectedId.value && list.some((s) => s.id === selectedId.value)) return
    pickSelectionAfterMutation(notebookId)
  }

  function hydrateFromDocuments(rows: DocumentRow[]) {
    const pending = sources.value.filter((s) => s.status === 'pending')
    const loaded: PdfSource[] = rows.map((r) => ({
      id: r.id,
      notebookId: r.notebook_id,
      fileName: r.file_name,
      extractedText: r.raw_plain_text,
      llmMarkdown: r.llm_markdown,
      status: 'ready' as const,
      pdfPath: r.pdf_path,
    }))
    sources.value = [...loaded, ...pending]
  }

  return {
    sources,
    selectedId,
    selected,
    sourcesForNotebook,
    addPending,
    attachFile,
    updateProgress,
    clearProgress,
    complete,
    fail,
    remove,
    removeAllForNotebook,
    select,
    alignSelectionToNotebook,
    hydrateFromDocuments,
  }
})
