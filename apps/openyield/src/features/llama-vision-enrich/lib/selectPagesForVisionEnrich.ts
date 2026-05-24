import { buildPagePreviewVisualMap } from '#widgets/chart-reconstruct/lib/buildPagePreviewVisualMap'

export interface SelectVisionPagesOptions {
  /**
   * Páginas com **bitmap embutido** no PDF (1-based), vindas da extração (`bitmapPageNumbers`).
   * Mesmo quando o layout textual parece tabela, a página pode conter gráfico raster acima da tabela.
   */
  bitmapPageNumbers?: readonly number[]
}

/**
 * Páginas candidatas ao enriquecimento por visão (LLM multimodal).
 *
 * - Inclui páginas em que o preview inferiu **gráfico** (`mode: chart`) a partir de OCR/layout.
 * - Inclui páginas com **bitmap** no PDF. Quando o preview classifica como tabela, o enriquecimento
 *   usa recorte superior para capturar gráficos acima de quadros tabulares sem enviar a tabela inteira.
 */
export function selectPagesForVisionEnrich(
  llmMarkdown: string,
  options?: SelectVisionPagesOptions,
): number[] {
  const map = buildPagePreviewVisualMap(llmMarkdown)
  const bitmap = new Set(options?.bitmapPageNumbers ?? [])
  const candidates = new Set<number>()

  for (const [pageNum, v] of map) {
    if (v.mode === 'chart') candidates.add(pageNum)
  }
  for (const p of bitmap) {
    candidates.add(p)
  }
  return [...candidates].sort((a, b) => a - b)
}
