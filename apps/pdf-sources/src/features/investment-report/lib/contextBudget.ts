export interface EvidenceBudgetInput {
  evidence: string
  sectionTitle: string
  instruction: string
  maxChars?: number
  maxBlockChars?: number
  minBlocks?: number
}

interface EvidenceBlock {
  text: string
  normalized: string
  index: number
}

const DEFAULT_MAX_CHARS = 14_000
const DEFAULT_MAX_BLOCK_CHARS = 1_600
const DEFAULT_MIN_BLOCKS = 4

const STOPWORDS = new Set([
  'como',
  'com',
  'dos',
  'das',
  'para',
  'por',
  'uma',
  'das',
  'nos',
  'nas',
  'que',
  'seja',
  'setor',
  'analise',
  'risco',
  'riscos',
  'fontes',
  'informacao',
  'detalhada',
])

export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function keywordsFor(input: EvidenceBudgetInput): string[] {
  const normalized = normalizeText(`${input.sectionTitle} ${input.instruction}`)
  const tokens = normalized.match(/[a-z0-9]{3,}/g) ?? []
  const out: string[] = []
  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue
    if (out.includes(token)) continue
    out.push(token)
  }
  return out
}

function splitEvidence(evidence: string): EvidenceBlock[] {
  return evidence
    .split(/\n\n---\n\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((text, index) => ({ text, normalized: normalizeText(text), index }))
}

function scoreBlock(block: EvidenceBlock, keywords: string[]): number {
  let score = 0
  for (const keyword of keywords) {
    const matches = block.normalized.match(new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'))
    if (matches) score += matches.length * 8
  }
  if (/\b(score|p[aá]g\.|pagina|fonte)\b/i.test(block.text)) score += 2
  if (/\d/.test(block.text)) score += 2
  return score - block.index * 0.02
}

function trimBlock(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const refMatch = text.match(/^\[[^\n]+\]\n?/)
  const ref = refMatch?.[0] ?? ''
  const body = text.slice(ref.length).trim()
  return `${ref}${body.slice(0, Math.max(0, maxChars - ref.length - 20)).trimEnd()}\n[trecho compactado]`
}

export function selectEvidenceForSection(input: EvidenceBudgetInput): string {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS
  const maxBlockChars = input.maxBlockChars ?? DEFAULT_MAX_BLOCK_CHARS
  const minBlocks = input.minBlocks ?? DEFAULT_MIN_BLOCKS
  const blocks = splitEvidence(input.evidence)
  if (!blocks.length) return ''

  const keywords = keywordsFor(input)
  const ranked = blocks
    .map((block) => ({ block, score: scoreBlock(block, keywords) }))
    .sort((a, b) => b.score - a.score || a.block.index - b.block.index)

  const selected = new Map<number, string>()
  let total = 0
  for (const item of ranked) {
    if (selected.size >= minBlocks && total >= maxChars) break
    const trimmed = trimBlock(item.block.text, maxBlockChars)
    const nextCost = trimmed.length + (selected.size ? 7 : 0)
    if (selected.size >= minBlocks && total + nextCost > maxChars) continue
    selected.set(item.block.index, trimmed)
    total += nextCost
    if (total >= maxChars) break
  }

  return [...selected.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text)
    .join('\n\n---\n\n')
}
