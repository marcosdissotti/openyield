import { BrowserWindow, ipcMain } from 'electron'

let mainWindow: BrowserWindow | null = null

function sendMaximizedState(win: BrowserWindow) {
  win.webContents.send('window-maximized-changed', win.isMaximized())
}

export function attachMainWindow(win: BrowserWindow) {
  mainWindow = win
  win.on('maximize', () => sendMaximizedState(win))
  win.on('unmaximize', () => sendMaximizedState(win))
}

export function registerWindowControlsIpc() {
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })

  ipcMain.on('window-close', () => {
    mainWindow?.close()
  })
}
