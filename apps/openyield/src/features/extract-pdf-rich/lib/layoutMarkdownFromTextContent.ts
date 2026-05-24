/**
 * Reconstrói linhas/colunas aproximadas a partir das posições dos glifos (pdf.js).
 * Útil para tabelas e dados alinhados; não substitui OCR em gráficos raster.
 */

export type TextContentLike = {
  items: ReadonlyArray<{
    str?: string
    transform?: number[]
    width?: number
    height?: number
  }>
}

interface Box {
  str: string
  x: number
  y: number
  w: number
  h: number
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function itemsToBoxes(tc: TextContentLike): Box[] {
  const out: Box[] = []
  for (const item of tc.items) {
    const str = typeof item.str === 'string' ? item.str.trim() : ''
    if (!str) continue
    const tr = item.transform
    if (!Array.isArray(tr) || tr.length < 6) continue
    const x = Number(tr[4]) || 0
    const y = Number(tr[5]) || 0
    let w = typeof item.width === 'number' ? item.width : 0
    const fontSize = Math.abs(Number(tr[3])) || Math.abs(Number(tr[0])) || 10
    const h = typeof item.height === 'number' && item.height > 0 ? item.height : fontSize
    if (w <= 0) w = Math.max(str.length * fontSize * 0.52, fontSize)
    out.push({ str, x, y, w, h })
  }
  return out
}

function rowToCells(row: Box[], gapTh: number): string[] {
  const sorted = [...row].sort((a, b) => a.x - b.x)
  const cells: string[] = []
  let buf = ''
  let lastRight = -Infinity
  for (const b of sorted) {
    if (buf && b.x - lastRight > gapTh) {
      cells.push(buf.trim())
      buf = b.str
    } else {
      buf = buf ? `${buf} ${b.str}` : b.str
    }
    lastRight = Math.max(lastRight, b.x + b.w)
  }
  if (buf) cells.push(buf.trim())
  return cells
}

function clusterRows(boxes: Box[]): string[][] {
  if (!boxes.length) return []
  const hs = boxes.map((b) => b.h).filter((h) => h > 0)
  const medianH = median(hs) || 10
  const rowEps = Math.max(2.5, medianH * 0.42)
  const gapTh = Math.max(4, medianH * 0.72)

  const sorted = [...boxes].sort((a, b) => (b.y !== a.y ? b.y - a.y : a.x - b.x))

  const rowClusters: Box[][] = []
  for (const b of sorted) {
    let placed = false
    for (const row of rowClusters) {
      const ref = row[0]!
      if (Math.abs(b.y - ref.y) <= rowEps) {
        row.push(b)
        placed = true
        break
      }
    }
    if (!placed) rowClusters.push([b])
  }

  rowClusters.sort((a, b) => (b[0]!.y !== a[0]!.y ? b[0]!.y - a[0]!.y : a[0]!.x - b[0]!.x))
  return rowClusters.map((row) => rowToCells(row, gapTh))
}

/**
 * Devolve Markdown com bloco `tsv` ou string vazia se não houver padrão tabular útil.
 */
export function layoutMarkdownFromTextContent(tc: TextContentLike): string {
  const boxes = itemsToBoxes(tc)
  if (boxes.length < 4) return ''

  const rows = clusterRows(boxes)
  const maxCols = Math.max(1, ...rows.map((r) => r.length))
  if (rows.length < 2 && maxCols < 3) return ''

  const esc = (s: string) => s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
  const lines = rows.map((r) => r.map(esc).join('\t'))

  return [
    '_Colunas inferidas pela posição dos caracteres no PDF; validar com a página ou com OCR._',
    '',
    '```tsv',
    ...lines,
    '```',
  ].join('\n')
}
