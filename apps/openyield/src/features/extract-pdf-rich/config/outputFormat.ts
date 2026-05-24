/**
 * Saída para LLM: Markdown por página (sem base64 de imagens no documento —
 * só texto da camada + OCR quando necessário, para prompts leves).
 */
import { sanitizeOcrPlainText } from '../lib/sanitizeOcrPlainText'

export const LLM_DOC_TITLE = (fileName: string) => `# ${fileName.replace(/\.pdf$/i, '')}`

export const markdownPageTextSection = (pageNum: number, body: string) =>
  `## Página ${pageNum} — texto extraído\n\n${body.trim() || '_sem texto na camada_'}\n`

export const markdownPageOcrSection = (pageNum: number, body: string) => {
  const raw = body.trim()
  const cleaned = raw ? sanitizeOcrPlainText(raw) : ''
  return `## Página ${pageNum} — OCR\n\n${cleaned || '_OCR vazio_'}\n`
}

export const markdownPageLayoutSection = (pageNum: number, body: string) =>
  `## Página ${pageNum} — layout (tabela aproximada)\n\n${body.trim()}\n`
