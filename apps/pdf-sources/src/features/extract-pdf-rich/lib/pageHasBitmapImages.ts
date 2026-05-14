import { OPS } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'

const BITMAP_PAINT_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
])

/**
 * Indica se a página pinta bitmaps (XObject / inline). Gráficos só vectoriais não contam.
 */
export async function pageHasBitmapImages(page: PDFPageProxy): Promise<boolean> {
  const opList = await page.getOperatorList()
  const { fnArray } = opList
  for (let i = 0; i < fnArray.length; i++) {
    if (BITMAP_PAINT_OPS.has(fnArray[i]!)) return true
  }
  return false
}
