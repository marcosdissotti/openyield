import type { HardwareSnapshot } from './collectHardwareSnapshot'

export interface HardwareFitResult {
  ok: boolean
  /** Motivo curto quando ok === false */
  reason?: 'vram' | 'ram'
}

/**
 * Compara requisitos estimados com o hardware detetado.
 * Se não houver VRAM detetada, só aplica RAM (execução CPU / mmap é incerta para VRAM).
 */
export function modelMeetsHardware(
  hw: HardwareSnapshot,
  needVramBytes: number,
  needRamBytes: number,
): HardwareFitResult {
  if (hw.ramBytes != null && needRamBytes > hw.ramBytes * 0.92) {
    return { ok: false, reason: 'ram' }
  }
  if (hw.vramBytes != null && needVramBytes > hw.vramBytes * 0.9) {
    return { ok: false, reason: 'vram' }
  }
  return { ok: true }
}
