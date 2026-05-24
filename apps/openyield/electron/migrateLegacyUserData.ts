import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/** Pastas userData de builds/nomes antigos (pdf-sources → openyield). */
const LEGACY_USER_DATA_DIR_NAMES = ['pdf-sources', 'PDF Sources', 'rihubai', 'OpenYield']

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0
  try {
    return readdirSync(dir).length
  } catch {
    return 0
  }
}

function workspaceLooksEmpty(workspacePath: string): boolean {
  if (!existsSync(workspacePath)) return true
  try {
    const raw = readFileSync(workspacePath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      reports?: unknown[]
      fundamentals?: unknown[]
      notebooks?: Array<{ title?: string }>
    }
    const reports = Array.isArray(parsed.reports) ? parsed.reports.length : 0
    const fundamentals = Array.isArray(parsed.fundamentals) ? parsed.fundamentals.length : 0
    if (reports > 0 || fundamentals > 0) return false
    const notebooks = Array.isArray(parsed.notebooks) ? parsed.notebooks : []
    if (notebooks.length !== 1) return false
    return (notebooks[0]?.title ?? '') === 'Caderno 1'
  } catch {
    return true
  }
}

function legacyHasUserContent(legacyVectra: string): boolean {
  const workspacePath = path.join(legacyVectra, 'workspace.json')
  if (!existsSync(workspacePath)) return false
  if (statSync(workspacePath).size > 4096) return true
  if (countFiles(path.join(legacyVectra, 'pdfs')) > 0) return true
  const documentsDir = path.join(legacyVectra, 'documents')
  if (countFiles(documentsDir) > 1) return true
  try {
    const parsed = JSON.parse(readFileSync(workspacePath, 'utf-8')) as {
      reports?: unknown[]
      fundamentals?: unknown[]
    }
    return (
      (Array.isArray(parsed.reports) && parsed.reports.length > 0) ||
      (Array.isArray(parsed.fundamentals) && parsed.fundamentals.length > 0)
    )
  } catch {
    return false
  }
}

/**
 * Copia workspace + PDFs + índice Vectra da instalação antiga (pdf-sources) para openyield.
 * Só corre se o workspace atual estiver vazio e existir dados legados.
 */
export function migrateLegacyUserDataIfNeeded(): void {
  const currentUserData = app.getPath('userData')
  const currentVectra = path.join(currentUserData, 'vectra')
  const currentWorkspace = path.join(currentVectra, 'workspace.json')

  if (!workspaceLooksEmpty(currentWorkspace)) return

  const parent = path.dirname(currentUserData)
  for (const legacyName of LEGACY_USER_DATA_DIR_NAMES) {
    if (legacyName === path.basename(currentUserData)) continue

    const legacyVectra = path.join(parent, legacyName, 'vectra')
    if (!legacyHasUserContent(legacyVectra)) continue

    try {
      cpSync(legacyVectra, currentVectra, { recursive: true, force: true })
      console.info(
        `[openyield] Workspace migrado de ${path.join(parent, legacyName)} → ${currentUserData}`,
      )
      return
    } catch (error) {
      console.error('[openyield] Falha a migrar dados legados:', error)
    }
  }
}
