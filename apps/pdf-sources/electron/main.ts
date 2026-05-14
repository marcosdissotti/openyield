import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPdfSourcesDotEnv } from './appEnv'
import { readHardwareSummary } from './hardware'

const isDev = !!process.env.VITE_DEV_SERVER_URL

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainDir = __dirname
loadPdfSourcesDotEnv(path.join(mainDir, '..'), process.cwd())

/** WSL2: Chromium costuma falhar no processo GPU (`viz_main_impl`). */
function isWslKernel(): boolean {
  try {
    const v = readFileSync('/proc/version', 'utf8').toLowerCase()
    return v.includes('microsoft') || v.includes('wsl')
  } catch {
    return false
  }
}

function configureGpuForHeadlessOrWsl(): void {
  if (process.env.PDF_SOURCES_DISABLE_GPU === '0') return
  if (
    process.env.PDF_SOURCES_DISABLE_GPU === '1' ||
    process.env.ELECTRON_DISABLE_GPU === '1' ||
    isWslKernel()
  ) {
    app.disableHardwareAcceleration()
  }
}

configureGpuForHeadlessOrWsl()

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
}

ipcMain.handle('get-hardware-summary', async () => readHardwareSummary())

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
