import type { OcrChartReconstruction } from '../model/chartReconstruction'
import { extractPageSectionBodies, type PageSectionKind } from './extractOcrSectionsFromMarkdown'
import { tryBuildChartFromTabularBody, tryBuildLooseTimeSeriesChart } from './tryBuildChartReconstructionFromOcrBody'

function scoreChartReconstruction(c: OcrChartReconstruction): number {
  let s = c.labels.length * Math.max(1, c.datasets.length) * 8
  if (c.chartKind === 'line') s += 14
  const blob = `${c.title} ${c.datasets.map((d) => d.label).join(' ')}`
  if (/inadimplência/i.test(blob)) s += 70
  if (c.datasets.length >= 3 && c.chartKind === 'line') s += 36
  if (/energia|fotovoltaica|gera[cç][aã]o\s+pr[oó]pria|mercado\s+cativo|1t\//i.test(blob)) s += 32
  if (c.chartKind === 'bar' && c.labels.length > 18) s -= 45
  if (c.labels.length > 35) s -= 100
  return s
}

function sourceLabelForKind(kind: PageSectionKind): string {
  if (kind === 'ocr') return 'OCR'
  if (kind === 'layout') return 'layout'
  return 'texto'
}

function considerBodiesForPage(
  best: Map<number, { score: number; cfg: OcrChartReconstruction }>,
  pageNum: number,
  body: string,
  kind: PageSectionKind,
) {
  const src = sourceLabelForKind(kind)
  const candidates: OcrChartReconstruction[] = []
  if (kind !== 'texto') {
    const t = tryBuildChartFromTabularBody(pageNum, body, src)
    if (t) candidates.push(t)
  }
  const l = tryBuildLooseTimeSeriesChart(pageNum, body, src)
  if (l) candidates.push(l)
  for (const cfg of candidates) {
    const sc = scoreChartReconstruction(cfg)
    const prev = best.get(pageNum)
    if (!prev || sc > prev.score) best.set(pageNum, { score: sc, cfg })
  }
}

/**
 * Reconstrói gráficos Chart.js a partir de OCR, blocos de layout (TSV) e texto extraído
 * (séries temporais soltas, ex. Mês/AA + percentual próximo).
 * No máximo um gráfico “vencedor” por número de página.
 */
export function tryBuildAllChartReconstructions(markdown: string): OcrChartReconstruction[] {
  const best = new Map<number, { score: number; cfg: OcrChartReconstruction }>()
  const kinds: PageSectionKind[] = ['ocr', 'layout', 'texto']
  for (const kind of kinds) {
    for (const { pageNum, body } of extractPageSectionBodies(markdown, kind)) {
      considerBodiesForPage(best, pageNum, body, kind)
    }
  }
  return Array.from(best.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v.cfg)
}

/** Alias histórico: agora inclui layout e texto, não só OCR. */
export const tryBuildAllOcrChartReconstructions = tryBuildAllChartReconstructions
