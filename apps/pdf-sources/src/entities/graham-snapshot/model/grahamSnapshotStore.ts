import { defineStore } from 'pinia'
import { ref } from 'vue'
import { defaultGrahamInputs, type GrahamModelInputs } from '#features/graham-calc/model/grahamTypes'

const LS_KEY = 'pdf-sources.grahamSnapshots.fallback.v1'

interface GrahamSnapshotRow {
  notebook_id: string
  ticker: string | null
  inputs_json: string
}

function readFallback(): GrahamSnapshotRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as unknown
    return Array.isArray(parsed) ? (parsed as GrahamSnapshotRow[]) : []
  } catch {
    return []
  }
}

function writeFallback(rows: GrahamSnapshotRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, 100)))
}

function parseInputs(json: string): GrahamModelInputs | null {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as GrahamModelInputs
  } catch {
    return null
  }
}

export const useGrahamSnapshotStore = defineStore('grahamSnapshot', () => {
  const byNotebookId = ref<Record<string, GrahamModelInputs>>({})

  function hydrateFromRows(rows: GrahamSnapshotRow[]) {
    const merged = new Map<string, GrahamSnapshotRow>()
    for (const row of readFallback()) merged.set(row.notebook_id, row)
    for (const row of rows) merged.set(row.notebook_id, row)
    const next: Record<string, GrahamModelInputs> = {}
    for (const [nbId, row] of merged) {
      const inputs = parseInputs(row.inputs_json)
      if (inputs) next[nbId] = inputs
    }
    byNotebookId.value = next
    writeFallback([...merged.values()])
  }

  function inputsForNotebook(notebookId: string | null | undefined, ticker?: string | null): GrahamModelInputs {
    if (!notebookId) return defaultGrahamInputs(ticker ?? 'TICKER')
    const existing = byNotebookId.value[notebookId]
    if (existing) {
      return {
        ...existing,
        ticker: ticker ?? existing.ticker,
      }
    }
    return defaultGrahamInputs(ticker ?? 'TICKER')
  }

  function persist(notebookId: string, ticker: string | null | undefined, inputs: GrahamModelInputs) {
    const payload = { ...inputs, ticker: ticker ?? inputs.ticker }
    byNotebookId.value = { ...byNotebookId.value, [notebookId]: payload }
    const rows = readFallback().filter((row) => row.notebook_id !== notebookId)
    rows.push({
      notebook_id: notebookId,
      ticker: ticker ?? payload.ticker,
      inputs_json: JSON.stringify(payload),
    })
    writeFallback(rows)
  }

  function deleteForNotebook(notebookId: string) {
    const next = { ...byNotebookId.value }
    delete next[notebookId]
    byNotebookId.value = next
    writeFallback(readFallback().filter((row) => row.notebook_id !== notebookId))
  }

  return {
    byNotebookId,
    hydrateFromRows,
    inputsForNotebook,
    persist,
    deleteForNotebook,
  }
})
