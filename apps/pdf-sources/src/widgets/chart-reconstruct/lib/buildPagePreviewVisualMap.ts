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
 * Por página: um gráfico Chart.js quando a reconstrução tabular/solta for plausível;
 * caso contrário, tabela(s) HTML a partir do bloco layout (TSV), para páginas só com quadros.
 */
export function buildPagePreviewVisualMap(markdown: string): Map<number, PagePreviewVisual> {
  const md = markdown.replace(/\r\n/g, '\n')
  const map = new Map<number, PagePreviewVisual>()
  const charts = tryBuildAllChartReconstructions(md)
  const chartByPage = new Map(charts.map((c) => [c.pageNum, c]))
  const layoutBodies = extractPageSectionBodies(md, 'layout')

  for (const pageNum of allPageNums(md)) {
    const chart = chartByPage.get(pageNum)
    if (chart) {
      map.set(pageNum, { pageNum, mode: 'chart', chart })
      continue
    }
    const layout = layoutBodies.find((b) => b.pageNum === pageNum)
    if (!layout?.body) continue
    const tables = tryExtractTablesFromTsvBody(layout.body, `Página ${pageNum}`)
    const usable = tables.filter((t) => t.rows.length >= 2 && t.headers.length >= 2)
    if (!usable.length) continue
    map.set(pageNum, {
      pageNum,
      mode: 'table',
      sourceLabel: 'layout',
      tables: usable,
      note: 'Tabela(s) inferida(s) do layout — não foi detetado um gráfico plausível para Chart.js nesta página.',
    })
  }
  return map
}
