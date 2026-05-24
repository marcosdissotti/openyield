import type { OcrChartReconstruction } from './chartReconstruction'

export interface InferredHtmlTable {
  title: string
  headers: string[]
  rows: string[][]
}

export type PagePreviewVisual =
  | {
      pageNum: number
      mode: 'chart'
      chart: OcrChartReconstruction
      /** Layout tabular na mesma página: mostra-se no preview; ao VL envia-se só recorte heurístico do gráfico. */
      companionTables?: InferredHtmlTable[]
    }
  | { pageNum: number; mode: 'table'; sourceLabel: string; tables: InferredHtmlTable[]; note: string }
