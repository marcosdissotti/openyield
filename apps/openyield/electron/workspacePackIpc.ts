import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import path from 'node:path'
import {
  exportWorkspacePack,
  importWorkspacePack,
  type WorkspacePackImportMode,
} from './workspacePack'

function activeWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export function registerWorkspacePackIpc(): void {
  ipcMain.handle(
    'workspace-export-pack',
    async (
      _event,
      payload: {
        appVersion?: string
        llmSettings?: Record<string, unknown> | null
        localSnapshots?: Record<string, unknown> | null
      },
    ) => {
      const win = activeWindow()
      const defaultName = `openyield-analise-${new Date().toISOString().slice(0, 10)}.openyield.zip`
      const dialogOptions = {
        title: 'Exportar pacote OpenYield',
        defaultPath: defaultName,
        filters: [{ name: 'Pacote OpenYield', extensions: ['zip'] }],
      }
      const { canceled, filePath } = win
        ? await dialog.showSaveDialog(win, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions)
      if (canceled || !filePath) return { canceled: true as const }

      const resolvedPath = filePath.toLowerCase().endsWith('.openyield.zip')
        ? filePath
        : filePath.toLowerCase().endsWith('.zip')
          ? filePath.replace(/\.zip$/i, '.openyield.zip')
          : `${filePath}.openyield.zip`
      try {
        const result = await exportWorkspacePack({
          destinationPath: resolvedPath,
          appVersion: payload?.appVersion,
          llmSettings: payload?.llmSettings ?? null,
          localSnapshots: payload?.localSnapshots ?? null,
        })
        return { canceled: false as const, path: result.path }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha ao exportar pacote.'
        throw new Error(message)
      }
    },
  )

  ipcMain.handle(
    'workspace-import-pack',
    async (_event, payload: { mode?: WorkspacePackImportMode }) => {
      const win = activeWindow()
      const openOptions: OpenDialogOptions = {
        title: 'Importar pacote OpenYield',
        properties: ['openFile'],
        filters: [{ name: 'Pacote OpenYield', extensions: ['zip'] }],
      }
      const { canceled, filePaths } = win
        ? await dialog.showOpenDialog(win, openOptions)
        : await dialog.showOpenDialog(openOptions)
      if (canceled || !filePaths[0]) return { canceled: true as const }

      const mode: WorkspacePackImportMode = payload?.mode === 'merge' ? 'merge' : 'replace'
      const result = await importWorkspacePack({ archivePath: filePaths[0], mode })
      return {
        canceled: false as const,
        fileName: path.basename(filePaths[0]),
        manifest: result.manifest,
        mode: result.mode,
        activeNotebookId: result.activeNotebookId,
      }
    },
  )
}
