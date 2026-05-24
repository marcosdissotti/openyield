import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FundamentalFieldRow, FundamentalSnapshotRow } from '#shared/model/pdfLibraryDb'
import {
  isPdfDbAvailable,
  pdfDbDeleteFundamentalSnapshot,
  pdfDbPersistFundamentalSnapshot,
} from '#features/pdf-persistence/lib/pdfDbClient'

export type FundamentalField = FundamentalFieldRow

const LS_KEY = 'openyield.fundamentalSnapshots.fallback.v1'

export interface FundamentalSnapshot {
  id: string
  notebookId: string
  ticker: string | null
  title: string
  status: 'generating' | 'ready' | 'error'
  fields: FundamentalField[]
  error: string | null
  progressPercent: number
  etaLabel: string
  createdAt: string
}

function rowToVm(row: FundamentalSnapshotRow): FundamentalSnapshot {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    ticker: row.ticker,
    title: row.title,
    status: row.status === 'generating' ? 'error' : row.status,
    fields: row.fields,
    error: row.status === 'generating' ? 'Extração interrompida antes de concluir.' : row.error,
    progressPercent: row.status === 'generating' ? 100 : row.progress_percent,
    etaLabel: row.status === 'generating' ? 'Interrompido' : row.eta_label,
    createdAt: row.created_at,
  }
}

function readFallbackRows(): FundamentalSnapshotRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as unknown
    return Array.isArray(parsed) ? (parsed as FundamentalSnapshotRow[]) : []
  } catch {
    return []
  }
}

function writeFallbackRows(rows: FundamentalSnapshotRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, 50)))
}

function isMissingIpcHandlerError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /no handler registered/i.test(msg) || /pdf-db-persist-fundamental-snapshot/i.test(msg)
}

function vmToRow(snapshot: FundamentalSnapshot): FundamentalSnapshotRow {
  const now = new Date().toISOString()
  return {
    id: snapshot.id,
    notebook_id: snapshot.notebookId,
    ticker: snapshot.ticker,
    title: snapshot.title,
    status: snapshot.status,
    fields: snapshot.fields,
    error: snapshot.error,
    progress_percent: snapshot.progressPercent,
    eta_label: snapshot.etaLabel,
    created_at: snapshot.createdAt,
    updated_at: now,
  }
}

async function syncFallbackRowsToDb() {
  if (!isPdfDbAvailable()) return
  const rows = readFallbackRows()
  if (!rows.length) return
  const synced = new Set<string>()
  for (const row of rows) {
    try {
      await pdfDbPersistFundamentalSnapshot(rowToVm(row))
      synced.add(row.id)
    } catch (e) {
      if (isMissingIpcHandlerError(e)) return
      console.warn('[fundamental-snapshot] Falha a sincronizar fallback local:', e)
    }
  }
  if (synced.size) {
    writeFallbackRows(readFallbackRows().filter((row) => !synced.has(row.id)))
  }
}

export const useFundamentalSnapshotStore = defineStore('fundamentalSnapshot', () => {
  const snapshots = ref<FundamentalSnapshot[]>([])

  function hydrateFromRows(rows: FundamentalSnapshotRow[]) {
    const byId = new Map<string, FundamentalSnapshotRow>()
    for (const row of readFallbackRows()) byId.set(row.id, row)
    for (const row of rows) byId.set(row.id, row)
    snapshots.value = [...byId.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(rowToVm)
    void syncFallbackRowsToDb()
  }

  function snapshotsForNotebook(notebookId: string | null | undefined) {
    if (!notebookId) return []
    return snapshots.value.filter((snapshot) => snapshot.notebookId === notebookId)
  }

  function latestForNotebook(notebookId: string | null | undefined) {
    return snapshotsForNotebook(notebookId)[0] ?? null
  }

  function upsertLocal(snapshot: FundamentalSnapshot) {
    const idx = snapshots.value.findIndex((item) => item.id === snapshot.id)
    if (idx >= 0) snapshots.value[idx] = snapshot
    else snapshots.value.unshift(snapshot)
  }

  async function persist(snapshot: FundamentalSnapshot) {
    upsertLocal(snapshot)
    const fallbackRows = readFallbackRows().filter((row) => row.id !== snapshot.id)
    fallbackRows.unshift(vmToRow(snapshot))
    writeFallbackRows(fallbackRows)
    if (!isPdfDbAvailable()) return
    try {
      await pdfDbPersistFundamentalSnapshot(snapshot)
    } catch (e) {
      if (!isMissingIpcHandlerError(e)) throw e
    }
  }

  async function remove(id: string) {
    snapshots.value = snapshots.value.filter((snapshot) => snapshot.id !== id)
    writeFallbackRows(readFallbackRows().filter((row) => row.id !== id))
    if (!isPdfDbAvailable()) return
    try {
      await pdfDbDeleteFundamentalSnapshot(id)
    } catch (e) {
      if (!isMissingIpcHandlerError(e)) throw e
    }
  }

  function removeAllForNotebook(notebookId: string) {
    snapshots.value = snapshots.value.filter((snapshot) => snapshot.notebookId !== notebookId)
    writeFallbackRows(readFallbackRows().filter((row) => row.notebook_id !== notebookId))
  }

  return {
    snapshots,
    hydrateFromRows,
    snapshotsForNotebook,
    latestForNotebook,
    upsertLocal,
    persist,
    remove,
    removeAllForNotebook,
  }
})
