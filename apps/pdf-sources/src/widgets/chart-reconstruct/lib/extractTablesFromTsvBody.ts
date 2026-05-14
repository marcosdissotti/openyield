import { normalizeNumberCell, preferTsvBlock } from './tryBuildChartReconstructionFromOcrBody'
function splitDataLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim()).filter(Boolean)
  return line
    .split(/\s{2,}|\s+\|\s+/)
    .map((c) => c.trim())
    .filter(Boolean)
}

function countNumericCells(cells: string[]): number {
  return cells.filter((c) => normalizeNumberCell(c) !== null).length
}

/**
 * Converte TSV do layout (ou OCR tabular) em uma ou mais tabelas HTML-ready.
 * Secções separadas por linha em branco no TSV → várias tabelas.
 */
export function tryExtractTablesFromTsvBody(
  body: string,
  defaultTitle: string,
): { title: string; headers: string[]; rows: string[][] }[] {
  const src = preferTsvBlock(body)
  const rawLines = src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('_') && !l.startsWith('<!--') && !l.startsWith('```'))

  const blocks: string[][] = []
  let cur: string[] = []
  for (const line of rawLines) {
    if (/^```|^#/.test(line)) continue
    if (!line) {
      if (cur.length) {
        blocks.push(cur)
        cur = []
      }
      continue
    }
    cur.push(line)
  }
  if (cur.length) blocks.push(cur)

  const out: { title: string; headers: string[]; rows: string[][] }[] = []
  let bi = 0
  for (const lines of blocks) {
    const rows = lines.map(splitDataLine).filter((r) => r.length >= 2)
    if (rows.length < 2) continue
    bi += 1
    const first = rows[0]!
    const second = rows[1]!
    const nNum0 = countNumericCells(first)
    const nNum1 = countNumericCells(second)
    let headers: string[]
    let bodyRows: string[][]
    if (nNum0 < nNum1 && nNum0 <= Math.ceil(first.length / 2)) {
      headers = first.map((c) => c || '—')
      bodyRows = rows.slice(1)
    } else {
      const maxC = Math.max(...rows.map((r) => r.length))
      headers = Array.from({ length: maxC }, (_, i) => `Col. ${i + 1}`)
      bodyRows = rows.map((r) => {
        const copy = [...r]
        while (copy.length < maxC) copy.push('')
        return copy
      })
    }
    out.push({
      title: blocks.length > 1 ? `${defaultTitle} (${bi})` : defaultTitle,
      headers,
      rows: bodyRows,
    })
  }
  return out
}
