export type InferredChartKind = 'line' | 'bar'

export interface OcrChartDataset {
  label: string
  data: number[]
}

/** Configuração pronta para Chart.js (category scale + datasets numéricos). */
export interface OcrChartReconstruction {
  pageNum: number
  chartKind: InferredChartKind
  title: string
  labels: string[]
  datasets: OcrChartDataset[]
}
