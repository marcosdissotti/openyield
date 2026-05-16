import { buildPagePreviewVisualMap } from '#widgets/chart-reconstruct/lib/buildPagePreviewVisualMap'

export interface SelectVisionPagesOptions {
  /**
   * Páginas com **bitmap embutido** no PDF (1-based), vindas da extração (`bitmapPageNumbers`).
   * Páginas já classificadas como **tabela** no preview (layout TSV) **não** são enviadas ao VL, mesmo com bitmap.
   */
  bitmapPageNumbers?: readonly number[]
}

/**
 * Páginas candidatas ao enriquecimento por visão (LLM multimodal).
 *
 * - Inclui páginas em que o preview inferiu **gráfico** (`mode: chart`) a partir de OCR/layout.
 * - Inclui páginas com **bitmap** no PDF **desde que** o preview **não** as classifique como **só tabela**
 *   (`mode: table` no layout TSV) — quadros financeiros tabulares deixam de ir para a IA.
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
    if (map.get(p)?.mode === 'table') continue
    candidates.add(p)
  }
  return [...candidates].sort((a, b) => a - b)
}
