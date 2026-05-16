import { buildPagePreviewVisualMap } from '#widgets/chart-reconstruct/lib/buildPagePreviewVisualMap'

/** Fração da altura (desde o topo) enviada ao VL quando há gráfico + tabelas no layout — heurística “gráfico na zona superior”. */
export const VISION_MIXED_PAGE_CHART_TOP_FRACTION = 0.55

export type VisionNormRect = { x: number; y: number; w: number; h: number }

/**
 * Quando a página tem gráfico inferido (OCR/layout) **e** tabelas de layout na mesma folha,
 * o VL recebe só o recorte superior para não confundir com o quadro tabular.
 */
export function visionImageCropNormForPage(llmMarkdown: string, pageNum: number): VisionNormRect | null {
  const v = buildPagePreviewVisualMap(llmMarkdown).get(pageNum)
  if (v?.mode === 'chart' && v.companionTables?.length) {
    return { x: 0, y: 0, w: 1, h: VISION_MIXED_PAGE_CHART_TOP_FRACTION }
  }
  return null
}
