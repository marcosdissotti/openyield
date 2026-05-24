import { useLlmRuntimeStore } from '#entities/llm-runtime'
import { useGrahamSnapshotStore } from '#entities/graham-snapshot/model/grahamSnapshotStore'
import { useGrahamNumberSnapshotStore } from '#entities/graham-number-snapshot/model/grahamNumberSnapshotStore'
import { bootstrapPdfWorkspace } from '#features/pdf-persistence/bootstrapWorkspace'
import { isElectronDesktop } from '#shared/lib/isElectronDesktop'

export type WorkspacePackImportMode = 'replace' | 'merge'

export interface OpenYieldPackManifest {
  format: string
  formatVersion: number
  exportedAt: string
  appVersion?: string
  llmSettings?: Record<string, unknown> | null
  localSnapshots?: Record<string, unknown> | null
}

export interface WorkspacePackExportPayload {
  appVersion?: string
  includeLlmSettings: boolean
  includeLocalSnapshots: boolean
  llmSettings?: Record<string, unknown> | null
  localSnapshots?: Record<string, unknown> | null
}

export function isWorkspacePackAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.openYieldElectron?.workspaceExportPack
}

export function workspacePackUnavailableReason(): string | null {
  if (isWorkspacePackAvailable()) return null
  if (isElectronDesktop()) {
    return 'Reinicie a app OpenYield (feche e abra de novo). Se persistir, actualize para a versão mais recente.'
  }
  return 'Importar e exportar só funciona na app desktop (Electron), não no browser.'
}

const LOCAL_SNAPSHOT_KEYS = {
  grahamSnapshots: 'openyield.grahamSnapshots.fallback.v1',
  grahamNumberSnapshots: 'openyield.grahamNumberSnapshots.fallback.v1',
  fcdSnapshots: 'openyield.fcdSnapshots.fallback.v1',
  fundamentalSnapshots: 'openyield.fundamentalSnapshots.fallback.v1',
} as const

export function collectLocalSnapshotsForExport(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, lsKey] of Object.entries(LOCAL_SNAPSHOT_KEYS)) {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw) out[key] = JSON.parse(raw)
    } catch {
      /* ignore corrupt entries */
    }
  }
  return out
}

export function applyImportedLocalSnapshots(localSnapshots: Record<string, unknown> | null | undefined): void {
  if (!localSnapshots) return
  for (const [key, lsKey] of Object.entries(LOCAL_SNAPSHOT_KEYS)) {
    const value = localSnapshots[key]
    if (value == null) continue
    try {
      localStorage.setItem(lsKey, JSON.stringify(value))
    } catch {
      /* ignore quota errors */
    }
  }
}

export interface WorkspacePackExportResult {
  canceled: boolean
  path?: string
}

export interface WorkspacePackImportResult {
  canceled: boolean
  fileName?: string
  mode?: WorkspacePackImportMode
  manifest?: OpenYieldPackManifest
}

export async function exportWorkspacePack(payload: WorkspacePackExportPayload): Promise<WorkspacePackExportResult> {
  const api = window.openYieldElectron
  if (!api?.workspaceExportPack) {
    throw new Error('Exportação só disponível na app desktop (Electron).')
  }
  return api.workspaceExportPack({
    appVersion: payload.appVersion,
    llmSettings: payload.includeLlmSettings ? payload.llmSettings ?? null : null,
    localSnapshots: payload.includeLocalSnapshots ? payload.localSnapshots ?? null : null,
  })
}

export async function importWorkspacePack(mode: WorkspacePackImportMode): Promise<WorkspacePackImportResult> {
  const api = window.openYieldElectron
  if (!api?.workspaceImportPack) {
    throw new Error('Importação só disponível na app desktop (Electron).')
  }
  const raw = await api.workspaceImportPack({ mode })
  return {
    canceled: raw.canceled,
    fileName: raw.fileName,
    mode: raw.mode,
    manifest: raw.manifest as OpenYieldPackManifest | undefined,
  }
}

export async function applyImportedPackToApp(manifest: OpenYieldPackManifest | null | undefined): Promise<void> {
  if (!manifest) return

  const llmStore = useLlmRuntimeStore()
  llmStore.importSettings(manifest.llmSettings as Parameters<typeof llmStore.importSettings>[0])
  applyImportedLocalSnapshots(manifest.localSnapshots as Record<string, unknown> | null | undefined)

  await bootstrapPdfWorkspace()

  const graham = useGrahamSnapshotStore()
  graham.hydrateFromRows([])

  const grahamNumber = useGrahamNumberSnapshotStore()
  grahamNumber.hydrateFromLocalStorage()
}
