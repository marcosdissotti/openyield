import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPdfSourcesDotEnv } from './appEnv'
import { readHardwareSummary } from './hardware'
import { registerVectorIpc } from './vectorIpc'

const isDev = !!process.env.VITE_DEV_SERVER_URL

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainDir = __dirname
loadPdfSourcesDotEnv(path.join(mainDir, '..'), process.cwd())

function vectorDbPath(): string {
  return path.join(app.getPath('userData'), 'vectra', 'documents')
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
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload,
    },
  })
  win.setMenuBarVisibility(false)

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexHtml = path.join(mainDir, '..', 'dist', 'index.html')
    void win.loadFile(indexHtml)
  }

  console.info('[pdf-sources] App iniciado. Índice Vectra em:', vectorDbPath())
}

ipcMain.handle('get-hardware-summary', async () => readHardwareSummary())
registerVectorIpc()

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
