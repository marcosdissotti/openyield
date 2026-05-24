import { createWriteStream, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import archiver from 'archiver'
import extract from 'extract-zip'
import { app } from 'electron'
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
}

interface WorkspaceMeta {
  notebooks?: Array<{ id: string }>
  activeNotebookId?: string | null
  reports?: Array<{ id: string }>
  fundamentals?: Array<{ id: string }>
  fcdSnapshots?: Array<{ notebook_id: string }>
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

function mergeWorkspaceMeta(current: WorkspaceMeta, imported: WorkspaceMeta): WorkspaceMeta {
  const notebooksById = new Map((current.notebooks ?? []).map((row) => [row.id, row]))
  for (const row of imported.notebooks ?? []) {
    if (!notebooksById.has(row.id)) notebooksById.set(row.id, row as never)
  }

  const reportsById = new Map((current.reports ?? []).map((row) => [row.id, row]))
  for (const row of imported.reports ?? []) {
    if (!reportsById.has(row.id)) reportsById.set(row.id, row as never)
  }

  const fundamentalsById = new Map((current.fundamentals ?? []).map((row) => [row.id, row]))
  for (const row of imported.fundamentals ?? []) {
    if (!fundamentalsById.has(row.id)) fundamentalsById.set(row.id, row as never)
  }

  const fcdByNotebook = new Map((current.fcdSnapshots ?? []).map((row) => [row.notebook_id, row]))
  for (const row of imported.fcdSnapshots ?? []) {
    if (!fcdByNotebook.has(row.notebook_id)) fcdByNotebook.set(row.notebook_id, row as never)
  }

  const notebooks = [...notebooksById.values()] as WorkspaceMeta['notebooks']
  const activeNotebookId =
    current.activeNotebookId && notebooksById.has(current.activeNotebookId)
      ? current.activeNotebookId
      : imported.activeNotebookId && notebooksById.has(imported.activeNotebookId)
        ? imported.activeNotebookId
        : notebooks?.[0]?.id ?? null

  return {
    notebooks,
    activeNotebookId,
    reports: [...reportsById.values()] as WorkspaceMeta['reports'],
    fundamentals: [...fundamentalsById.values()] as WorkspaceMeta['fundamentals'],
    fcdSnapshots: [...fcdByNotebook.values()] as WorkspaceMeta['fcdSnapshots'],
  }
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

    if (options.mode === 'replace') {
      rmSync(currentVectra, { recursive: true, force: true })
      cpSync(importedVectra, currentVectra, { recursive: true })
    } else if (!existsSync(currentVectra)) {
      cpSync(importedVectra, currentVectra, { recursive: true })
    } else {
      const currentWorkspace = readJsonFile<WorkspaceMeta>(path.join(currentVectra, 'workspace.json')) ?? {}
      const importedWorkspace = readJsonFile<WorkspaceMeta>(path.join(importedVectra, 'workspace.json')) ?? {}
      const merged = mergeWorkspaceMeta(currentWorkspace, importedWorkspace)
      writeFileSync(path.join(currentVectra, 'workspace.json'), JSON.stringify(merged, null, 2))

      copyDirMerge(path.join(importedVectra, 'pdfs'), path.join(currentVectra, 'pdfs'))
      copyDirMerge(path.join(importedVectra, 'documents'), path.join(currentVectra, 'documents'))
    }

    resetVectorService()
    return { manifest, mode: options.mode }
  } finally {
    rmSync(extractDir, { recursive: true, force: true })
  }
}
