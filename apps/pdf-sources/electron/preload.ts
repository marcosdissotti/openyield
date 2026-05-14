import { contextBridge, ipcRenderer } from 'electron'

export interface HardwareSummaryPayload {
  vramBytes: number | null
  ramBytes: number | null
  sources: { vram?: string; ram?: string }
}

export interface PdfSourcesElectronApi {
  getHardwareSummary: () => Promise<HardwareSummaryPayload>
}

const api: PdfSourcesElectronApi = {
  getHardwareSummary: () => ipcRenderer.invoke('get-hardware-summary'),
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('pdfSourcesElectron', api)
}
