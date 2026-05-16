import { describe, expect, it } from 'vitest'
import { isVisionExtractionEmpty, parseVisionModelReply } from '#features/llama-vision-enrich/lib/visionChartJsonParse'

describe('parseVisionModelReply', () => {
  it('aceita Chart.js na raiz (type + labels + datasets) sem pageNum — preenche pageNumHint e infere mixed', () => {
    const raw = `{
  "type": "bar",
  "labels": ["1124", "1125", "1126"],
  "datasets": [
    { "label": "A", "data": [1, 2, 3], "backgroundColor": "#111" },
    { "type": "line", "label": "B", "data": [4, 5, 6], "borderColor": "#222" }
  ],
  "title": "T"
}`
    const p = parseVisionModelReply(raw, 14)
    expect(p?.kind).toBe('chartjs')
    if (p?.kind !== 'chartjs') return
    expect(p.value.pageNum).toBe(14)
    expect(p.value.chartType).toBe('mixed')
    expect(p.value.labels).toEqual(['1124', '1125', '1126'])
    expect(p.value.datasets).toHaveLength(2)
    expect(isVisionExtractionEmpty(p)).toBe(false)
  })

  it('aceita envelope com pageNum + chartType + labels + datasets', () => {
    const raw = '{"pageNum":3,"chartType":"bar","title":"","labels":["a"],"datasets":[{"label":"x","data":[1]}],"options":{}}'
    const p = parseVisionModelReply(raw, 99)
    expect(p?.kind).toBe('chartjs')
    if (p?.kind !== 'chartjs') return
    expect(p.value.pageNum).toBe(3)
    expect(p.value.chartType).toBe('bar')
    expect(isVisionExtractionEmpty(p)).toBe(false)
  })

  it('aceita legado pageNum + charts', () => {
    const p = parseVisionModelReply('{"pageNum":2,"charts":[{"k":1}]}', 2)
    expect(p?.kind).toBe('legacy')
    if (p?.kind !== 'legacy') return
    expect(p.value.charts).toEqual([{ k: 1 }])
    expect(isVisionExtractionEmpty(p)).toBe(false)
  })

  it('charts vazio conta como extração vazia (legado)', () => {
    const p = parseVisionModelReply('{"pageNum":1,"charts":[]}', 1)
    expect(p?.kind).toBe('legacy')
    if (p?.kind !== 'legacy') return
    expect(isVisionExtractionEmpty(p)).toBe(true)
  })

  it('chartType none ou datasets vazio conta como vazio', () => {
    const none = parseVisionModelReply(
      '{"pageNum":14,"chartType":"none","title":"","labels":[],"datasets":[],"options":{}}',
      14,
    )
    expect(none?.kind).toBe('chartjs')
    if (none?.kind !== 'chartjs') return
    expect(isVisionExtractionEmpty(none)).toBe(true)

    const emptyDs = parseVisionModelReply(
      '{"pageNum":14,"chartType":"bar","title":"","labels":["a"],"datasets":[],"options":{}}',
      14,
    )
    expect(emptyDs?.kind).toBe('chartjs')
    if (emptyDs?.kind !== 'chartjs') return
    expect(isVisionExtractionEmpty(emptyDs)).toBe(true)
  })

  it('aceita envelope mínimo só com pageNum + chartType (labels/datasets omitidos)', () => {
    const p = parseVisionModelReply('{"pageNum":14,"chartType":"none"}', 14)
    expect(p?.kind).toBe('chartjs')
    if (p?.kind !== 'chartjs') return
    expect(p.value.labels).toEqual([])
    expect(p.value.datasets).toEqual([])
    expect(p.value.chartType).toBe('none')
    expect(isVisionExtractionEmpty(p)).toBe(true)
  })

  it('chartType none com datasets preenchidos não conta como vazio', () => {
    const p = parseVisionModelReply(
      '{"pageNum":14,"chartType":"none","title":"","labels":["a"],"datasets":[{"label":"x","data":[1,2]}],"options":{}}',
      14,
    )
    expect(p?.kind).toBe('chartjs')
    if (p?.kind !== 'chartjs') return
    expect(isVisionExtractionEmpty(p)).toBe(false)
  })

  it('devolve null quando não há labels/datasets em arrays', () => {
    expect(parseVisionModelReply('{"type":"bar","foo":[]}', 1)).toBeNull()
  })
})
