import { createWriteStream, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import archiver from 'archiver'
import extract from 'extract-zip'
import { app } from 'electron'
import type { FcdSnapshotRow, FundamentalSnapshotRow, NotebookRow, StudioReportRow } from '../src/shared/model/pdfLibraryDb'
import { resetVectorService } from './vectorService'

export const OPENYIELD_PACK_FORMAT = 'openyield-pack'
export const OPENYIELD_PACK_VERSION = 1

export interface OpenYieldPackManifest {
  format: typeof OPENYIELD_PACK_FORMAT
  formatVersion: number
  exportedAt: string
  appVersion?: string
  llmSettings?: Record<string, unknown> | null
  localSnapshots?: Record<string, unknown> | null
}

export type WorkspacePackImportMode = 'replace' | 'merge'

export interface WorkspacePackExportOptions {
  destinationPath: string
  appVersion?: string
  llmSettings?: Record<string, unknown> | null
  localSnapshots?: Record<string, unknown> | null
}

export interface WorkspacePackImportOptions {
  archivePath: string
  mode: WorkspacePackImportMode
}

export interface WorkspacePackImportResult {
  manifest: OpenYieldPackManifest
  mode: WorkspacePackImportMode
  activeNotebookId: string | null
}

interface WorkspaceMeta {
  notebooks: NotebookRow[]
  activeNotebookId: string | null
  reports?: StudioReportRow[]
  fundamentals?: FundamentalSnapshotRow[]
  fcdSnapshots?: FcdSnapshotRow[]
}

interface VectraIndexFile {
  version?: number
  metadata_config?: Record<string, unknown>
  items?: Array<Record<string, unknown>>
}

function vectraRoot(): string {
  return path.join(app.getPath('userData'), 'vectra')
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, filePath)
}

function copyDirMerge(sourceDir: string, targetDir: string): void {
  if (!existsSync(sourceDir)) return
  if (!existsSync(targetDir)) {
    cpSync(sourceDir, targetDir, { recursive: true })
    return
  }
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const from = path.join(sourceDir, entry.name)
    const to = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDirMerge(from, to)
    } else if (!existsSync(to)) {
      cpSync(from, to)
    }
  }
}

function mergeRowsByKey<T, K extends keyof T>(current: T[], imported: T[], key: K): T[] {
  const byKey = new Map<string, T>()
  for (const row of current) {
    const id = String(row[key] ?? '')
    if (id) byKey.set(id, row)
  }
  for (const row of imported) {
    const id = String(row[key] ?? '')
    if (!id) continue
    if (!byKey.has(id)) byKey.set(id, row)
  }
  return [...byKey.values()]
}

function mergeFcdSnapshots(current: FcdSnapshotRow[], imported: FcdSnapshotRow[]): FcdSnapshotRow[] {
  const byNotebook = new Map(current.map((row) => [row.notebook_id, row]))
  for (const row of imported) {
    if (!byNotebook.has(row.notebook_id)) byNotebook.set(row.notebook_id, row)
  }
  return [...byNotebook.values()]
}

function mergeWorkspaceMeta(current: WorkspaceMeta, imported: WorkspaceMeta): WorkspaceMeta {
  const notebooks = mergeRowsByKey(current.notebooks ?? [], imported.notebooks ?? [], 'id')
  const notebooksById = new Map(notebooks.map((row) => [row.id, row]))
  const reports = mergeRowsByKey(current.reports ?? [], imported.reports ?? [], 'id')
  const fundamentals = mergeRowsByKey(current.fundamentals ?? [], imported.fundamentals ?? [], 'id')
  const fcdSnapshots = mergeFcdSnapshots(current.fcdSnapshots ?? [], imported.fcdSnapshots ?? [])

  const activeNotebookId =
    imported.activeNotebookId && notebooksById.has(imported.activeNotebookId)
      ? imported.activeNotebookId
      : current.activeNotebookId && notebooksById.has(current.activeNotebookId)
        ? current.activeNotebookId
        : notebooks[0]?.id ?? null

  return {
    notebooks,
    activeNotebookId,
    reports,
    fundamentals,
    fcdSnapshots,
  }
}

function parseFcdSnapshotRows(raw: unknown): FcdSnapshotRow[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((row): row is FcdSnapshotRow => {
    return !!row && typeof row === 'object' && typeof (row as FcdSnapshotRow).notebook_id === 'string'
  })
}

function applyLocalSnapshotsToWorkspaceMeta(
  meta: WorkspaceMeta,
  localSnapshots: Record<string, unknown> | null | undefined,
): WorkspaceMeta {
  if (!localSnapshots) return meta
  const importedFcd = parseFcdSnapshotRows(localSnapshots.fcdSnapshots)
  if (!importedFcd.length) return meta
  return {
    ...meta,
    fcdSnapshots: mergeFcdSnapshots(meta.fcdSnapshots ?? [], importedFcd),
  }
}

function mergeVectraIndex(currentDir: string, importedDir: string): void {
  const currentPath = path.join(currentDir, 'index.json')
  const importedPath = path.join(importedDir, 'index.json')
  const current = readJsonFile<VectraIndexFile>(currentPath)
  const imported = readJsonFile<VectraIndexFile>(importedPath)
  if (!imported?.items?.length) return
  if (!current?.items?.length) {
    if (existsSync(importedPath)) cpSync(importedPath, currentPath)
    return
  }

  const byId = new Map<string, Record<string, unknown>>()
  for (const item of current.items) {
    const id = typeof item.id === 'string' ? item.id : ''
    if (id) byId.set(id, item)
  }
  for (const item of imported.items) {
    const id = typeof item.id === 'string' ? item.id : ''
    if (id && !byId.has(id)) byId.set(id, item)
  }

  writeJsonFile(currentPath, {
    ...current,
    items: [...byId.values()],
  })
}

async function zipDirectory(sourceDir: string, destinationZip: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(destinationZip)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)

    archive.pipe(output)
    archive.directory(sourceDir, false)
    void archive.finalize()
  })
}

function validateManifest(raw: unknown): OpenYieldPackManifest {
  if (!raw || typeof raw !== 'object') throw new Error('Pacote inválido: manifest em falta.')
  const manifest = raw as Partial<OpenYieldPackManifest>
  if (manifest.format !== OPENYIELD_PACK_FORMAT) {
    throw new Error('Ficheiro não é um pacote OpenYield válido.')
  }
  if ((manifest.formatVersion ?? 0) > OPENYIELD_PACK_VERSION) {
    throw new Error('Versão do pacote mais recente que esta app. Atualize o OpenYield.')
  }
  return manifest as OpenYieldPackManifest
}

function enrichVectraWithLocalSnapshots(
  vectraDir: string,
  localSnapshots: Record<string, unknown> | null | undefined,
): void {
  const workspacePath = path.join(vectraDir, 'workspace.json')
  const meta = readJsonFile<WorkspaceMeta>(workspacePath)
  if (!meta) return
  writeJsonFile(workspacePath, applyLocalSnapshotsToWorkspaceMeta(meta, localSnapshots))
}

export async function exportWorkspacePack(options: WorkspacePackExportOptions): Promise<{ path: string }> {
  const sourceVectra = vectraRoot()
  if (!existsSync(sourceVectra)) {
    throw new Error('Não há dados Vectra para exportar.')
  }

  const stagingDir = mkdtempSync(path.join(tmpdir(), 'openyield-export-'))
  try {
    const manifest: OpenYieldPackManifest = {
      format: OPENYIELD_PACK_FORMAT,
      formatVersion: OPENYIELD_PACK_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: options.appVersion,
      llmSettings: options.llmSettings ?? null,
      localSnapshots: options.localSnapshots ?? null,
    }

    writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    cpSync(sourceVectra, path.join(stagingDir, 'vectra'), { recursive: true })
    enrichVectraWithLocalSnapshots(path.join(stagingDir, 'vectra'), options.localSnapshots ?? null)

    await zipDirectory(stagingDir, options.destinationPath)
    return { path: options.destinationPath }
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }
}

export async function importWorkspacePack(options: WorkspacePackImportOptions): Promise<WorkspacePackImportResult> {
  const extractDir = mkdtempSync(path.join(tmpdir(), 'openyield-import-'))
  const currentVectra = vectraRoot()

  try {
    await extract(options.archivePath, { dir: extractDir })

    const manifest = validateManifest(readJsonFile(path.join(extractDir, 'manifest.json')))
    const importedVectra = path.join(extractDir, 'vectra')
    if (!existsSync(importedVectra)) {
      throw new Error('Pacote inválido: pasta vectra em falta.')
    }

    let activeNotebookId: string | null = null

    if (options.mode === 'replace') {
      rmSync(currentVectra, { recursive: true, force: true })
      cpSync(importedVectra, currentVectra, { recursive: true })
      const replacedMeta = readJsonFile<WorkspaceMeta>(path.join(currentVectra, 'workspace.json'))
      activeNotebookId = replacedMeta?.activeNotebookId ?? null
    } else if (!existsSync(currentVectra)) {
      cpSync(importedVectra, currentVectra, { recursive: true })
      const importedMeta = readJsonFile<WorkspaceMeta>(path.join(currentVectra, 'workspace.json'))
      activeNotebookId = importedMeta?.activeNotebookId ?? null
    } else {
      const currentWorkspace = readJsonFile<WorkspaceMeta>(path.join(currentVectra, 'workspace.json')) ?? {
        notebooks: [],
        activeNotebookId: null,
      }
      const importedWorkspace = readJsonFile<WorkspaceMeta>(path.join(importedVectra, 'workspace.json')) ?? {
        notebooks: [],
        activeNotebookId: null,
      }
      const merged = mergeWorkspaceMeta(currentWorkspace, importedWorkspace)
      writeFileSync(path.join(currentVectra, 'workspace.json'), JSON.stringify(merged, null, 2))
      activeNotebookId = merged.activeNotebookId

      copyDirMerge(path.join(importedVectra, 'pdfs'), path.join(currentVectra, 'pdfs'))
      copyDirMerge(path.join(importedVectra, 'documents'), path.join(currentVectra, 'documents'))
      mergeVectraIndex(path.join(currentVectra, 'documents'), path.join(importedVectra, 'documents'))
    }

    if (manifest.localSnapshots) {
      const meta = readJsonFile<WorkspaceMeta>(path.join(currentVectra, 'workspace.json'))
      if (meta) {
        const enriched = applyLocalSnapshotsToWorkspaceMeta(meta, manifest.localSnapshots)
        writeFileSync(path.join(currentVectra, 'workspace.json'), JSON.stringify(enriched, null, 2))
      }
    }

    resetVectorService()
    return { manifest, mode: options.mode, activeNotebookId }
  } finally {
    rmSync(extractDir, { recursive: true, force: true })
  }
}
