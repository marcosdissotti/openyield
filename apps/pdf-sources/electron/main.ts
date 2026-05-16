import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPdfSourcesDotEnv } from './appEnv'
import { getActiveNotebookId, getPdfDb } from './pdfDb'
import { readHardwareSummary } from './hardware'
import { registerPdfDbIpc } from './pdfDbIpc'

const isDev = !!process.env.VITE_DEV_SERVER_URL

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainDir = __dirname
loadPdfSourcesDotEnv(path.join(mainDir, '..'), process.cwd())

/** dbPath está aqui apenas para compatibilidade caso seja chamado em outro lugar */
function dbPath(): string {
  return path.join(app.getPath('userData'), 'pdf-sources-data', 'library.sqlite')
}

function resolvePreloadPath(): string {
  const nextToMain = path.join(__dirname, 'preload.cjs')
  if (existsSync(nextToMain)) return nextToMain
  const fromCwd = path.join(process.cwd(), 'dist-electron', 'preload.cjs')
  if (existsSync(fromCwd)) return fromCwd
  return nextToMain
}

function createWindow() {
  const preload = resolvePreloadPath()
  if (!existsSync(preload)) {
    console.error(
      '[pdf-sources] Preload em falta:',
      preload,
      '| __dirname:',
      __dirname,
      '| cwd:',
      process.cwd(),
      '| Gere com: npx esbuild electron/preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist-electron/preload.cjs',
    )
  } else if (process.env.VITE_DEV_SERVER_URL) {
    console.info('[pdf-sources] Preload:', preload)
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload,
    },
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexHtml = path.join(mainDir, '..', 'dist', 'index.html')
    void win.loadFile(indexHtml)
  }

  // Log de inicialização do banco
  console.info('[pdf-sources] App iniciado. Banco de dados em:', dbPath())
}

ipcMain.handle('get-hardware-summary', async () => readHardwareSummary())
registerPdfDbIpc()

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
