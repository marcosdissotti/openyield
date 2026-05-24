import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  defaultGrahamNumberInputs,
  type GrahamNumberModelInputs,
} from '#features/graham-calc/model/grahamNumberTypes'

const LS_KEY = 'openyield.grahamNumberSnapshots.fallback.v1'

interface GrahamNumberSnapshotRow {
  notebook_id: string
  ticker: string | null
  inputs_json: string
}

function readFallback(): GrahamNumberSnapshotRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as unknown
    return Array.isArray(parsed) ? (parsed as GrahamNumberSnapshotRow[]) : []
  } catch {
    return []
  }
}

function writeFallback(rows: GrahamNumberSnapshotRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, 100)))
}

function parseInputs(json: string): GrahamNumberModelInputs | null {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as GrahamNumberModelInputs
  } catch {
    return null
  }
}

export const useGrahamNumberSnapshotStore = defineStore('grahamNumberSnapshot', () => {
  const byNotebookId = ref<Record<string, GrahamNumberModelInputs>>({})

  function inputsForNotebook(
    notebookId: string | null | undefined,
    ticker?: string | null,
  ): GrahamNumberModelInputs {
    if (!notebookId) return defaultGrahamNumberInputs(ticker ?? 'TICKER')
    const existing = byNotebookId.value[notebookId]
    if (existing) {
      return { ...existing, ticker: ticker ?? existing.ticker }
    }
    return defaultGrahamNumberInputs(ticker ?? 'TICKER')
  }

  function persist(
    notebookId: string,
    ticker: string | null | undefined,
    inputs: GrahamNumberModelInputs,
  ) {
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

  return {
    byNotebookId,
    inputsForNotebook,
    persist,
  }
})
