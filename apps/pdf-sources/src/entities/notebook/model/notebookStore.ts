import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { NotebookRow } from '#shared/model/pdfLibraryDb'
import {
  isPdfDbAvailable,
  pdfDbDeleteNotebook,
  pdfDbSetActiveNotebook,
  pdfDbUpsertNotebook,
} from '#features/pdf-persistence/lib/pdfDbClient'
import { refreshPdfWorkspaceFromDb } from '#features/pdf-persistence/bootstrapWorkspace'
import { usePdfSourcesStore } from '#entities/pdf-source'
import { useStudioReportStore } from '#entities/studio-report'
import { useFundamentalSnapshotStore } from '#entities/fundamental-snapshot'

export interface NotebookVm {
  id: string
  title: string
  ticker: string | null
  createdAt: string
}

function rowToVm(r: NotebookRow): NotebookVm {
  return { id: r.id, title: r.title, ticker: r.ticker, createdAt: r.created_at }
}

export const useNotebookStore = defineStore('notebook', () => {
  const notebooks = ref<NotebookVm[]>([])
  const activeNotebookId = ref<string | null>(null)
  const initialized = ref(false)

  const activeNotebook = computed(() => notebooks.value.find((n) => n.id === activeNotebookId.value) ?? null)

  function ensureDefaultInMemory() {
    if (notebooks.value.length) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    notebooks.value = [{ id, title: 'Caderno 1', ticker: null, createdAt: now }]
    activeNotebookId.value = id
  }

  function hydrateFromRows(rows: NotebookRow[], activeId: string | null) {
    if (!rows.length) {
      notebooks.value = []
      activeNotebookId.value = null
      ensureDefaultInMemory()
    } else {
      notebooks.value = rows.map(rowToVm)
      activeNotebookId.value = activeId && rows.some((r) => r.id === activeId) ? activeId : rows[0]!.id
    }
    initialized.value = true
  }

  async function addNotebook() {
    const id = crypto.randomUUID()
    const title = `Caderno ${notebooks.value.length + 1}`
    const now = new Date().toISOString()
    const vm: NotebookVm = { id, title, ticker: null, createdAt: now }
    notebooks.value.push(vm)
    if (isPdfDbAvailable()) await pdfDbUpsertNotebook({ id, title, ticker: null })
    await setActiveNotebook(id)
  }

  async function updateNotebookMeta(id: string, title: string, ticker: string | null) {
    const n = notebooks.value.find((x) => x.id === id)
    if (!n) return
    n.title = title
    n.ticker = ticker
    if (isPdfDbAvailable()) await pdfDbUpsertNotebook({ id, title, ticker })
  }

  async function setActiveNotebook(id: string) {
    activeNotebookId.value = id
    if (isPdfDbAvailable()) await pdfDbSetActiveNotebook(id)
  }

  async function deleteNotebookById(id: string) {
    const pdf = usePdfSourcesStore()
    const reports = useStudioReportStore()
    const fundamentals = useFundamentalSnapshotStore()
    pdf.removeAllForNotebook(id)
    reports.removeAllForNotebook(id)
    fundamentals.removeAllForNotebook(id)
    if (isPdfDbAvailable()) {
      await pdfDbDeleteNotebook(id)
      await refreshPdfWorkspaceFromDb()
      return
    }
    const idx = notebooks.value.findIndex((x) => x.id === id)
    if (idx >= 0) notebooks.value.splice(idx, 1)
    if (activeNotebookId.value === id) {
      activeNotebookId.value = notebooks.value[0]?.id ?? null
    }
    if (!notebooks.value.length) ensureDefaultInMemory()
  }

  return {
    notebooks,
    activeNotebookId,
    activeNotebook,
    initialized,
    ensureDefaultInMemory,
    hydrateFromRows,
    addNotebook,
    updateNotebookMeta,
    setActiveNotebook,
    deleteNotebookById,
  }
})
