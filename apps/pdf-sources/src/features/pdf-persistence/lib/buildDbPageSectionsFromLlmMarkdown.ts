import {
  groupMarkdownPagesForPreview,
  type PreviewPageSectionKind,
} from '#widgets/llm-markdown-preview/lib/groupMarkdownPagesForPreview'

export type DbPageSectionKind = 'texto' | 'layout' | 'ocr'

export interface DbPageSectionRow {
  page_num: number
  section_kind: DbPageSectionKind
  body_markdown: string
  sort_order: number
}

function mapKind(k: PreviewPageSectionKind): DbPageSectionKind | null {
  if (k === 'texto' || k === 'layout' || k === 'ocr') return k
  return null
}

/**
 * Secções normalizadas para persistência SQLite (alinhado ao Markdown LLM do extract-pdf-rich).
 */
export function buildDbPageSectionsFromLlmMarkdown(markdown: string): DbPageSectionRow[] {
  const grouped = groupMarkdownPagesForPreview(markdown || '')
  if (grouped.mode === 'single') {
    const body = grouped.markdown.trim()
    if (!body) return []
    return [{ page_num: 1, section_kind: 'texto', body_markdown: body, sort_order: 0 }]
  }
  const out: DbPageSectionRow[] = []
  let order = 0
  for (const page of grouped.pages) {
    for (const sec of page.sections) {
      const sk = mapKind(sec.kind)
      if (!sk) continue
      const body = sec.bodyMarkdown.trim()
      if (!body) continue
      out.push({
        page_num: page.pageNum,
        section_kind: sk,
        body_markdown: body,
        sort_order: order++,
      })
    }
  }
  return out
}
