export type PageSectionKind = 'ocr' | 'layout' | 'texto'

const SECTION_HEADING: Record<PageSectionKind, RegExp> = {
  ocr: /^## Página (\d+) — OCR\s*\n+/gm,
  layout: /^## Página (\d+) — layout \(tabela aproximada\)\s*\n+/gm,
  texto: /^## Página (\d+) — texto extraído\s*\n+/gm,
}

/** Extrai o corpo de cada secção de página (OCR, layout ou texto extraído). */
export function extractPageSectionBodies(
  markdown: string,
  kind: PageSectionKind,
): { pageNum: number; body: string }[] {
  const norm = markdown.replace(/\r\n/g, '\n')
  const re = new RegExp(SECTION_HEADING[kind].source, SECTION_HEADING[kind].flags)
  const out: { pageNum: number; body: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(norm)) !== null) {
    const pageNum = parseInt(m[1]!, 10)
    const start = m.index + m[0].length
    const tail = norm.slice(start)
    const nextIdx = tail.search(/^## Página \d+/m)
    const body = (nextIdx === -1 ? tail : tail.slice(0, nextIdx)).trim()
    out.push({ pageNum, body })
  }
  return out
}

/** Extrai corpo bruto de cada secção `## Página N — OCR` do Markdown. */
export function extractOcrSectionBodies(markdown: string): { pageNum: number; body: string }[] {
  return extractPageSectionBodies(markdown, 'ocr')
}
