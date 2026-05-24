/** Converte o vector `pageHasBitmap[i]` (0-based) em números de página 1-based. */
export function bitmapPageNumbersFromFlags(pageHasBitmap: boolean[]): number[] {
  const out: number[] = []
  for (let i = 0; i < pageHasBitmap.length; i++) {
    if (pageHasBitmap[i]) out.push(i + 1)
  }
  return out
}
