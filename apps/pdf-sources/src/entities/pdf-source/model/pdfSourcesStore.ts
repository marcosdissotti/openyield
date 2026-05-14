import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ExtractionProgress } from '#shared/model/extractionProgress'

export interface PdfSource {
  id: string
  fileName: string
  /** Referência ao ficheiro (preview de páginas na UI; não persistido) */
  file?: File
  /** Texto plano (camada de texto do PDF) */
  extractedText: string
  /** Markdown estruturado para prompts (LLM) */
  llmMarkdown: string
  status: 'pending' | 'ready' | 'error'
  error?: string
  extractionProgress?: ExtractionProgress
}

export const usePdfSourcesStore = defineStore('pdfSources', () => {
  const sources = ref<PdfSource[]>([])
  const selectedId = ref<string | null>(null)

  const selected = computed(() => sources.value.find((s) => s.id === selectedId.value) ?? null)

  function addPending(file: File): string {
    const id = crypto.randomUUID()
    sources.value.push({
      id,
      fileName: file.name,
      file,
      extractedText: '',
      llmMarkdown: '',
      status: 'pending',
    })
    if (!selectedId.value) selectedId.value = id
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

  function complete(id: string, payload: { extractedText: string; llmMarkdown: string }) {
    const s = sources.value.find((x) => x.id === id)
    if (!s) return
    s.extractedText = payload.extractedText
    s.llmMarkdown = payload.llmMarkdown
    s.extractionProgress = undefined
    s.status = 'ready'
    if (!selectedId.value) selectedId.value = id
  }

  function fail(id: string, message: string) {
    const s = sources.value.find((x) => x.id === id)
    if (!s) return
    s.status = 'error'
    s.error = message
    s.extractionProgress = undefined
    if (!selectedId.value) selectedId.value = id
  }

  function remove(id: string) {
    sources.value = sources.value.filter((x) => x.id !== id)
    if (selectedId.value === id) {
      const next =
        sources.value.find((x) => x.status === 'ready') ??
        sources.value.find((x) => x.status === 'error') ??
        sources.value.find((x) => x.status === 'pending') ??
        null
      selectedId.value = next?.id ?? null
    }
  }

  function select(id: string | null) {
    selectedId.value = id
  }

  return {
    sources,
    selectedId,
    selected,
    addPending,
    updateProgress,
    clearProgress,
    complete,
    fail,
    remove,
    select,
  }
})
