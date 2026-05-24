export type ExtractionPhase = 'text' | 'raster' | 'ocr' | 'vision'

export interface ExtractionProgress {
  phase: ExtractionPhase
  pageCurrent: number
  pageTotal: number
  percent: number
  /** Linha curta (ex.: lista lateral) */
  label: string
  /** Descrição completa do passo (painel central) */
  detail?: string
  /** Estimativa grosseira de segundos restantes (a partir do ritmo até agora) */
  etaSeconds?: number
}
