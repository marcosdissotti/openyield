import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOpenYieldDotEnv } from './appEnv'
import { resolveAppIconPath } from './appIcon'
import { readHardwareSummary } from './hardware'
import { attachMainWindow, registerWindowControlsIpc } from './windowControlsIpc'
import { migrateLegacyUserDataIfNeeded } from './migrateLegacyUserData'
import { registerVectorIpc } from './vectorIpc'

const isDev = !!process.env.VITE_DEV_SERVER_URL

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainDir = __dirname
loadOpenYieldDotEnv(path.join(mainDir, '..'), process.cwd())

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
      '[openyield] Preload em falta:',
      preload,
      '| __dirname:',
      __dirname,
      '| cwd:',
      process.cwd(),
      '| Gere com: npx esbuild electron/preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist-electron/preload.cjs',
    )
  } else if (process.env.VITE_DEV_SERVER_URL) {
    console.info('[openyield] Preload:', preload)
  }

  const iconPath = resolveAppIconPath()

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload,
    },
  })
  win.setMenuBarVisibility(false)
  attachMainWindow(win)

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexHtml = path.join(mainDir, '..', 'dist', 'index.html')
    void win.loadFile(indexHtml)
  }

  console.info('[openyield] App iniciado. Índice Vectra em:', vectorDbPath())
}

ipcMain.handle('get-hardware-summary', async () => readHardwareSummary())
registerWindowControlsIpc()
registerVectorIpc()

app.whenReady().then(() => {
  migrateLegacyUserDataIfNeeded()

  if (process.platform === 'darwin') {
    const iconPath = resolveAppIconPath()
    if (iconPath) app.dock?.setIcon(iconPath)
  }

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
