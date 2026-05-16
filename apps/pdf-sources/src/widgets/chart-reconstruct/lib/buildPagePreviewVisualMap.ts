import type { PagePreviewVisual } from '../model/pagePreviewVisual'
import { extractPageSectionBodies } from './extractOcrSectionsFromMarkdown'
import { tryExtractTablesFromTsvBody } from './extractTablesFromTsvBody'
import { tryBuildAllChartReconstructions } from './tryBuildAllOcrChartReconstructions'

function allPageNums(markdown: string): number[] {
  const s = new Set<number>()
  const re = /^## Página (\d+)/gm
  let m: RegExpExecArray | null
  const norm = markdown.replace(/\r\n/g, '\n')
  while ((m = re.exec(norm)) !== null) s.add(parseInt(m[1]!, 10))
  return Array.from(s).sort((a, b) => a - b)
}

/**
 * Por página: gráfico Chart.js quando a reconstrução for plausível; se o layout TSV tiver também
 * quadros tabulares na mesma página, ficam em `companionTables` (gráfico + tabelas no preview;
 * o VL pode usar recorte só do gráfico). Sem gráfico: tabela(s) a partir do layout.
 */
export function buildPagePreviewVisualMap(markdown: string): Map<number, PagePreviewVisual> {
  const md = markdown.replace(/\r\n/g, '\n')
  const map = new Map<number, PagePreviewVisual>()
  const charts = tryBuildAllChartReconstructions(md)
  const chartByPage = new Map(charts.map((c) => [c.pageNum, c]))
  const layoutBodies = extractPageSectionBodies(md, 'layout')

  for (const pageNum of allPageNums(md)) {
    const chart = chartByPage.get(pageNum)
    const layout = layoutBodies.find((b) => b.pageNum === pageNum)
    const layoutTablesRaw =
      layout?.body != null
        ? tryExtractTablesFromTsvBody(layout.body, `Página ${pageNum}`)
        : []
    const companionTables = layoutTablesRaw.filter((t) => t.rows.length >= 2 && t.headers.length >= 2)

    if (chart) {
      if (companionTables.length) {
        map.set(pageNum, { pageNum, mode: 'chart', chart, companionTables })
      } else {
        map.set(pageNum, { pageNum, mode: 'chart', chart })
      }
      continue
    }
    if (!layout?.body) continue
    if (!companionTables.length) continue
    map.set(pageNum, {
      pageNum,
      mode: 'table',
      sourceLabel: 'layout',
      tables: companionTables,
      note: 'Tabela(s) inferida(s) do layout — não foi detetado um gráfico plausível para Chart.js nesta página.',
    })
  }
  return map
}
