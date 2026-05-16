/**
 * Extrai o primeiro objeto JSON (bloco ```json) após cada `### Página N` na secção
 * "## Enriquecimento por visão (LLM)".
 */
export function extractVisionChartJsonByPage(markdown: string): Map<number, Record<string, unknown>> {
  const map = new Map<number, Record<string, unknown>>()
  const header = /^##\s+Enriquecimento por visão \(LLM\)\s*$/im
  const m0 = header.exec(markdown)
  if (!m0) return map

  const tail = markdown.slice(m0.index + m0[0].length)
  const rx = /^###\s+Página\s+(\d+)\s*$/gm
  const hits: { page: number; headingIndex: number; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = rx.exec(tail)) !== null) {
    hits.push({
      page: parseInt(m[1]!, 10),
      headingIndex: m.index,
      bodyStart: m.index + m[0].length,
    })
  }
  for (let i = 0; i < hits.length; i++) {
    const { page, bodyStart } = hits[i]!
    const end = i + 1 < hits.length ? hits[i + 1]!.headingIndex : tail.length
    const block = tail.slice(bodyStart, end)
    const fence = block.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    if (!fence) continue
    const raw = fence[1]!.trim()
    const start = raw.indexOf('{')
    const endBrace = raw.lastIndexOf('}')
    if (start < 0 || endBrace <= start) continue
    try {
      const obj = JSON.parse(raw.slice(start, endBrace + 1)) as Record<string, unknown>
      const pn = typeof obj.pageNum === 'number' && Number.isFinite(obj.pageNum) ? obj.pageNum : page
      map.set(pn, obj)
    } catch {
      /* ignore */
    }
  }
  return map
}
