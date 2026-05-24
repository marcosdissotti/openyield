/**
 * Heurísticas para texto vindo do Tesseract em páginas tipo sumário (pontilhados entre título e nº de página).
 * Não substitui revisão humana; só reduz ruído óbvio antes de mostrar / mandar ao LLM.
 */

/** Linha que parece item numerado (ex.: 1.1., 10.2., 2,). */
function looksLikeOutlineLine(trimmed: string): boolean {
  return /^\d+(?:\.\d+)*[.,]?\s+\S/u.test(trimmed)
}

/** Caracteres que o Tesseract confunde com pontilhado / ruído no fim do título (sem vogais comuns PT). */
const JUNK_TAIL =
  /(?:[.·…⋯]|[ili|1I\[\]oO0$SsNnMmCcEeVvRr£¥€ÔóôíìÚú]|\s){12,}$/iu

/**
 * Se a linha termina em nº de página (1–3 dígitos), corta a partir do primeiro `....` (pontilhado)
 * ou remove uma cauda longa só com “lixo” típico de OCR antes do número.
 */
function collapseOutlineLeaders(trimmed: string): string {
  const m = trimmed.match(/^(.+?)\s+(\d{1,3})\s*$/)
  if (!m) return trimmed
  let main = m[1].trimEnd()
  const page = m[2]
  const n = parseInt(page, 10)
  if (!Number.isFinite(n) || n < 1 || n > 499) return trimmed

  const dotStart = main.search(/\.{4,}/)
  if (dotStart >= 0) {
    main = main.slice(0, dotStart).trimEnd()
    if (main.length < 4) return trimmed
    return `${main} … ${page}`
  }

  const before = main
  main = main.replace(JUNK_TAIL, '').trimEnd()
  main = main.replace(/\.{4,}$/u, '').trimEnd()
  if (main !== before && main.length >= 4) return `${main} … ${page}`
  return trimmed
}

/** Colapsa linhas em branco excessivas. */
function normalizeBlankLines(text: string): string {
  return text.replace(/\n{4,}/g, '\n\n\n')
}

/**
 * Aplica limpeza leve ao OCR de página inteira (sumários, índices).
 */
export function sanitizeOcrPlainText(raw: string): string {
  if (!raw || !raw.trim()) return raw
  const lines = raw.split(/\n/)
  const out = lines.map((line) => {
    const m = /^(\s*)(.*)$/.exec(line)
    const indent = m?.[1] ?? ''
    const body = m?.[2] ?? line
    const t = body.trim()
    if (!t) return line
    if (!looksLikeOutlineLine(t)) return line
    return indent + collapseOutlineLeaders(t)
  })
  return normalizeBlankLines(out.join('\n'))
}
