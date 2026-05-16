/**
 * Remove o anexo "## Enriquecimento por visão (LLM)" do markdown por fatia de página,
 * para não duplicar no HTML — o preview renderiza Chart.js / tabela via Vue junto à página.
 */
export function stripVisionEnrichmentAppendix(md: string): string {
  let s = md.replace(/\n?---\s*\n+##\s+Enriquecimento por visão \(LLM\)[\s\S]*$/im, '')
  s = s.replace(/(?:^|\n)##\s+Enriquecimento por visão \(LLM\)[\s\S]*$/im, '')
  return s.replace(/\n{3,}/g, '\n\n').trimEnd()
}
