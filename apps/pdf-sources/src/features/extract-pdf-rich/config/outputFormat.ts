/**
 * Saída para LLM: Markdown por página (sem base64 de imagens no documento —
 * só texto da camada + OCR quando necessário, para prompts leves).
 */
export const LLM_DOC_TITLE = (fileName: string) => `# ${fileName.replace(/\.pdf$/i, '')}`

export const markdownPageTextSection = (pageNum: number, body: string) =>
  `## Página ${pageNum} — texto extraído\n\n${body.trim() || '_sem texto na camada_'}\n`

export const markdownPageOcrSection = (pageNum: number, body: string) =>
  `## Página ${pageNum} — OCR\n\n${body.trim() || '_OCR vazio_'}\n`

export const markdownPageLayoutSection = (pageNum: number, body: string) =>
  `## Página ${pageNum} — layout (tabela aproximada)\n\n${body.trim()}\n`
