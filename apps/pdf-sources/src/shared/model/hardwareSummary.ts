/** Resumo de hardware devolvido pelo processo principal (Electron). */
export interface HardwareSummaryPayload {
  vramBytes: number | null
  ramBytes: number | null
  sources: { vram?: string; ram?: string }
}
