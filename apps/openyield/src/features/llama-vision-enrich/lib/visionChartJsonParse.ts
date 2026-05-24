/** Formato antigo (pageNum + charts[]) — mantido para compatibilidade. */
export interface VisionJsonLegacy {
  pageNum: number
  charts: unknown[]
}

/** Formato unificado na UI (após normalização). */
export interface VisionChartJson {
  pageNum: number
  chartType: string
  title?: string
  labels: unknown[]
  datasets: unknown[]
  options?: Record<string, unknown>
}

export type VisionParsed = { kind: 'chartjs'; value: VisionChartJson } | { kind: 'legacy'; value: VisionJsonLegacy }

const ROOT_CHART_TYPES = new Set(['bar', 'line', 'area', 'pie', 'scatter', 'radar', 'bubble', 'doughnut'])

function inferChartTypeFromPayload(obj: Record<string, unknown>): string {
  if (typeof obj.chartType === 'string' && obj.chartType.trim()) {
    return obj.chartType.trim()
  }
  const ds = obj.datasets
  if (!Array.isArray(ds) || ds.length === 0) {
    const rt = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : ''
    return rt || 'none'
  }
  const kinds = new Set<string>()
  for (const d of ds) {
    if (d && typeof d === 'object' && 'type' in d) {
      const t = String((d as Record<string, unknown>).type ?? '')
        .trim()
        .toLowerCase()
      if (t) kinds.add(t)
    }
  }
  if (kinds.size > 1) return 'mixed'
  if (kinds.size === 1) {
    const only = [...kinds][0]!
    const rootT = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : ''
    if (rootT && ROOT_CHART_TYPES.has(rootT) && rootT !== only) return 'mixed'
    return only
  }
  const rootT = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : ''
  if (rootT && ROOT_CHART_TYPES.has(rootT)) return rootT
  return 'mixed'
}

function normalizeOptions(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

/**
 * Aceita:
 * - Legado `{ pageNum, charts: [...] }`
 * - Envelope `{ pageNum?, chartType, labels, datasets, ... }`
 * - Envelope mínimo `{ "pageNum": 14, "chartType": "none" }` (labels/datasets omitidos → vazios)
 * - Chart.js no LM Studio: `{ type: "bar", labels, datasets, title?, options? }` (sem `pageNum` / sem `chartType` no topo)
 */
export function parseVisionModelReply(text: string, pageNumHint: number): VisionParsed | null {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>

    if (typeof obj.pageNum === 'number' && Array.isArray(obj.charts)) {
      return { kind: 'legacy', value: obj as unknown as VisionJsonLegacy }
    }

    const labelsIn = 'labels' in obj
    const datasetsIn = 'datasets' in obj
    const labels = Array.isArray(obj.labels) ? obj.labels : []
    const datasets = Array.isArray(obj.datasets) ? obj.datasets : []

    const looksLikeChartPayload =
      typeof obj.chartType === 'string' ||
      labelsIn ||
      datasetsIn ||
      (typeof obj.type === 'string' && (labelsIn || datasetsIn))

    if (!looksLikeChartPayload) {
      return null
    }

    const pageNum =
      typeof obj.pageNum === 'number' && Number.isFinite(obj.pageNum) ? obj.pageNum : pageNumHint

    const chartType = inferChartTypeFromPayload(obj)
    const title = typeof obj.title === 'string' ? obj.title : ''
    const options = normalizeOptions(obj.options)

    return {
      kind: 'chartjs',
      value: {
        pageNum,
        chartType,
        title,
        labels,
        datasets,
        options,
      },
    }
  } catch {
    return null
  }
}

export function isVisionExtractionEmpty(parsed: VisionParsed): boolean {
  if (parsed.kind === 'legacy') return parsed.value.charts.length === 0
  const v = parsed.value
  if (!Array.isArray(v.datasets) || v.datasets.length === 0) return true
  return !v.datasets.some((d) => {
    if (!d || typeof d !== 'object') return false
    const data = (d as Record<string, unknown>).data
    return Array.isArray(data) && data.length > 0
  })
}
