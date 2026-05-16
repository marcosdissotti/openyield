import type { InferredHtmlTable, OcrChartReconstruction } from '#widgets/chart-reconstruct'

export type VisionPageVisual =
  | {
      kind: 'chart'
      pageNum: number
      reportedChartType: string
      config: OcrChartReconstruction
    }
  | {
      kind: 'table'
      pageNum: number
      reportedChartType: string
      tables: InferredHtmlTable[]
    }

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => (x === null || x === undefined ? '' : String(x)))
}

function asDatasetRows(v: unknown): { label: string; cells: unknown[] }[] {
  if (!Array.isArray(v)) return []
  const out: { label: string; cells: unknown[] }[] = []
  for (const d of v) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label : ''
    const data = Array.isArray(o.data) ? o.data : []
    out.push({ label, cells: data })
  }
  return out
}

/** Tenta interpretar número (PT/EN, parêntesis = negativo, %). */
export function tryParseVisionCellNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (!s) return null
  const hadPct = /%$/.test(s)
  if (hadPct) s = s.slice(0, -1).trim()
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1).trim()
  }
  s = s.replace(/\s/g, '')
  if (!/^[-+]?[\d.,()]+$/.test(s.replace(/[()]/g, ''))) return null
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma && !hasDot) {
    if (/^\d{1,3}(,\d{3})+,\d+$/.test(s)) s = s.replace(/,/g, '')
    else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.')
    else s = s.replace(/,/g, '.')
  }
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  return neg ? -Math.abs(n) : n
}

function numericDensity(rows: { label: string; cells: unknown[] }[]): number {
  let tot = 0
  let num = 0
  for (const r of rows) {
    for (const c of r.cells) {
      tot++
      if (tryParseVisionCellNumber(c) !== null) num++
    }
  }
  return tot === 0 ? 0 : num / tot
}

function labelsLookYearly(labels: string[]): boolean {
  if (labels.length < 4) return false
  const hits = labels.filter((l) => /^\s*(?:19|20)\d{2}\s*$/.test(l)).length
  return hits >= Math.ceil(labels.length * 0.7)
}

function isNearlyArithmetic(data: number[]): boolean {
  const vals = data.filter((v) => Number.isFinite(v))
  if (vals.length < 5) return false
  const diffs: number[] = []
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i]! - vals[i - 1]!)
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
  if (Math.abs(avg) < 1e-6) return false
  const maxErr = Math.max(...diffs.map((d) => Math.abs(d - avg)))
  return maxErr <= Math.max(0.75, Math.abs(avg) * 0.08)
}

function looksLikeSyntheticVisionChart(
  reported: string,
  title: string,
  labels: string[],
  datasets: { label: string; data: number[] }[],
): boolean {
  if (!datasets.length) return false
  const values = datasets.flatMap((d) => d.data).filter((v) => Number.isFinite(v))
  if (!values.length) return false
  const blob = `${reported} ${title} ${datasets.map((d) => d.label).join(' ')}`.toLowerCase()
  const likelyPercentChart = /%|percent|porcent|volume agregado|agregado do sistema/.test(blob)
  if (likelyPercentChart && Math.max(...values) > 105) return true
  if ((reported === 'area' || reported === 'line') && labelsLookYearly(labels)) {
    return datasets.some((d) => isNearlyArithmetic(d.data))
  }
  return false
}

function buildTableFromVision(
  pageNum: number,
  title: string,
  labels: string[],
  rows: { label: string; cells: unknown[] }[],
): InferredHtmlTable {
  const maxLen = Math.max(1, ...rows.map((r) => r.cells.length))
  let tableTitle = title.trim()
  let colLabels = [...labels]
  if (colLabels.length > 0 && rows.length > 0) {
    const first = colLabels[0] ?? ''
    const looksLikeTitle =
      first.length > 28 && !/\b\d{4}\b/.test(first) && (rows[0]?.cells.length ?? 0) < colLabels.length
    if (looksLikeTitle) {
      if (!tableTitle) tableTitle = first
      colLabels = colLabels.slice(1)
    }
  }
  if (colLabels.length === 0) {
    colLabels = Array.from({ length: maxLen }, (_, i) => `Col ${i + 1}`)
  } else {
    while (colLabels.length < maxLen) colLabels.push(`Col ${colLabels.length + 1}`)
    if (colLabels.length > maxLen) colLabels = colLabels.slice(0, maxLen)
  }
  const headers = ['Série', ...colLabels.map((h) => h || '—')]
  const bodyRows: string[][] = rows.map((r) => {
    const cells = r.cells.map((c) => (c === null || c === undefined ? '' : String(c)))
    while (cells.length < colLabels.length) cells.push('')
    return [r.label || '—', ...cells.slice(0, colLabels.length)]
  })
  return { title: tableTitle || `Página ${pageNum} (visão)`, headers, rows: bodyRows }
}

function buildChartFromVision(
  pageNum: number,
  title: string,
  labels: string[],
  rows: { label: string; cells: unknown[] }[],
  chartKind: 'bar' | 'line' | 'area',
): OcrChartReconstruction | null {
  const maxLen = Math.max(1, ...rows.map((r) => r.cells.length))
  const labs: string[] = []
  for (let i = 0; i < maxLen; i++) {
    labs.push(labels[i] !== undefined && String(labels[i]).trim() ? String(labels[i]) : `C${i + 1}`)
  }
  const datasets: { label: string; data: number[] }[] = []
  for (const r of rows) {
    const data: number[] = []
    for (let i = 0; i < maxLen; i++) {
      const raw = r.cells[i]
      const n = tryParseVisionCellNumber(raw)
      data.push(n !== null ? n : 0)
    }
    if (r.label.trim() || r.cells.some((c) => c !== null && c !== undefined && String(c).trim())) {
      datasets.push({ label: r.label.trim() || `Série ${datasets.length + 1}`, data })
    }
  }
  if (datasets.length === 0) return null
  if (looksLikeSyntheticVisionChart(chartKind, title, labs, datasets)) return null
  return {
    pageNum,
    chartKind,
    title: title.trim() || `Página ${pageNum} (visão)`,
    labels: labs,
    datasets,
  }
}

/**
 * Converte o JSON devolvido pelo VL em gráfico Chart.js (só valores numéricos estáveis)
 * ou tabela HTML quando os dados são sobretudo texto / pivot financeiro.
 */
export function visionRecordToPageVisual(
  pageNum: number,
  rec: Record<string, unknown>,
): VisionPageVisual | null {
  const rawType = typeof rec.chartType === 'string' ? rec.chartType.trim().toLowerCase() : ''
  const title = typeof rec.title === 'string' ? rec.title : ''
  const labels = asStringArray(rec.labels)
  const rows = asDatasetRows(rec.datasets)
  if (rows.length === 0) return null
  const hasAnyCell = rows.some((r) => r.cells.length > 0)
  if (!hasAnyCell) return null

  const reported = rawType || (typeof rec.type === 'string' ? String(rec.type) : 'unknown')
  const density = numericDensity(rows)
  const forceTable = reported === 'table'
  const preferTable = forceTable || density < 0.55

  if (preferTable) {
    const t = buildTableFromVision(pageNum, title, labels, rows)
    return { kind: 'table', pageNum, reportedChartType: reported || 'table', tables: [t] }
  }

  const chartKind: 'bar' | 'line' | 'area' =
    reported === 'area' ? 'area' : reported === 'line' ? 'line' : 'bar'
  const cfg = buildChartFromVision(pageNum, title, labels, rows, chartKind)
  if (!cfg) return null
  return { kind: 'chart', pageNum, reportedChartType: reported || chartKind, config: cfg }
}
