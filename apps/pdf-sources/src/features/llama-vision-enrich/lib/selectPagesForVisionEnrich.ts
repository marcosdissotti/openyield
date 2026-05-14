import { buildPagePreviewVisualMap } from '#widgets/chart-reconstruct/lib/buildPagePreviewVisualMap'

/**
 * Páginas candidatas ao enriquecimento por visão (LLM multimodal).
 * Usa o mesmo mapa que o preview: só **gráficos** inferidos a partir de OCR/layout/texto;
 * páginas classificadas apenas como **tabela** (layout TSV) são excluídas para evitar PNG desnecessários.
 */
export function selectPagesForVisionEnrich(llmMarkdown: string): number[] {
  const map = buildPagePreviewVisualMap(llmMarkdown)
  const nums: number[] = []
  for (const [pageNum, v] of map) {
    if (v.mode === 'chart') nums.push(pageNum)
  }
  return nums.sort((a, b) => a - b)
}
