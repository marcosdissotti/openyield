export type PreviewPageSectionKind = 'texto' | 'layout' | 'ocr' | 'unknown'

export interface PreviewPageSection {
  kind: PreviewPageSectionKind
  /** Rótulo curto para o preview (ex.: «Texto extraído»). */
  title: string
  /** Markdown sem a linha `## Página N — …`. */
  bodyMarkdown: string
}

export interface PreviewPageBlock {
  pageNum: number
  sections: PreviewPageSection[]
}

export type GroupedMarkdownForPreview =
  | { mode: 'single'; markdown: string }
  | { mode: 'structured'; preambleMarkdown: string | null; pages: PreviewPageBlock[] }

const ORDER: PreviewPageSectionKind[] = ['texto', 'layout', 'ocr', 'unknown']

function firstLine(chunk: string): string {
  const m = chunk.match(/^[^\n]*/)
  return (m?.[0] ?? '').trim()
}

/** Normaliza para comparação (remove marcas diacríticas). */
function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function classifyKind(headingLine: string): PreviewPageSectionKind {
  const t = foldDiacritics(headingLine).toLowerCase()
  if (/^##\s+pagina\s+\d+\s+\u2014\s*texto\s+extraido\s*$/i.test(t)) return 'texto'
  if (/^##\s+pagina\s+\d+\s+\u2014\s*layout/i.test(t)) return 'layout'
  if (/^##\s+pagina\s+\d+\s+\u2014\s*ocr\s*$/i.test(t)) return 'ocr'
  return 'unknown'
}

function displayTitle(kind: PreviewPageSectionKind, headingLine: string): string {
  if (kind === 'texto') return 'Texto extraído'
  if (kind === 'layout') return 'Layout (tabela aproximada)'
  if (kind === 'ocr') return 'OCR'
  const m = headingLine.match(/^##\s+P[^\n\d]*gina\s+\d+\s+\u2014\s*(.+)$/i)
  return (m?.[1] ?? 'Conteúdo').trim() || 'Conteúdo'
}

function stripPageHeading(chunk: string): string {
  return chunk.replace(/^##\s+P[^\n\d]*gina\s+\d+\s+\u2014[^\n]*\n+/, '').trimEnd()
}

function parsePageNum(chunk: string): number {
  const m = chunk.match(/^##\s+P[^\n\d]*gina\s+(\d+)/i)
  return m ? parseInt(m[1]!, 10) : 1
}

interface SectionBucket {
  bodies: string[]
  headingLine: string
}

/**
 * Agrupa o Markdown LLM por número de página e ordena subsecções para o preview
 * (texto extraído → layout → OCR → desconhecidos).
 */
export function groupMarkdownPagesForPreview(markdown: string): GroupedMarkdownForPreview {
  const src = (markdown || '').replace(/\r\n/g, '\n')
  if (!/^##\s+P[^\n\d]*gina\s+\d+/m.test(src)) {
    return { mode: 'single', markdown: src }
  }
  const chunks = src.split(/(?=^##\s+P[^\n\d]*gina\s+\d+)/m)
  const first = chunks[0] ?? ''
  const docStartsWithPage = /^##\s+P[^\n\d]*gina\s+\d+/m.test(first.trimStart())
  const preambleMarkdown = !docStartsWithPage && first.trim() ? first : null

  const byPage = new Map<number, Map<PreviewPageSectionKind, SectionBucket>>()

  for (let i = docStartsWithPage ? 0 : 1; i < chunks.length; i++) {
    const raw = chunks[i] ?? ''
    const pageNum = parsePageNum(raw)
    const headingLine = firstLine(raw)
    const kind = classifyKind(headingLine)
    const body = stripPageHeading(raw).trimEnd()
    if (!byPage.has(pageNum)) byPage.set(pageNum, new Map())
    const pageMap = byPage.get(pageNum)!
    let bucket = pageMap.get(kind)
    if (!bucket) {
      bucket = { bodies: [], headingLine }
      pageMap.set(kind, bucket)
    }
    bucket.bodies.push(body)
  }

  const pageNums = [...byPage.keys()].sort((a, b) => a - b)
  const pages: PreviewPageBlock[] = []

  for (const pageNum of pageNums) {
    const pageMap = byPage.get(pageNum)!
    const sections: PreviewPageSection[] = []
    for (const kind of ORDER) {
      const bucket = pageMap.get(kind)
      if (!bucket?.bodies.length) continue
      const bodyMarkdown = bucket.bodies.filter((b) => b.trim()).join('\n\n')
      if (!bodyMarkdown.trim()) continue
      sections.push({
        kind,
        title: displayTitle(kind, bucket.headingLine),
        bodyMarkdown,
      })
    }
    if (sections.length) pages.push({ pageNum, sections })
  }

  return { mode: 'structured', preambleMarkdown, pages }
}
