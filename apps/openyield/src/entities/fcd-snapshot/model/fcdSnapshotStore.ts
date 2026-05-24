import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FcdSnapshotRow } from '#shared/model/pdfLibraryDb'
import type { FcdModelInputs } from '#features/fcd-calc/model/fcdTypes'
import type { FcdFormulaFieldId } from '#features/fcd-calc/lib/fcdFormulas'
import { defaultFcdInputs } from '#features/fcd-calc/model/fcdTypes'
import {
  isPdfDbAvailable,
  pdfDbDeleteFcdSnapshot,
  pdfDbPersistFcdSnapshot,
} from '#features/pdf-persistence/lib/pdfDbClient'

const LS_KEY = 'openyield.fcdSnapshots.fallback.v1'

export interface FcdNotebookState {
  inputs: FcdModelInputs
  formulaOverrides: Partial<Record<FcdFormulaFieldId, string>>
}

function readFallback(): FcdSnapshotRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as unknown
    return Array.isArray(parsed) ? (parsed as FcdSnapshotRow[]) : []
  } catch {
    return []
  }
}

function writeFallback(rows: FcdSnapshotRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, 100)))
}

function parseSnapshot(json: string): FcdNotebookState | null {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    if ('inputs' in parsed && parsed.inputs && typeof parsed.inputs === 'object') {
      const row = parsed as { inputs: FcdModelInputs; formulaOverrides?: Partial<Record<FcdFormulaFieldId, string>> }
      return {
        inputs: row.inputs,
        formulaOverrides: row.formulaOverrides ?? {},
      }
    }
    return { inputs: parsed as FcdModelInputs, formulaOverrides: {} }
  } catch {
    return null
  }
}

function serializeSnapshot(state: FcdNotebookState): string {
  return JSON.stringify({
    version: 2,
    inputs: state.inputs,
    formulaOverrides: state.formulaOverrides,
  })
}

export const useFcdSnapshotStore = defineStore('fcdSnapshot', () => {
  const byNotebookId = ref<Record<string, FcdNotebookState>>({})

  function hydrateFromRows(rows: FcdSnapshotRow[]) {
    const merged = new Map<string, FcdSnapshotRow>()
    for (const row of readFallback()) merged.set(row.notebook_id, row)
    for (const row of rows) merged.set(row.notebook_id, row)
    const next: Record<string, FcdNotebookState> = {}
    for (const [nbId, row] of merged) {
      const state = parseSnapshot(row.inputs_json)
      if (state) next[nbId] = state
    }
    byNotebookId.value = next
    writeFallback([...merged.values()])
  }

  function stateForNotebook(notebookId: string | null | undefined, ticker?: string | null): FcdNotebookState {
    if (!notebookId) {
      return { inputs: defaultFcdInputs(ticker ?? 'TICKER'), formulaOverrides: {} }
    }
    const existing = byNotebookId.value[notebookId]
    if (existing) {
      return {
        inputs: { ...existing.inputs },
        formulaOverrides: { ...existing.formulaOverrides },
      }
    }
    const t = ticker?.trim().toUpperCase() || 'TICKER'
    return { inputs: defaultFcdInputs(t), formulaOverrides: {} }
  }

  function inputsForNotebook(notebookId: string | null | undefined, ticker?: string | null): FcdModelInputs {
    return stateForNotebook(notebookId, ticker).inputs
  }

  function formulaOverridesForNotebook(notebookId: string | null | undefined): Partial<Record<FcdFormulaFieldId, string>> {
    if (!notebookId) return {}
    return { ...(byNotebookId.value[notebookId]?.formulaOverrides ?? {}) }
  }

  function setState(notebookId: string, state: FcdNotebookState) {
    byNotebookId.value = {
      ...byNotebookId.value,
      [notebookId]: {
        inputs: { ...state.inputs },
        formulaOverrides: { ...state.formulaOverrides },
      },
    }
  }

  function setInputs(notebookId: string, inputs: FcdModelInputs) {
    const prev = byNotebookId.value[notebookId]
    setState(notebookId, {
      inputs,
      formulaOverrides: prev?.formulaOverrides ?? {},
    })
  }

  async function persist(notebookId: string, ticker: string | null, state: FcdNotebookState) {
    setState(notebookId, state)
    const now = new Date().toISOString()
    const inputsJson = serializeSnapshot(state)
    const row: FcdSnapshotRow = {
      notebook_id: notebookId,
      ticker,
      inputs_json: inputsJson,
      created_at: now,
      updated_at: now,
    }
    const fallback = readFallback().filter((r) => r.notebook_id !== notebookId)
    fallback.unshift(row)
    writeFallback(fallback)
    if (isPdfDbAvailable()) {
      await pdfDbPersistFcdSnapshot({
        notebookId,
        ticker,
        inputsJson,
      })
    }
  }

  function removeAllForNotebook(notebookId: string) {
    const next = { ...byNotebookId.value }
    delete next[notebookId]
    byNotebookId.value = next
    writeFallback(readFallback().filter((r) => r.notebook_id !== notebookId))
    if (isPdfDbAvailable()) void pdfDbDeleteFcdSnapshot(notebookId)
  }

  return {
    byNotebookId,
    hydrateFromRows,
    stateForNotebook,
    inputsForNotebook,
    formulaOverridesForNotebook,
    setState,
    setInputs,
    persist,
    removeAllForNotebook,
  }
})
