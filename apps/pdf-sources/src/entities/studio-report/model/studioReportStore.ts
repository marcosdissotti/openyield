import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StudioReportRow } from '#shared/model/pdfLibraryDb'
import {
  isPdfDbAvailable,
  pdfDbDeleteStudioReport,
  pdfDbPersistStudioReport,
} from '#features/pdf-persistence/lib/pdfDbClient'

export interface StudioReport {
  id: string
  notebookId: string
  type: 'risk'
  title: string
  subtitle: string
  status: 'generating' | 'ready' | 'error'
  body: string
  createdAt: string
  progressPercent: number
  etaLabel: string
}

function rowToVm(row: StudioReportRow): StudioReport {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    status: row.status === 'generating' ? 'error' : row.status,
    body: row.body,
    createdAt: row.created_at,
    progressPercent: row.status === 'generating' ? 100 : row.progress_percent,
    etaLabel: row.status === 'generating' ? 'Interrompido' : row.eta_label,
  }
}

export const useStudioReportStore = defineStore('studioReport', () => {
  const reports = ref<StudioReport[]>([])

  function hydrateFromRows(rows: StudioReportRow[]) {
    reports.value = rows.map(rowToVm)
  }

  function reportsForNotebook(notebookId: string | null | undefined) {
    if (!notebookId) return []
    return reports.value.filter((report) => report.notebookId === notebookId)
  }

  function upsertLocal(report: StudioReport) {
    const idx = reports.value.findIndex((item) => item.id === report.id)
    if (idx >= 0) reports.value[idx] = report
    else reports.value.unshift(report)
  }

  async function persist(report: StudioReport) {
    upsertLocal(report)
    if (!isPdfDbAvailable()) return
    await pdfDbPersistStudioReport(report)
  }

  async function remove(id: string) {
    reports.value = reports.value.filter((report) => report.id !== id)
    if (isPdfDbAvailable()) await pdfDbDeleteStudioReport(id)
  }

  function removeAllForNotebook(notebookId: string) {
    reports.value = reports.value.filter((report) => report.notebookId !== notebookId)
  }

  return {
    reports,
    hydrateFromRows,
    reportsForNotebook,
    upsertLocal,
    persist,
    remove,
    removeAllForNotebook,
  }
})
