import type { HardwareSummaryPayload } from '#shared/model/hardwareSummary'

export type HardwareSnapshot = HardwareSummaryPayload

/**
 * No browser: tenta `navigator.deviceMemory` (Chrome, GB aproximados); VRAM não disponível.
 * No Electron: IPC `get-hardware-summary`.
 */
export async function collectHardwareSnapshot(): Promise<HardwareSnapshot> {
  const api = typeof window !== 'undefined' ? window.pdfSourcesElectron : undefined
  if (api?.getHardwareSummary) {
    return api.getHardwareSummary()
  }
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined
  const dm = nav?.deviceMemory
  if (dm != null && dm > 0) {
    return {
      vramBytes: null,
      ramBytes: Math.round(dm * 1024 ** 3),
      sources: { ram: 'navigator.deviceMemory (GB aprox.)' },
    }
  }
  return { vramBytes: null, ramBytes: null, sources: { ram: 'desconhecido' } }
}
