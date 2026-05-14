import type { OcrChartReconstruction } from './chartReconstruction'

export interface InferredHtmlTable {
  title: string
  headers: string[]
  rows: string[][]
}

export type PagePreviewVisual =
  | { pageNum: number; mode: 'chart'; chart: OcrChartReconstruction }
  | { pageNum: number; mode: 'table'; sourceLabel: string; tables: InferredHtmlTable[]; note: string }
