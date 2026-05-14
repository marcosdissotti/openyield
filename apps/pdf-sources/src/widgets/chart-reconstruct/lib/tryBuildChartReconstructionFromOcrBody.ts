import type { InferredChartKind, OcrChartDataset, OcrChartReconstruction } from '../model/chartReconstruction'

const PERIOD_LIKE =
  /^(?:\d{1,2}\s*[/-]\s*\d{2,4}|(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zà-ú]*\.?\s*[/-]?\s*\d{2,4}|[1-4]\s*T\s*\/\s*\d{2,4}|\d{4}\s*[-–]\s*\d{2,4}|\b\d{4}\b|Q[1-4]\s*\d{2}|T[1-4]\s*\d{2})/i

export function normalizeNumberCell(raw: string): number | null {
  let s = raw.replace(/\u00a0/g, ' ').trim()
  if (!s) return null
  const hasPct = /%$/.test(s)
  if (hasPct) s = s.replace(/%$/, '').trim()
  s = s.replace(/\s+/g, '')
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s) && !s.includes(',')) {
    return parseInt(s.replace(/\./g, ''), 10)
  }
  if (/^\d+,\d+$/.test(s)) return parseFloat(s.replace(',', '.'))
  if (/^\d+[.,]\d+$/.test(s)) return parseFloat(s.replace(',', '.'))
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  return null
}

function isNumericCell(s: string): boolean {
  return normalizeNumberCell(s) !== null
}

function splitDataLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim()).filter(Boolean)
  return line
    .split(/\s{2,}|\s+\|\s+/)
    .map((c) => c.trim())
    .filter(Boolean)
}

export function preferTsvBlock(body: string): string {
  const m = body.match(/```(?:tsv|csv|tabular-data)?\s*\n([\s\S]*?)```/i)
  return m ? m[1]!.trim() : body
}

function inferKind(labels: string[]): InferredChartKind {
  if (labels.length < 2) return 'bar'
  const hits = labels.filter((l) => PERIOD_LIKE.test(l.trim())).length
  return hits >= Math.ceil(labels.length * 0.45) ? 'line' : 'bar'
}

function titleCaseMonthPeriod(raw: string): string {
  const t = raw.replace(/\s+/g, '').replace(/\./g, '').toLowerCase()
  const parts = t.split('/').filter(Boolean)
  if (parts.length !== 2) return raw.trim()
  const mo = parts[0]!
  const yr = parts[1]!
  const yy = yr.length === 4 ? yr.slice(2) : yr
  return `${mo.charAt(0).toUpperCase()}${mo.slice(1)}/${yy}`
}

const MONTH_YEAR_ANCHOR = /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*\/\s*\d{2,4}/gi
const QUARTER_SLASH_ANCHOR = /\b([1-4])\s*t\s*\/\s*(\d{2,4})\b/gi

function normalizeQuarterSlashLabel(raw: string): string {
  const t = raw.replace(/\s+/g, '').toLowerCase()
  const m = t.match(/^([1-4])t\/(\d{2,4})$/)
  if (!m) return raw.trim()
  const yy = m[2]!.length === 4 ? m[2]!.slice(2) : m[2]!
  return `${m[1]}T/${yy}`
}

/** Números 0–100 típicos de percentuais em gráficos (inteiros ou x,xx), a partir de um fragmento de texto. */
function extractPercentishNumbers(slice: string): number[] {
  const parts = slice.split(/[^\d%,.]+/).filter(Boolean)
  const out: number[] = []
  for (const raw of parts) {
    const v = normalizeNumberCell(raw)
    if (v !== null && v >= 0 && v <= 100) out.push(v)
  }
  return out
}

function findTimeSeriesAnchors(flat: string): { label: string; start: number; end: number }[] {
  const hits: { label: string; start: number; end: number }[] = []
  const reMonth = new RegExp(MONTH_YEAR_ANCHOR.source, MONTH_YEAR_ANCHOR.flags)
  let m: RegExpExecArray | null
  while ((m = reMonth.exec(flat)) !== null) {
    hits.push({
      label: titleCaseMonthPeriod(m[0]!),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  const reQ = new RegExp(QUARTER_SLASH_ANCHOR.source, QUARTER_SLASH_ANCHOR.flags)
  while ((m = reQ.exec(flat)) !== null) {
    hits.push({
      label: normalizeQuarterSlashLabel(m[0]!),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  hits.sort((a, b) => a.start - b.start)
  const out: typeof hits = []
  for (const h of hits) {
    if (out.length && h.start < out[out.length - 1]!.end) continue
    out.push(h)
  }
  return out
}

function guessStackedDatasetLabels(body: string, k: number): string[] {
  const candidates = [
    { label: 'Mercado Cativo', re: /mercado\s+cativo/i },
    { label: 'Mercado Livre', re: /mercado\s+livre/i },
    { label: 'Geração Própria', re: /gera[cç][aã]o\s+pr[oó]pria/i },
    { label: 'Energia Fotovoltaica', re: /fotovoltaica/i },
    { label: 'Autoprodução', re: /autoprodu[cç]/i },
  ]
  const hits: { idx: number; label: string }[] = []
  for (const { label, re } of candidates) {
    const m = body.match(re)
    if (m && m.index !== undefined) hits.push({ idx: m.index, label })
  }
  hits.sort((a, b) => a.idx - b.idx)
  if (hits.length >= k) return hits.slice(0, k).map((h) => h.label)
  return Array.from({ length: k }, (_, i) => `Série ${i + 1}`)
}

function rowSum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

/**
 * Detecta séries temporais a partir de âncoras `Mês/AA` e números 0–100 na janela até ao próximo período.
 * Suporta percentuais inteiros (ex. energia 100 / 62 / …) e várias séries por período (composição %).
 */
export function tryBuildLooseTimeSeriesChart(
  pageNum: number,
  body: string,
  sourceLabel: string,
): OcrChartReconstruction | null {
  const flat = body.replace(/\s+/g, ' ')
  const anchors = findTimeSeriesAnchors(flat)
  if (anchors.length < 3) return null

  const byLabel = new Map<string, number[]>()
  const order: string[] = []
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!
    const sliceEnd = i + 1 < anchors.length ? anchors[i + 1]!.start : Math.min(a.end + 140, flat.length)
    const slice = flat.slice(a.end, sliceEnd)
    const nums = extractPercentishNumbers(slice).slice(0, 8)
    if (!byLabel.has(a.label)) order.push(a.label)
    byLabel.set(a.label, nums)
  }

  const rows = order.map((lab) => ({ lab, nums: byLabel.get(lab) ?? [] }))
  const nonempty = rows.filter((r) => r.nums.length > 0)
  if (nonempty.length < 3) return null

  const maxK = Math.min(5, Math.max(...nonempty.map((r) => r.nums.length)))
  for (let k = maxK; k >= 1; k--) {
    if (!nonempty.every((r) => r.nums.length >= k)) continue
    const trimmed = nonempty.map((r) => r.nums.slice(0, k))
    if (k >= 2) {
      const sums = trimmed.map((nums) => rowSum(nums))
      const near100 = sums.filter((s) => s >= 85 && s <= 115).length
      if (near100 < Math.ceil(nonempty.length * 0.45)) continue
    }
    const labels = nonempty.map((r) => r.lab)
    const head = body.slice(0, 4000)
    let titleHint = 'série'
    if (/inadimplência/i.test(head)) titleHint = 'inadimplência'
    else if (
      /energia|consumo|instalaç|fotovoltaica|gera[cç][aã]o\s+pr[oó]pria|mercado\s+(cativo|livre)/i.test(head)
    )
      titleHint = 'energia (%)'

    if (k === 1) {
      const seriesLabel = /inadimplência/i.test(head) ? 'Inadimplência (%)' : 'Série (%)'
      return {
        pageNum,
        chartKind: 'line',
        title: `Página ${pageNum} — reconstrução (${sourceLabel}, ${titleHint})`,
        labels,
        datasets: [{ label: seriesLabel, data: trimmed.map((r) => r[0]!) }],
      }
    }

    const dsLabels = guessStackedDatasetLabels(body, k)
    const datasets: OcrChartDataset[] = dsLabels.map((label, s) => ({
      label,
      data: trimmed.map((row) => row[s] ?? 0),
    }))
    return {
      pageNum,
      chartKind: 'line',
      title: `Página ${pageNum} — reconstrução (${sourceLabel}, ${titleHint})`,
      labels,
      datasets,
    }
  }

  return null
}

/**
 * Evita tratar tabelas de relatório (indicadores, milhares, rótulos longos) como gráfico Chart.js.
 */
function tabularDataLooksChartable(
  labels: string[],
  datasets: OcrChartDataset[],
  chartKind: InferredChartKind,
): boolean {
  const n = labels.length
  if (n < 2) return false
  const maxLabel = Math.max(...labels.map((l) => l.length), 0)
  const avgLabel = labels.reduce((sum, l) => sum + l.length, 0) / n

  const tableRowCue =
    /\(1[\d.,]*|mil|m³|m\^3|habitantes|hab\.|unidades|ligação|ligações|população|volume\s+medido|\d{1,3}\.\d{3}\s*,\d/i
  const cueHits = labels.filter((l) => tableRowCue.test(l)).length

  const allValues = datasets.flatMap((d) => d.data)
  const maxV = Math.max(...allValues, 0)

  if (chartKind === 'bar') {
    if (n >= 10) return false
    if (maxLabel > 48) return false
    if (avgLabel > 28) return false
    if (cueHits >= Math.max(2, Math.ceil(n * 0.22))) return false
    if (maxV >= 800 && n >= 6) return false
  }

  if (chartKind === 'line') {
    const periodHits = labels.filter((l) => PERIOD_LIKE.test(l.trim())).length
    if (periodHits < Math.ceil(n * 0.38)) return false
  }

  return true
}

/**
 * Tenta montar um gráfico Chart.js a partir de tabela (TSV/tab, incl. fenced ```tsv```).
 */
export function tryBuildChartFromTabularBody(
  pageNum: number,
  body: string,
  sourceLabel: string,
): OcrChartReconstruction | null {
  const src = preferTsvBlock(body)
  const rawLines = src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('_') && !l.startsWith('<!--'))

  const rows: string[][] = []
  for (const line of rawLines) {
    if (/^```|^#/.test(line)) continue
    const cells = splitDataLine(line)
    if (cells.length >= 2) rows.push(cells)
  }

  if (rows.length < 2) return null

  const first = rows[0]!
  const second = rows[1]!
  const firstDataColsNumeric = first.slice(1).every((c) => isNumericCell(c))
  let datasetLabels: string[]
  let dataRows: string[][]

  if (!firstDataColsNumeric && second.slice(1).some((c) => isNumericCell(c))) {
    datasetLabels = first.slice(1).map((c) => c.trim() || 'Série')
    dataRows = rows.slice(1)
  } else {
    const n = first.length - 1
    datasetLabels = Array.from({ length: n }, (_, i) => `Série ${i + 1}`)
    dataRows = rows
  }

  if (dataRows.length < 2) return null

  const labels: string[] = []
  const matrix: number[][] = []
  const nSeries = datasetLabels.length

  for (const r of dataRows) {
    if (r.length < 2) continue
    const label = (r[0] ?? '').trim() || '—'
    const nums = r.slice(1, 1 + nSeries).map((c) => normalizeNumberCell(c))
    if (nums.every((x) => x === null)) continue
    labels.push(label)
    matrix.push(nums.map((x) => (x === null || Number.isNaN(x) ? 0 : x)))
  }

  if (labels.length < 2) return null

  const datasets: OcrChartDataset[] = []
  for (let s = 0; s < nSeries; s++) {
    const label = datasetLabels[s] ?? `Série ${s + 1}`
    const data = matrix.map((row) => row[s] ?? 0)
    if (data.every((v) => v === 0)) continue
    datasets.push({ label, data })
  }

  if (!datasets.length) return null

  const chartKind = inferKind(labels)
  if (!tabularDataLooksChartable(labels, datasets, chartKind)) return null

  return {
    pageNum,
    chartKind,
    title: `Página ${pageNum} — reconstrução (${sourceLabel}, tabela)`,
    labels,
    datasets,
  }
}

/** Mantém assinatura antiga: equivale a `tryBuildChartFromTabularBody(..., 'OCR')`. */
export function tryBuildChartReconstructionFromOcrBody(
  pageNum: number,
  body: string,
): OcrChartReconstruction | null {
  return tryBuildChartFromTabularBody(pageNum, body, 'OCR')
}
