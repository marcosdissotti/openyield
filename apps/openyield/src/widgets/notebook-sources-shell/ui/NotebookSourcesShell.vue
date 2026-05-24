<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, nextTick, ref, watch } from 'vue'
import ScrollPanel from 'primevue/scrollpanel'
import ProgressSpinner from 'primevue/progressspinner'
import ProgressBar from 'primevue/progressbar'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import PdfDropArea from '#features/pdf-drop-area/ui/PdfDropArea.vue'
import { LlmMarkdownPreview } from '#widgets/llm-markdown-preview'
import { usePdfSourcesStore } from '#entities/pdf-source'
import { useNotebookStore } from '#entities/notebook'
import { useStudioReportStore, type StudioReport } from '#entities/studio-report'
import {
  useFundamentalSnapshotStore,
  type FundamentalField,
  type FundamentalSnapshot,
} from '#entities/fundamental-snapshot'
import { buildLlmDocumentFromPdf } from '#features/extract-pdf-rich'
import { mapPdfExtractError } from '#shared/lib/mapPdfExtractError'
import { enrichMarkdownWithLlamaVision } from '#features/llama-vision-enrich/lib/enrichMarkdownWithLlamaVision'
import { chatCompletion, LlamaRuntimeError } from '#features/llama-runtime/lib/llamaRuntimeApi'
import { estimatePromptTokens, selectEvidenceForSection } from '#features/investment-report/lib/contextBudget'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import LlmRuntimeBar from '#widgets/llm-runtime-bar/ui/LlmRuntimeBar.vue'
import { DeveloperLogsDialog } from '#widgets/developer-logs'
import { logger } from '#shared/lib/logger'
import OpenYieldLogo from '#shared/ui/OpenYieldLogo.vue'
import { isPdfDbAvailable, pdfDbPersistDocument, pdfDbReadDocumentFile } from '#features/pdf-persistence/lib/pdfDbClient'
import {
  vectorBuscarChunksDoNotebook,
  vectorGarantirChunksDoNotebook,
  type VectorSearchResult,
} from '#features/vector-persistence/lib/vectorClient'
import {
  answerFromValuations,
  buildValuationContext,
  hasAnyValuationContext,
} from '#features/chat-context/lib/buildValuationContext'
import {
  buildHarnessAnswerInstructions,
  buildHarnessPlannerPrompt,
  deterministicChatPlan,
  normalizeQuestionText,
  refineChatPlan,
  shouldUseStructuredFastPath,
  shouldUseValuationFastPath,
  type ChatPlan,
} from '#features/chat-context/lib/chatHarnessPlan'

const store = usePdfSourcesStore()
const notebook = useNotebookStore()
const reportStore = useStudioReportStore()
const fundamentalStore = useFundamentalSnapshotStore()
const llmRuntime = useLlmRuntimeStore()
const dropRef = ref<InstanceType<typeof PdfDropArea> | null>(null)
const panelTab = ref<'raw' | 'llm'>('llm')
const restoringPreviewFiles = new Set<string>()
const chatDraft = ref('')
interface ChatStep {
  label: string
  status: 'running' | 'done' | 'warn' | 'error'
  detail?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinkingText?: string
  status?: 'thinking' | 'streaming' | 'done' | 'error'
  steps?: ChatStep[]
  score?: number
}

function scrollChatToBottom() {
  const el = chatScrollEl.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

function patchChatMessage(messageId: string, patch: Partial<ChatMessage>) {
  const index = chatMessages.value.findIndex((message) => message.id === messageId)
  if (index < 0) return
  const current = chatMessages.value[index]!
  chatMessages.value[index] = {
    ...current,
    ...patch,
    steps: patch.steps ?? current.steps,
  }
  void nextTick(scrollChatToBottom)
}

function parseThinkTagsInStream(raw: string): { thinkingText: string; text: string } {
  const closed = raw.match(/<(?:think|thinking|redacted_thinking|reasoning)>([\s\S]*?)<\/(?:think|thinking|redacted_thinking|reasoning)>/i)
  if (closed) {
    return {
      thinkingText: closed[1]?.trim() ?? '',
      text: raw.replace(/<(?:think|thinking|redacted_thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|redacted_thinking|reasoning)>/gi, '').trim(),
    }
  }
  const open = raw.match(/<(?:think|thinking|redacted_thinking|reasoning)>([\s\S]*)$/i)
  if (open) {
    return {
      thinkingText: open[1]?.trim() ?? '',
      text: raw.slice(0, open.index).trim(),
    }
  }
  return { thinkingText: '', text: raw }
}

function applyStreamDelta(messageId: string, contentDelta: string, reasoningDelta: string, contentSoFar: string, reasoningSoFar: string) {
  let text = contentSoFar
  let thinkingText = reasoningSoFar

  if (contentDelta && !reasoningDelta) {
    const parsed = parseThinkTagsInStream(contentSoFar)
    if (parsed.thinkingText || /<(think|thinking|redacted_thinking|reasoning)>/i.test(contentSoFar)) {
      text = parsed.text
      thinkingText = thinkingText ? `${thinkingText}\n${parsed.thinkingText}`.trim() : parsed.thinkingText
    }
  }

  patchChatMessage(messageId, {
    text,
    thinkingText: thinkingText || undefined,
    status: 'streaming',
  })
}

const chatMessages = ref<ChatMessage[]>([])
const chatRunning = ref(false)
const chatScrollEl = ref<HTMLElement | null>(null)

watch(
  chatMessages,
  () => {
    void nextTick(scrollChatToBottom)
  },
  { deep: true, flush: 'post' },
)
const activeStudioReportId = ref<string | null>(null)
const activeFundamentalSnapshotId = ref<string | null>(null)
const developerLogsVisible = ref(false)
let extractionQueue: Promise<void> = Promise.resolve()
const STALE_GENERATING_REPORT_MS = 5 * 60_000

const visibleSources = computed(() => {
  const id = notebook.activeNotebookId
  if (!id) return []
  return store.sources.filter((s) => s.notebookId === id)
})

const selectedNotebook = computed(() => notebook.notebooks.find((n) => n.id === notebook.activeNotebookId) ?? null)
const readySources = computed(() => visibleSources.value.filter((s) => s.status === 'ready'))
const pendingSources = computed(() => visibleSources.value.filter((s) => s.status === 'pending'))
const activeStudioReport = computed(
  () => studioReports.value.find((report) => report.id === activeStudioReportId.value) ?? null,
)
const studioReports = computed(() => reportStore.reportsForNotebook(notebook.activeNotebookId))
const fundamentalSnapshots = computed(() => fundamentalStore.snapshotsForNotebook(notebook.activeNotebookId))
const activeFundamentalSnapshot = computed(
  () => fundamentalSnapshots.value.find((snapshot) => snapshot.id === activeFundamentalSnapshotId.value) ?? null,
)
const generatingRiskReport = computed(
  () => studioReports.value.find((report) => report.type === 'risk' && report.status === 'generating') ?? null,
)
const generatingFundamentalSnapshot = computed(
  () => fundamentalSnapshots.value.find((snapshot) => snapshot.status === 'generating') ?? null,
)
const selectedPreviewText = computed(() => {
  const text = store.selected?.llmMarkdown || store.selected?.extractedText || ''
  return text.replace(/[#*_`>|-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 520)
})

marked.use({ gfm: true, breaks: true })

const DOMPURIFY_OPTS = {
  ADD_ATTR: ['target', 'rel'],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
}

function markdownToSanitizedHtml(md: string): string {
  const raw = marked.parse(md || '', { async: false })
  const html = typeof raw === 'string' ? raw : ''
  return DOMPurify.sanitize(html, DOMPURIFY_OPTS)
}

function reportMarkdownForDisplay(markdown: string): string {
  return markdown
    .replace(/^#\s+Relat[oó]rio de Riscos\s*\n+/i, '')
    .replace(/^Fontes analisadas:\s*\d+\s*\n+/im, '')
    .replace(/^>\s*Gerado em modo resiliente:[^\n]*(?:\n[^\n#-].*)?\n*/im, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const activeStudioReportHtml = computed(() =>
  markdownToSanitizedHtml(reportMarkdownForDisplay(activeStudioReport.value?.body ?? '')),
)

function sourcePreviewText(source: { llmMarkdown: string; extractedText: string }): string {
  const text = source.llmMarkdown || source.extractedText
  return text.replace(/[#*_`>|-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 118)
}

const starterQuestions = [
  'Resuma os principais números do release',
  'Liste riscos e pontos de atenção para investidor',
  'Compare receita, EBITDA e lucro por período',
]

function cleanPromptText(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/\t/g, ' | ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function structuredTextForPrompt(markdown: string, fallback: string): string {
  const md = markdown.replace(/\r\n/g, '\n')
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const searchable = cleanPromptText(md)
  const ticker = searchable.match(/\bB3\s*:\s*([A-Z]{4}\d{1,2})\b/i)?.[1]?.toUpperCase()
  const company = /\bCOPASA\s+MG\b/i.test(searchable)
    ? 'COPASA MG (Companhia de Saneamento de Minas Gerais)'
    : null
  const quarterMatch =
    searchable.replace(/\b([1-4])\s*T\s*([0-9])\s*([0-9])\b/gi, '$1T$2$3').match(/\b([1-4])T(\d{2})\b/i) ??
    searchable.match(/\b([1-4])[ºo]?\s+trimestre\s+de\s+(20\d{2})\b/i)
  const period = quarterMatch
    ? (() => {
        const quarter = quarterMatch[1]!
        const rawYear = quarterMatch[2]!
        const year = rawYear.length === 2 ? `20${rawYear}` : rawYear
        const annual = new RegExp(`(exerc[ií]cio|acumulad[oa]|ano).*${year}`, 'i').test(searchable)
        return `${quarter}º Trimestre de ${year} (${quarter}T${year.slice(-2)})${annual ? ` e acumulado do exercício de ${year}` : ''}`
      })()
    : null
  const releaseDate =
    searchable.match(/\b(\d{1,2}\s+de\s+[a-zç]+(?:\s+de)?\s+20\d{2})\b/i)?.[1]?.replace(/\s+/g, ' ') ?? null
  const chunks = md.split(/(?=^##\s+P[^\n\d]*gina\s+\d+)/m)
  const pageBlocks: string[] = []
  for (const chunk of chunks) {
    const pageMatch = chunk.match(/^##\s+P[^\n\d]*gina\s+(\d+)\s+\u2014\s*([^\n]+)/i)
    if (!pageMatch) continue
    const pageNum = pageMatch[1]!
    const section = pageMatch[2]!.trim()
    if (!/texto extra[ií]do/i.test(section)) continue
    const body = chunk.replace(/^##[^\n]*\n+/, '')
    const clean = cleanPromptText(body)
    if (!clean || /^_?sem texto/i.test(clean)) continue
    pageBlocks.push(`=== PÁGINA ${pageNum} | TEXTO EXTRAÍDO ===\n${clean}`)
  }
  if (!pageBlocks.length) return cleanPromptText(fallback)
  const header = [
    '=== CABEÇALHO DO DOCUMENTO ===',
    title ? `Documento: ${title}` : null,
    company ? `Empresa: ${company}` : null,
    ticker ? `Ticker: ${ticker} (B3)` : null,
    period ? `Período do Resultado: ${period}` : null,
    releaseDate ? `Data de Divulgação do Release: ${releaseDate}` : null,
  ].filter(Boolean)
  return [...header, '', ...pageBlocks].join('\n')
}

function extractTickerFromDocument(markdown: string, fallback: string): string | null {
  const text = cleanPromptText(`${markdown}\n${fallback}`).slice(0, 80_000)
  const explicit =
    text.match(/\bB3\s*[:\-]\s*([A-Z]{4}\d{1,2})\b/i)?.[1] ??
    text.match(/\b(?:ticker|c[oó]digo de negocia[cç][aã]o|c[oó]digo)\s*[:\-]\s*([A-Z]{4}\d{1,2})\b/i)?.[1] ??
    null
  if (explicit) return explicit.toUpperCase()

  const firstPages = text.slice(0, 12_000)
  const standalone = firstPages.match(/\b[A-Z]{4}\d{1,2}\b/g) ?? []
  const ignored = new Set(['IBOV11'])
  return standalone.find((ticker) => !ignored.has(ticker.toUpperCase()))?.toUpperCase() ?? null
}

function notebookDisplayTitle(n: { title: string; ticker: string | null }): string {
  if (!n.ticker) return n.title
  return n.title.toUpperCase() === n.ticker.toUpperCase() ? n.title : `${n.title} · ${n.ticker}`
}

async function applyExtractedTickerToNotebook(notebookId: string, markdown: string, fallback: string) {
  const n = notebook.notebooks.find((item) => item.id === notebookId)
  if (!n || n.ticker) return
  const ticker = extractTickerFromDocument(markdown, fallback)
  if (!ticker) return
  logger.info('Applying extracted ticker to notebook', { notebookId, ticker })
  await notebook.updateNotebookMeta(notebookId, ticker, ticker)
}

const selectedPromptText = computed(() => {
  const selected = store.selected
  if (!selected) return ''
  return structuredTextForPrompt(selected.llmMarkdown || '', selected.extractedText)
})

const renameOpen = ref(false)
const renameNotebookId = ref<string | null>(null)
const renameTitle = ref('')
const renameTicker = ref('')

watch(
  () => notebook.activeNotebookId,
  (id) => {
    if (id) store.alignSelectionToNotebook(id)
  },
)

watch(
  () => ({
    id: store.selected?.id ?? null,
    status: store.selected?.status ?? null,
    hasFile: !!store.selected?.file,
    pdfPath: store.selected?.pdfPath ?? '',
  }),
  async ({ id, status, hasFile, pdfPath }) => {
    if (!id || status !== 'ready' || hasFile || !pdfPath || restoringPreviewFiles.has(id)) return
    restoringPreviewFiles.add(id)
    try {
      const file = await pdfDbReadDocumentFile(id)
      const current = store.sources.find((s) => s.id === id)
      if (file && current && !current.file) store.attachFile(id, file)
    } catch (e) {
      console.error('[openyield] Falha a restaurar preview do PDF:', e)
    } finally {
      restoringPreviewFiles.delete(id)
    }
  },
  { immediate: true },
)

function openRenameDialog(notebookId: string) {
  const n = notebook.notebooks.find((x) => x.id === notebookId)
  if (!n) return
  renameNotebookId.value = notebookId
  renameTitle.value = n.title
  renameTicker.value = n.ticker ?? ''
  renameOpen.value = true
}

async function applyRename() {
  const id = renameNotebookId.value
  if (!id) return
  const title = renameTitle.value.trim() || 'Caderno'
  const tickerRaw = renameTicker.value.trim()
  const ticker = tickerRaw ? tickerRaw.toUpperCase().replace(/\s+/g, '') : null
  await notebook.updateNotebookMeta(id, title, ticker)
  renameOpen.value = false
}

async function onCloseNotebookTab(notebookId: string) {
  const n = notebook.notebooks.find((x) => x.id === notebookId)
  const count = store.sourcesForNotebook(notebookId).length
  const msg = n
    ? `Fechar o caderno «${n.title}»?${count ? ` Isto remove ${count} fonte(s) deste caderno.` : ''}`
    : 'Fechar este caderno?'
  if (!window.confirm(msg)) return
  await notebook.deleteNotebookById(notebookId)
}

function enqueueExtraction(task: () => Promise<void>) {
  extractionQueue = extractionQueue.then(task, task)
}

function parseVisionOptions(): {
  visionMaxLongEdgePx?: number
  visionScale?: number
  visionCooldownMs?: number
} {
  const out: { visionMaxLongEdgePx?: number; visionScale?: number; visionCooldownMs?: number } = {}
  const rawEdge = import.meta.env.VITE_VISION_MAX_LONG_EDGE
  if (rawEdge !== undefined && String(rawEdge).trim() !== '') {
    const e = parseInt(String(rawEdge), 10)
    if (Number.isFinite(e)) out.visionMaxLongEdgePx = Math.max(0, e)
  }
  const rawScale = import.meta.env.VITE_VISION_SCALE
  if (rawScale !== undefined && String(rawScale).trim() !== '') {
    const s = parseFloat(String(rawScale))
    if (Number.isFinite(s) && s > 0.25 && s <= 6) out.visionScale = s
  }
  const rawCd = import.meta.env.VITE_VISION_COOLDOWN_MS
  if (rawCd !== undefined && String(rawCd).trim() !== '') {
    const c = parseInt(String(rawCd), 10)
    if (Number.isFinite(c) && c >= 0 && c <= 60_000) out.visionCooldownMs = c
  }
  return out
}

async function processPdfSource(id: string, file: File, notebookId: string) {
  logger.info('Starting PDF processing', { id, fileName: file.name, notebookId, fileSize: file.size })
  try {
    const result = await buildLlmDocumentFromPdf(file, {
      onProgress: (p) => store.updateProgress(id, p),
      ocrAllPages: import.meta.env.VITE_PDF_OCR_ALL_PAGES !== '0',
    })
    logger.info('PDF extraction completed', { id, extractedTextLength: result.rawPlainText.length })
    let llmMarkdown = result.llmMarkdown
    if (llmRuntime.canRunVision() && llmRuntime.effectiveServerBase) {
      const modelName = llmRuntime.chatModelName.trim() || 'default'
      logger.info('Starting vision enrichment', { id, model: modelName, baseUrl: llmRuntime.effectiveServerBase })
      try {
        llmMarkdown = await enrichMarkdownWithLlamaVision(file, llmMarkdown, {
          baseUrl: llmRuntime.effectiveServerBase,
          apiToken: llmRuntime.llmApiToken,
          model: modelName,
          onProgress: (p) => store.updateProgress(id, p),
          bitmapPageNumbers: result.bitmapPageNumbers,
          ...parseVisionOptions(),
        })
      } catch (e) {
        logger.error('Vision enrichment failed', { id, error: e instanceof Error ? e.message : String(e) })
        const raw = e instanceof LlamaRuntimeError ? e.message : e instanceof Error ? e.message : String(e)
        const safe = raw.replace(/`/g, "'").slice(0, 1200)
        llmMarkdown =
          llmMarkdown.trimEnd() +
          '\n\n---\n\n## Enriquecimento por visão (LLM)\n\n' +
          '_Falha ao correr o enriquecimento por visão (a extração PDF já terminou; o erro foi só nesta fase)._\n\n' +
          '```\n' +
          safe +
          '\n```\n'
      }
    }
    await nextTick()
    store.complete(id, {
      extractedText: result.rawPlainText,
      llmMarkdown,
    })
    try {
      await applyExtractedTickerToNotebook(notebookId, llmMarkdown, result.rawPlainText)
    } catch (e) {
      logger.warn('Failed to apply extracted ticker to notebook', {
        notebookId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    if (isPdfDbAvailable()) {
      try {
        logger.info('Persisting document to database', { id, notebookId })
        const buf = await file.arrayBuffer()
        const persisted = await pdfDbPersistDocument({
          documentId: id,
          notebookId,
          fileName: file.name,
          pdfBytes: buf,
          rawPlainText: result.rawPlainText,
          llmMarkdown,
          pageSections: [],
        })
        const src = store.sources.find((x) => x.id === id)
        if (src && persisted?.pdfPath) {
          src.pdfPath = persisted.pdfPath
          if (persisted.aiSummary !== undefined) src.aiSummary = persisted.aiSummary
          if (persisted.aiSummaryUpdatedAt !== undefined) src.aiSummaryUpdatedAt = persisted.aiSummaryUpdatedAt
          logger.info('Document persisted successfully', { id, pdfPath: persisted.pdfPath })
        }
      } catch (e) {
        logger.error('Failed to persist document', { id, error: e instanceof Error ? e.message : String(e) })
        console.error('[openyield] Falha a persistir no Vectra:', e)
      }
    }
    logger.info('PDF processing completed successfully', { id })
  } catch (e) {
    logger.error('PDF processing failed', { id, error: e instanceof Error ? e.message : String(e) })
    store.fail(id, mapPdfExtractError(e))
  }
}

function onFiles(files: File[]) {
  logger.info('Files dropped for processing', { count: files.length, files: files.map(f => f.name) })
  if (!notebook.activeNotebookId) notebook.ensureDefaultInMemory()
  const nbId = notebook.activeNotebookId
  if (!nbId) return
  const shouldSelectFirstNew = !store.selectedId
  files.forEach((file, index) => {
    const id = store.addPending(file, nbId, { select: shouldSelectFirstNew && index === 0 })
    enqueueExtraction(() => processPdfSource(id, file, nbId))
  })
}

function addAnother() {
  dropRef.value?.openFileDialog()
}

function useStarterQuestion(text: string) {
  chatDraft.value = text
}

function setChatStep(messageId: string, label: string, status: ChatStep['status'], detail?: string) {
  const index = chatMessages.value.findIndex((message) => message.id === messageId)
  if (index < 0) return
  const message = chatMessages.value[index]!
  const steps = (message.steps ?? []).map((step) => ({ ...step }))
  const existing = steps.find((step) => step.label === label)
  if (existing) {
    existing.status = status
    existing.detail = detail
  } else {
    steps.push({ label, status, detail })
  }
  patchChatMessage(messageId, { steps })
}

function latestSnapshotContext(): string {
  const snapshot = fundamentalStore.latestForNotebook(notebook.activeNotebookId)
  if (!snapshot) return 'Sem snapshot fundamentalista estruturado neste caderno.'
  const rows = snapshot.fields
    .filter((field) => !isMissingFundamentalValue(field.value))
    .map((field) => {
      const evidence = [field.source_file, field.source_page ? `pág. ${field.source_page}` : null, field.source_line]
        .filter(Boolean)
        .join(' | ')
      return `- ${field.label} (${field.key}): ${field.value}${evidence ? ` [${evidence}]` : ''}${field.calculation ? ` | cálculo: ${field.calculation}` : ''}`
    })
  return [`Snapshot fundamentalista: ${snapshot.title} ${snapshot.ticker ?? ''}`, ...rows].join('\n')
}

function recentChatHistory(): string {
  return chatMessages.value
    .slice(-8)
    .filter((message) => message.status !== 'thinking' && message.text.trim())
    .map((message) => `${message.role === 'user' ? 'Usuário' : 'Assistente'}: ${message.text.slice(0, 1400)}`)
    .join('\n\n')
}

function compactPromptTextForChat(text: string): string {
  return cleanPromptText(text).slice(0, 2500)
}

async function planChatQuery(question: string, messageId: string): Promise<ChatPlan> {
  const fallback = deterministicChatPlan(question)
  const model = llmRuntime.chatModelName.trim()
  if (!model || !llmRuntime.effectiveServerBase) return refineChatPlan(question, fallback)
  setChatStep(messageId, 'Planejando busca', 'running', 'Classificando intenção e ferramentas do harness.')
  try {
    const out = await withTimeout(
      chatCompletion({
        baseUrl: llmRuntime.effectiveServerBase,
        apiToken: llmRuntime.llmApiToken,
        model,
        temperature: 0,
        timeoutMs: 8_000,
        messages: [{ role: 'user', content: buildHarnessPlannerPrompt(question) }],
      }),
      5_000,
      'Planejamento por IA demorou; usando plano determinístico.',
    )
    const parsed = extractJsonObject(out.text) as Partial<ChatPlan>
    const rawPlan: ChatPlan = {
      intent:
        parsed.intent === 'lookup' ||
        parsed.intent === 'compare' ||
        parsed.intent === 'report' ||
        parsed.intent === 'advisory' ||
        parsed.intent === 'general'
          ? parsed.intent
          : fallback.intent,
      fields: Array.isArray(parsed.fields) && parsed.fields.length ? parsed.fields.map(String) : fallback.fields,
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length ? parsed.keywords.map(String) : fallback.keywords,
      depth: parsed.depth === 'deep' || parsed.depth === 'fast' ? parsed.depth : fallback.depth,
    }
    const plan = refineChatPlan(question, rawPlan)
    setChatStep(messageId, 'Planejando busca', 'done', `${plan.intent}; ${plan.keywords.slice(0, 4).join(', ')}`)
    return plan
  } catch (e) {
    setChatStep(messageId, 'Planejando busca', 'warn', e instanceof Error ? e.message : String(e))
    return refineChatPlan(question, fallback)
  }
}

function sourceSummaryForChat(source: { fileName: string; aiSummary?: string; llmMarkdown: string; extractedText: string }): string {
  if (source.aiSummary?.trim()) return cleanPromptText(source.aiSummary).slice(0, 4500)
  return compactPromptTextForChat(source.llmMarkdown || source.extractedText)
}

function matchingLocalLines(text: string, plan: ChatPlan, limit = 10): string[] {
  const foldedKeywords = plan.keywords.map(normalizeQuestionText).filter((word) => word.length > 2)
  if (!foldedKeywords.length) return []
  const lines = cleanPromptText(text)
    .slice(0, plan.depth === 'deep' ? 120_000 : 45_000)
    .split(/\n|(?<=\.)\s+/)
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (line.length < 12 || line.length > 320 || !/\d/.test(line)) continue
    const folded = normalizeQuestionText(line)
    if (!foldedKeywords.some((word) => folded.includes(word))) continue
    out.push(line)
    if (out.length >= limit) break
  }
  return out
}

function localChatEvidence(plan: ChatPlan): string {
  return readySources.value
    .slice(0, 6)
    .map((source) => {
      const summary = sourceSummaryForChat(source)
      const lines = matchingLocalLines(summary, plan, 8)
      const body = lines.length ? lines.map((line) => `- ${line}`).join('\n') : summary.slice(0, 2500)
      return `[${source.fileName} | resumo interno]\n${body}`
    })
    .join('\n\n---\n\n')
}

async function collectChatEvidence(question: string, messageId: string, plan: ChatPlan): Promise<string> {
  const notebookId = notebook.activeNotebookId
  if (!notebookId) return ''
  setChatStep(messageId, 'Resumos internos', 'running', 'Lendo cabeçalhos persistidos dos PDFs.')
  await nextTick()
  const fallback = localChatEvidence(plan)
  setChatStep(messageId, 'Resumos internos', fallback.trim() ? 'done' : 'warn', fallback.trim() ? 'Pronto.' : 'Sem resumo local.')
  if (!window.openYieldElectron?.vectorBuscarChunksNotebook) {
    setChatStep(messageId, 'Índice vetorial', 'warn', 'Indisponível; usando fallback local.')
    return fallback
  }
  setChatStep(messageId, 'Índice vetorial', 'running', 'Consulta curta; fallback local já preparado.')
  try {
    const vectorQuery = [question, ...plan.keywords].filter(Boolean).join('\n')
    const rows = await withTimeout(
      vectorBuscarChunksDoNotebook(vectorQuery, notebookId, plan.depth === 'deep' ? 20 : 10),
      2_500,
      'Busca vetorial demorou; usando fallback local.',
    )
    const blocks = rows
      .map((row) => {
        const text = typeof row.metadata.chunkText === 'string' ? row.metadata.chunkText : ''
        return `[${chunkReference(row)} | score ${row.score.toFixed(3)}]\n${text.slice(0, 1800)}`
      })
      .filter((block) => block.trim())
    setChatStep(messageId, 'Índice vetorial', blocks.length ? 'done' : 'warn', `${blocks.length} trecho(s).`)
    if (blocks.length) return `${fallback}\n\n---\n\n${blocks.join('\n\n---\n\n')}`.slice(0, 18000)
  } catch (e) {
    setChatStep(messageId, 'Índice vetorial', 'warn', e instanceof Error ? e.message : String(e))
  }
  if (plan.depth === 'deep') {
    setChatStep(messageId, 'Busca local profunda', 'running', 'Procurando linhas no texto extraído limitado.')
    await nextTick()
    const deep = readySources.value
      .slice(0, 8)
      .map((source) => {
        const lines = matchingLocalLines(source.llmMarkdown || source.extractedText, plan, 12)
        return lines.length ? `[${source.fileName} | texto extraído]\n${lines.map((line) => `- ${line}`).join('\n')}` : ''
      })
      .filter(Boolean)
      .join('\n\n---\n\n')
    setChatStep(messageId, 'Busca local profunda', deep ? 'done' : 'warn', deep ? 'Trechos encontrados.' : 'Sem linhas adicionais.')
    return `${fallback}\n\n---\n\n${deep}`.slice(0, 18000)
  }
  return fallback
}

function requestedMissingNotebooks(question: string): string[] {
  const wanted = ['sabesp', 'sbsp3', 'copasa', 'csmg3']
  const q = question.toLowerCase()
  const missing: string[] = []
  for (const key of wanted) {
    if (!q.includes(key)) continue
    const exists = notebook.notebooks.some((n) =>
      [n.title, n.ticker ?? ''].some((value) => value.toLowerCase().includes(key)),
    )
    if (!exists) missing.push(key.toUpperCase())
  }
  return [...new Set(missing)]
}

function buildStructuredChatContext(): string {
  return [latestSnapshotContext(), '', buildValuationContext(notebook.activeNotebookId)].join('\n')
}

function buildChatPrompt(question: string, evidence: string, critique = '', plan?: ChatPlan): string {
  const active = selectedNotebook.value
  const activeLabel = active ? notebookDisplayTitle(active) : 'nenhum'
  const missing = requestedMissingNotebooks(question)
  const instructions = buildHarnessAnswerInstructions(plan ?? { intent: 'general', fields: [], keywords: [], depth: 'deep' }, activeLabel)
  return [
    ...instructions,
    critique ? `Crítica da tentativa anterior: ${critique}` : null,
    '',
    missing.length ? `Notebooks mencionados mas ausentes: ${missing.join(', ')}` : null,
    plan ? `Plano: ${plan.intent}; profundidade=${plan.depth}; termos=${plan.keywords.join(', ')}` : null,
    '',
    'Dados estruturados do banco:',
    buildStructuredChatContext(),
    '',
    'Evidências vetoriais/local:',
    evidence || 'Sem evidências recuperadas.',
    '',
    'Histórico recente:',
    recentChatHistory() || 'Sem histórico.',
    '',
    `Pergunta do usuário: ${question}`,
  ].filter(Boolean).join('\n')
}

function answerFromStructuredSnapshot(question: string, plan?: ChatPlan): string | null {
  if (!plan || !shouldUseStructuredFastPath(question, plan)) return null
  const snapshot = fundamentalStore.latestForNotebook(notebook.activeNotebookId)
  if (!snapshot) return null
  const q = normalizeQuestionText(question)
  const fieldHints: Array<[string, string[]]> = [
    ['marg_ebit', ['margem ebit', 'marg ebit', 'margim ebit', 'margem evit', 'margim evit', 'ebit margin']],
    ['marg_bruta', ['margem bruta', 'marg bruta', 'margim bruta']],
    ['marg_liquida', ['margem liquida', 'marg liquida', 'margim liquida']],
    ['roe', ['roe']],
    ['roic', ['roic']],
    ['receita_liquida_12m', ['receita liquida']],
    ['ebit_12m', ['ebit ', ' ebit', 'ebitda']],
    ['lucro_liquido_12m', ['lucro liquido']],
  ]
  const plannedKey = plan.fields.find((field) => snapshot.fields.some((item) => item.key === field))
  const key = plannedKey ?? fieldHints.find(([, hints]) => hints.some((hint) => q.includes(hint)))?.[0]
  if (!key) return null
  const field = snapshot.fields.find((item) => item.key === key)
  if (!field || isMissingFundamentalValue(field.value)) return null
  const requestedPeriod = q.match(/\b(?:q|t)([1-4])\s*(?:de\s*)?(20\d{2}|\d{2})\b/i)
  const periodNote = requestedPeriod
    ? `\n\nObservação: o snapshot atual guarda um valor consolidado/mais recente para esse campo. Ainda não há série temporal por trimestre armazenada para comparar exatamente ${requestedPeriod[0]}.`
    : ''
  const evidence = [field.source_file, field.source_page ? `pág. ${field.source_page}` : null, field.source_line]
    .filter(Boolean)
    .join(' | ')
  return [
    `No notebook ativo (${selectedNotebook.value ? notebookDisplayTitle(selectedNotebook.value) : 'caderno atual'}), **${field.label}** está em **${field.value}**.`,
    evidence ? `Fonte: ${evidence}.` : null,
    field.calculation ? `Cálculo/critério: ${field.calculation}` : null,
    periodNote,
  ].filter(Boolean).join('\n\n')
}

async function scoreChatAnswer(question: string, answer: string, context: string, messageId: string): Promise<{ score: number; critique: string }> {
  const model = llmRuntime.chatModelName.trim()
  if (!model || !llmRuntime.effectiveServerBase || !answer.trim()) return { score: answer.trim() ? 0.7 : 0, critique: '' }
  setChatStep(messageId, 'Pontuando resposta', 'running', 'Verificando cobertura, fontes e falta de invenção.')
  try {
    const out = await chatCompletion({
      baseUrl: llmRuntime.effectiveServerBase,
      apiToken: llmRuntime.llmApiToken,
      model,
      temperature: 0,
      timeoutMs: 45_000,
      messages: [
        {
          role: 'user',
          content: [
            'Avalie a resposta para uma pergunta financeira com base no contexto.',
            'Responda somente JSON: {"score":0.0,"critique":"..."}',
            'Critérios: responde a pergunta, cita evidências, não inventa números, declara faltas.',
            'Para perguntas de investimento ("devo investir"), penalize respostas que citam só um indicador isolado.',
            `Pergunta: ${question}`,
            `Contexto: ${context.slice(0, 9000)}`,
            `Resposta: ${answer.slice(0, 5000)}`,
          ].join('\n\n'),
        },
      ],
    })
    const parsed = extractJsonObject(out.text) as { score?: unknown; critique?: unknown }
    const score = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score)
    const critique = typeof parsed.critique === 'string' ? parsed.critique : ''
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.65
    setChatStep(messageId, 'Pontuando resposta', safeScore >= 0.72 ? 'done' : 'warn', `score ${safeScore.toFixed(2)}`)
    return { score: safeScore, critique }
  } catch (e) {
    setChatStep(messageId, 'Pontuando resposta', 'warn', e instanceof Error ? e.message : String(e))
    return { score: 0.7, critique: '' }
  }
}

async function runChatHarness(question: string, messageId: string) {
  const model = llmRuntime.chatModelName.trim()
  const hasNotebookData =
    readySources.value.length > 0 ||
    !!fundamentalStore.latestForNotebook(notebook.activeNotebookId) ||
    hasAnyValuationContext()
  if (!hasNotebookData) {
    patchChatMessage(messageId, {
      text: 'Adicione uma fonte, gere um snapshot fundamentalista ou calcule uma valuation (FCD/Graham) para eu responder com base no caderno.',
      status: 'done',
    })
    return
  }

  patchChatMessage(messageId, { status: 'thinking' })
  setChatStep(messageId, 'Pensando', 'running', 'Montando plano do notebook ativo.')
  const plan = await planChatQuery(question, messageId)
  let evidence = ''
  try {
    const valuationAnswer = answerFromValuations(question, notebook.activeNotebookId)
    if (valuationAnswer && shouldUseValuationFastPath(question, plan)) {
      setChatStep(messageId, 'Valuations', 'done', 'Resposta encontrada nos modelos calculados.')
      patchChatMessage(messageId, { text: valuationAnswer, score: 0.9, status: 'done' })
      return
    }
    const structuredAnswer = answerFromStructuredSnapshot(question, plan)
    if (structuredAnswer) {
      setChatStep(messageId, 'Banco estruturado', 'done', 'Resposta encontrada no snapshot fundamentalista.')
      patchChatMessage(messageId, { text: structuredAnswer, score: 0.92, status: 'done' })
      return
    }
    if (!model || !llmRuntime.effectiveServerBase) {
      patchChatMessage(messageId, {
        text: 'Conecte um modelo LLM para o chat. Eu já tentei o banco estruturado, mas esta pergunta precisa de redação/consulta semântica.',
        status: 'error',
      })
      return
    }
    evidence = await withTimeout(
      collectChatEvidence(question, messageId, plan),
      plan.depth === 'deep' ? 7_500 : 4_500,
      'Preparação de contexto demorou; seguindo com snapshot e contexto mínimo.',
    )
  } catch (e) {
    setChatStep(messageId, 'Contexto local', 'warn', e instanceof Error ? e.message : String(e))
    evidence = ''
  }
  setChatStep(messageId, 'Pensando', 'done', plan.intent === 'advisory' ? 'Montando análise completa.' : 'Contexto preparado.')

  let critique = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildChatPrompt(question, evidence, critique, plan)
    setChatStep(messageId, `Gerando resposta ${attempt}/2`, 'running', `~${estimatePromptTokens(prompt)} tokens de contexto.`)
    const previousText =
      attempt === 1
        ? ''
        : `${chatMessages.value.find((message) => message.id === messageId)?.text ?? ''}\n\n---\n\nRevisando resposta com score baixo...\n\n`
    patchChatMessage(messageId, { status: 'streaming', text: previousText, thinkingText: undefined })

    let contentSoFar = previousText
    let reasoningSoFar = ''
    try {
      const out = await chatCompletion({
        baseUrl: llmRuntime.effectiveServerBase,
        apiToken: llmRuntime.llmApiToken,
        model,
        temperature: 0.1,
        timeoutMs: attempt === 1 ? 120_000 : 180_000,
        onReasoningDelta: (_delta, reasoning) => {
          reasoningSoFar = reasoning
          applyStreamDelta(messageId, '', _delta, contentSoFar, reasoningSoFar)
        },
        onTextDelta: (delta, text) => {
          contentSoFar = attempt === 1 ? text : `${previousText}${text}`
          applyStreamDelta(messageId, delta, '', contentSoFar, reasoningSoFar)
        },
        messages: [{ role: 'user', content: prompt }],
      })
      let finalText = out.text.trim()
      let finalThinking = (out.reasoning ?? reasoningSoFar).trim()
      const parsed = parseThinkTagsInStream(finalText)
      if (parsed.thinkingText) {
        finalThinking = finalThinking ? `${finalThinking}\n${parsed.thinkingText}`.trim() : parsed.thinkingText
        finalText = parsed.text
      }
      patchChatMessage(messageId, {
        text: finalText,
        thinkingText: finalThinking || undefined,
      })
      setChatStep(messageId, `Gerando resposta ${attempt}/2`, 'done', `${finalText.length} caracteres.`)
    } catch (e) {
      setChatStep(messageId, `Gerando resposta ${attempt}/2`, 'warn', e instanceof Error ? e.message : String(e))
      if (attempt === 1) continue
      const current = chatMessages.value.find((message) => message.id === messageId)
      patchChatMessage(messageId, {
        text: current?.text || `Não consegui concluir a resposta do modelo. Detalhe: ${e instanceof Error ? e.message : String(e)}`,
        status: 'error',
      })
      return
    }

    const currentText = chatMessages.value.find((message) => message.id === messageId)?.text ?? ''
    const scored = await scoreChatAnswer(question, currentText, `${buildStructuredChatContext()}\n\n${evidence}`, messageId)
    patchChatMessage(messageId, { score: scored.score })
    if (scored.score >= 0.72 || attempt === 2) {
      patchChatMessage(messageId, { status: 'done' })
      return
    }
    critique = scored.critique || 'Resposta com baixa cobertura; refaça citando dados, faltas e fontes.'
  }
}

async function submitChat() {
  const text = chatDraft.value.trim()
  if (!text || chatRunning.value) return
  const userMessageId = crypto.randomUUID()
  const assistantId = crypto.randomUUID()
  chatMessages.value = [
    ...chatMessages.value,
    { id: userMessageId, role: 'user', text },
    {
      id: assistantId,
      role: 'assistant',
      text: '',
      status: 'thinking',
      steps: [{ label: 'Pensando', status: 'running', detail: 'Iniciando harness financeiro.' }],
    },
  ]
  chatDraft.value = ''
  chatRunning.value = true
  await nextTick()
  scrollChatToBottom()
  try {
    await runChatHarness(text, assistantId)
  } catch (e) {
    patchChatMessage(assistantId, {
      status: 'error',
      text: `Falha no harness antes de concluir a resposta: ${e instanceof Error ? e.message : String(e)}`,
    })
    setChatStep(assistantId, 'Erro', 'error', e instanceof Error ? e.message : String(e))
  } finally {
    chatRunning.value = false
  }
}

function riskQueries(): string[] {
  return [
    'perdas de água eficiência operacional volume água esgoto custos gerenciáveis pessoal energia elétrica produtos químicos',
    'inadimplência PECLD perdas esperadas contas a receber arrecadação faturas clientes',
    'dívida líquida EBITDA alavancagem covenants despesa financeira custo da dívida lucro líquido',
    'reajuste tarifário revisão tarifária ARSAE concessão contrato programa regulação saneamento básico',
    'capex investimentos universalização reservatórios risco hídrico abastecimento esgotamento sanitário',
  ]
}

const RISK_REPORT_SECTIONS = [
  {
    title: 'Riscos operacionais e eficiência',
    instruction:
      'Analise perdas de água, volumes, eficiência operacional e custos gerenciáveis como pessoal, energia e produtos químicos.',
  },
  {
    title: 'Risco de crédito e arrecadação',
    instruction:
      'Analise inadimplência, PECLD, contas a receber, provisões e qualquer sinal de piora no recebimento de faturas.',
  },
  {
    title: 'Alavancagem e risco financeiro',
    instruction:
      'Analise dívida líquida/EBITDA, custo da dívida, despesas financeiras, covenants e impacto no lucro líquido.',
  },
  {
    title: 'Risco regulatório e contratual',
    instruction:
      'Analise reajustes/revisões tarifárias, ARSAE, contratos de concessão/programa, regulação e riscos de renovação.',
  },
  {
    title: 'Pressões de custos, margem e pontos de acompanhamento',
    instruction:
      'Analise pressões de margem, capex, universalização, reservatórios, risco hídrico e pontos a monitorar nos próximos trimestres.',
  },
]

const FUNDAMENTAL_FIELDS: Array<{ key: string; label: string; section: string }> = [
  { key: 'papel', label: 'Papel', section: 'Identificação' },
  { key: 'tipo', label: 'Tipo', section: 'Identificação' },
  { key: 'empresa', label: 'Empresa', section: 'Identificação' },
  { key: 'setor', label: 'Setor', section: 'Identificação' },
  { key: 'subsetor', label: 'Subsetor', section: 'Identificação' },
  { key: 'cotacao', label: 'Cotação', section: 'Cotação' },
  { key: 'data_ult_cot', label: 'Data últ cot', section: 'Cotação' },
  { key: 'min_52_sem', label: 'Min 52 sem', section: 'Cotação' },
  { key: 'max_52_sem', label: 'Max 52 sem', section: 'Cotação' },
  { key: 'vol_med_2m', label: 'Vol $ méd (2m)', section: 'Cotação' },
  { key: 'valor_mercado', label: 'Valor de mercado', section: 'Mercado' },
  { key: 'valor_firma', label: 'Valor da firma', section: 'Mercado' },
  { key: 'ult_balanco', label: 'Últ balanço processado', section: 'Mercado' },
  { key: 'nro_acoes', label: 'Nro. Ações', section: 'Mercado' },
  { key: 'osc_dia', label: 'Dia', section: 'Oscilações' },
  { key: 'osc_mes', label: 'Mês', section: 'Oscilações' },
  { key: 'osc_30_dias', label: '30 dias', section: 'Oscilações' },
  { key: 'osc_12_meses', label: '12 meses', section: 'Oscilações' },
  { key: 'osc_ano_atual', label: 'Ano atual', section: 'Oscilações' },
  { key: 'pl', label: 'P/L', section: 'Indicadores fundamentalistas' },
  { key: 'pvp', label: 'P/VP', section: 'Indicadores fundamentalistas' },
  { key: 'pebit', label: 'P/EBIT', section: 'Indicadores fundamentalistas' },
  { key: 'psr', label: 'PSR', section: 'Indicadores fundamentalistas' },
  { key: 'pativos', label: 'P/Ativos', section: 'Indicadores fundamentalistas' },
  { key: 'div_yield', label: 'Div. Yield', section: 'Indicadores fundamentalistas' },
  { key: 'ev_ebitda', label: 'EV / EBITDA', section: 'Indicadores fundamentalistas' },
  { key: 'ev_ebit', label: 'EV / EBIT', section: 'Indicadores fundamentalistas' },
  { key: 'cres_rec_5a', label: 'Cres. Rec (5a)', section: 'Indicadores fundamentalistas' },
  { key: 'lpa', label: 'LPA', section: 'Indicadores fundamentalistas' },
  { key: 'vpa', label: 'VPA', section: 'Indicadores fundamentalistas' },
  { key: 'marg_bruta', label: 'Marg. Bruta', section: 'Indicadores fundamentalistas' },
  { key: 'marg_ebit', label: 'Marg. EBIT', section: 'Indicadores fundamentalistas' },
  { key: 'marg_liquida', label: 'Marg. Líquida', section: 'Indicadores fundamentalistas' },
  { key: 'ebit_ativo', label: 'EBIT / Ativo', section: 'Indicadores fundamentalistas' },
  { key: 'roic', label: 'ROIC', section: 'Indicadores fundamentalistas' },
  { key: 'roe', label: 'ROE', section: 'Indicadores fundamentalistas' },
  { key: 'liquidez_corr', label: 'Liquidez Corr.', section: 'Indicadores fundamentalistas' },
  { key: 'div_liq_patrim', label: 'Dív Líq / Patrim', section: 'Indicadores fundamentalistas' },
  { key: 'giro_ativos', label: 'Giro Ativos', section: 'Indicadores fundamentalistas' },
  { key: 'ativo', label: 'Ativo', section: 'Dados Balanço Patrimonial' },
  { key: 'disponibilidades', label: 'Disponibilidades', section: 'Dados Balanço Patrimonial' },
  { key: 'ativo_circulante', label: 'Ativo Circulante', section: 'Dados Balanço Patrimonial' },
  { key: 'div_bruta', label: 'Dív. Bruta', section: 'Dados Balanço Patrimonial' },
  { key: 'div_liquida', label: 'Dív. Líquida', section: 'Dados Balanço Patrimonial' },
  { key: 'patrim_liq', label: 'Patrim. Líq', section: 'Dados Balanço Patrimonial' },
  { key: 'receita_liquida_12m', label: 'Receita Líquida', section: 'Últimos 12 meses' },
  { key: 'ebit_12m', label: 'EBIT', section: 'Últimos 12 meses' },
  { key: 'lucro_liquido_12m', label: 'Lucro Líquido', section: 'Últimos 12 meses' },
  { key: 'receita_liquida_3m', label: 'Receita Líquida', section: 'Últimos 3 meses' },
  { key: 'ebit_3m', label: 'EBIT', section: 'Últimos 3 meses' },
  { key: 'lucro_liquido_3m', label: 'Lucro Líquido', section: 'Últimos 3 meses' },
]

function chunkReference(result: VectorSearchResult): string {
  const m = result.metadata
  const fileName = typeof m.fileName === 'string' ? m.fileName : 'Fonte'
  const pageNum = typeof m.pageNum === 'number' ? m.pageNum : null
  const section = typeof m.sectionKind === 'string' ? m.sectionKind : 'trecho'
  return `${fileName}${pageNum ? `, pág. ${pageNum}` : ''}, ${section}`
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(t)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(t)
        reject(error)
      },
    )
  })
}

function localRiskEvidenceFromReadySources(): string {
  return readySources.value
    .slice(0, 8)
    .map((source) => {
      const text = structuredTextForPrompt(source.llmMarkdown || '', source.extractedText)
      return `[${source.fileName} | fallback local]\n${text.slice(0, 9000)}`
    })
    .join('\n\n---\n\n')
}

function updateReportProgress(
  report: StudioReport,
  percent: number,
  subtitle: string,
  body?: string,
  etaSeconds?: number,
) {
  report.progressPercent = Math.max(0, Math.min(100, Math.round(percent)))
  report.subtitle = subtitle
  report.etaLabel =
    etaSeconds != null && etaSeconds > 0
      ? `~${etaSeconds}s restantes`
      : report.progressPercent >= 100
        ? 'Concluído'
        : 'Estimando tempo...'
  if (body !== undefined) report.body = body
}

function persistReportSafely(report: StudioReport) {
  reportStore.persist(report).catch((e) => {
    logger.warn('Report persistence failed without blocking generation', {
      reportId: report.id,
      error: e instanceof Error ? e.message : String(e),
    })
  })
}

function persistFundamentalSafely(snapshot: FundamentalSnapshot) {
  fundamentalStore.persist(snapshot).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e)
    if (/no handler registered/i.test(msg) || /pdf-db-persist-fundamental-snapshot/i.test(msg)) {
      logger.debug('Fundamental snapshot saved to local fallback; Electron main process has no IPC handler yet', {
        snapshotId: snapshot.id,
      })
      return
    }
    logger.warn('Fundamental snapshot persistence failed without blocking extraction', {
      snapshotId: snapshot.id,
      error: msg,
    })
  })
}

function updateFundamentalProgress(
  snapshot: FundamentalSnapshot,
  percent: number,
  etaLabel: string,
) {
  snapshot.progressPercent = Math.max(0, Math.min(100, Math.round(percent)))
  snapshot.etaLabel = snapshot.progressPercent >= 100 ? 'Concluído' : etaLabel
}

function fundamentalSections(snapshot: FundamentalSnapshot | null): Array<{ title: string; fields: FundamentalField[] }> {
  if (!snapshot) return []
  const bySection = new Map<string, FundamentalField[]>()
  for (const def of FUNDAMENTAL_FIELDS) bySection.set(def.section, [])
  for (const field of snapshot.fields) {
    const list = bySection.get(field.section) ?? []
    list.push(field)
    bySection.set(field.section, list)
  }
  return [...bySection.entries()]
    .map(([title, fields]) => ({ title, fields: fields.filter((field) => field.value.trim()) }))
    .filter((section) => section.fields.length)
}

function isMissingFundamentalValue(value: string): boolean {
  return !value.trim() || /informação não (encontrada|detalhada)|não encontrado|n\/d|^-$|^--$/i.test(value.trim())
}

function onFundamentalFieldInput(snapshot: FundamentalSnapshot, field: FundamentalField, value: string) {
  field.value = value
  field.manual = true
  field.source = value.trim() ? 'Editado manualmente' : field.source
  field.calculation = value.trim() ? 'Valor informado/editado manualmente pelo usuário.' : field.calculation
  snapshot.status = snapshot.status === 'error' ? 'ready' : snapshot.status
  persistFundamentalSafely(snapshot)
}

function hasFundamentalEvidence(field: FundamentalField): boolean {
  return !!(field.source_file || field.source_page || field.source_line || field.calculation || field.source)
}

function fundamentalEvidenceTooltip(field: FundamentalField): string {
  const origin = [
    field.source_file ? `arquivo ${field.source_file}` : null,
    field.source_page ? `página ${field.source_page}` : null,
    field.source_line ? field.source_line : null,
  ].filter(Boolean).join(', ')
  const lines = [`Extraído de: ${origin || field.source || 'não informado'}`]
  const calculation =
    field.calculation ||
    (field.manual ? 'Valor informado/editado manualmente pelo usuário.' : 'Extraído diretamente da fonte, sem cálculo adicional.')
  if (calculation) lines.push(`Cálculo efetuado: ${calculation}`)
  return lines.join('\n')
}

function collectFundamentalEvidence(): string {
  return readySources.value
    .slice(0, 8)
    .map((source) => {
      const text = structuredTextForPrompt(source.llmMarkdown || '', source.extractedText)
      return `[${source.fileName}]\n${text.slice(0, 7_500)}`
    })
    .join('\n\n---\n\n')
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('O modelo não retornou JSON.')
    return JSON.parse(match[0]!)
  }
}

function normalizeFundamentalFields(raw: unknown): FundamentalField[] {
  const obj = raw as {
    fields?: Array<{
      key?: unknown
      value?: unknown
      source?: unknown
      source_file?: unknown
      source_page?: unknown
      source_line?: unknown
      calculation?: unknown
    }>
  }
  const byKey = new Map((Array.isArray(obj.fields) ? obj.fields : []).map((field) => [String(field.key ?? ''), field]))
  return FUNDAMENTAL_FIELDS.map((def) => {
    const rawField = byKey.get(def.key)
    const rawValue = typeof rawField?.value === 'string' ? rawField.value.trim() : ''
    const value = normalizeFundamentalValueForKey(def.key, rawValue)
    const source = typeof rawField?.source === 'string' ? rawField.source.trim() : undefined
    const sourceFile = typeof rawField?.source_file === 'string' ? rawField.source_file.trim() : undefined
    const sourcePage = typeof rawField?.source_page === 'string' ? rawField.source_page.trim() : undefined
    const sourceLine = typeof rawField?.source_line === 'string' ? rawField.source_line.trim() : undefined
    const calculation = typeof rawField?.calculation === 'string' ? rawField.calculation.trim() : undefined
    return {
      ...def,
      value: value || 'Informação não encontrada',
      source,
      source_file: sourceFile,
      source_page: sourcePage,
      source_line: sourceLine,
      calculation,
    }
  })
}

function parsePtNumber(value: string | undefined): number | null {
  if (!value || isMissingFundamentalValue(value)) return null
  const cleaned = value
    .replace(/[^\d,.\-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function formatPtNumber(value: number, suffix = ''): string {
  const digits = Math.abs(value) >= 100 ? 2 : 2
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })}${suffix}`
}

function normalizePercentDisplay(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('%')) return trimmed
  const n = parsePtNumber(trimmed)
  return n == null ? trimmed : formatPtNumber(n, '%')
}

const PERCENT_FIELD_KEYS = new Set([
  'osc_dia',
  'osc_mes',
  'osc_30_dias',
  'osc_12_meses',
  'osc_ano_atual',
  'div_yield',
  'cres_rec_5a',
  'marg_bruta',
  'marg_ebit',
  'marg_liquida',
  'ebit_ativo',
  'roic',
  'roe',
])

const MULTIPLE_FIELD_KEYS = new Set([
  'pl',
  'pvp',
  'pebit',
  'psr',
  'pativos',
  'ev_ebitda',
  'ev_ebit',
  'liquidez_corr',
  'div_liq_patrim',
  'giro_ativos',
])

const MONEY_OR_QUANTITY_FIELD_KEYS = new Set([
  'vol_med_2m',
  'valor_mercado',
  'valor_firma',
  'nro_acoes',
  'ativo',
  'disponibilidades',
  'ativo_circulante',
  'div_bruta',
  'div_liquida',
  'patrim_liq',
  'receita_liquida_12m',
  'ebit_12m',
  'lucro_liquido_12m',
  'receita_liquida_3m',
  'ebit_3m',
  'lucro_liquido_3m',
])

function normalizeMultipleDisplay(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || /x$/i.test(trimmed)) return trimmed
  const n = parsePtNumber(trimmed)
  return n == null ? trimmed : `${formatPtNumber(n)}x`
}

function normalizeFundamentalValueForKey(key: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed || isMissingFundamentalValue(trimmed)) return trimmed
  if (PERCENT_FIELD_KEYS.has(key)) return normalizePercentDisplay(trimmed)
  if (MULTIPLE_FIELD_KEYS.has(key)) return normalizeMultipleDisplay(trimmed)
  return trimmed
}

function hasSuspiciousUnitForField(field: FundamentalField): boolean {
  if (isMissingFundamentalValue(field.value)) return false
  if (PERCENT_FIELD_KEYS.has(field.key)) return !field.value.includes('%')
  if (MULTIPLE_FIELD_KEYS.has(field.key)) return !/x$/i.test(field.value.trim())
  if (field.key === 'ult_balanco' || field.key === 'data_ult_cot') {
    return !/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}\s+de\s+[a-zç]+/i.test(field.value)
  }
  if (MONEY_OR_QUANTITY_FIELD_KEYS.has(field.key)) {
    const n = parsePtNumber(field.value)
    return n != null && Math.abs(n) < 1000 && !/[mb]ilh/i.test(field.value)
  }
  return false
}

interface FundamentalLine {
  sourceName: string
  page: string
  lineNo: number
  text: string
  sourceRank: number
}

const FUNDAMENTAL_RAW_PATTERNS: Record<string, RegExp[]> = {
  empresa: [/\b(COPASA(?:\s+MG)?(?:\s+ON)?|Companhia\s+de\s+Saneamento[^\n|]*)/i],
  tipo: [/\b(ON|PN|UNT|PNA|PNB)\b/],
  receita_liquida_12m: [/receita\s+l[ií]quida/i],
  receita_liquida_3m: [/receita\s+l[ií]quida/i],
  ebit_12m: [/\bEBIT\b/i],
  ebit_3m: [/\bEBIT\b/i],
  lucro_liquido_12m: [/lucro\s+l[ií]quido/i],
  lucro_liquido_3m: [/lucro\s+l[ií]quido/i],
  ativo: [/ativo\s+total\b/i, /^ativo\b/i],
  disponibilidades: [/disponibilidades/i, /caixa\s+e\s+equivalentes/i],
  ativo_circulante: [/ativo\s+circulante/i],
  div_bruta: [/d[ií]vida\s+bruta/i],
  div_liquida: [/d[ií]vida\s+l[ií]quida/i],
  patrim_liq: [/patrim[oô]nio\s+l[ií]quido/i],
  nro_acoes: [/(?:n[úu]mero|nro\.?)\s+(?:de\s+)?a[cç][oõ]es/i, /a[cç][oõ]es\s+em\s+circula[cç][aã]o/i],
  marg_bruta: [/marg(?:em|\.)\s+bruta/i],
  marg_ebit: [/marg(?:em|\.)\s+EBIT/i],
  marg_liquida: [/marg(?:em|\.)\s+l[ií]quida/i],
  liquidez_corr: [/liquidez\s+corr/i],
}

function sourceRankFromText(fileName: string, text: string): number {
  const haystack = `${fileName}\n${text.slice(0, 20_000)}`
  let best = 0
  for (const match of haystack.matchAll(/\b([1-4])\s*T\s*(\d{2}|\d{4})\b/gi)) {
    const quarter = Number(match[1])
    const rawYear = String(match[2])
    const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)
    if (Number.isFinite(year) && Number.isFinite(quarter)) best = Math.max(best, year * 10 + quarter)
  }
  for (const match of haystack.matchAll(/\b(20\d{2})\b/g)) {
    const year = Number(match[1])
    if (Number.isFinite(year)) best = Math.max(best, year * 10 + 4)
  }
  return best
}

function splitFundamentalLines(): FundamentalLine[] {
  const out: FundamentalLine[] = []
  for (const source of readySources.value) {
    const text = structuredTextForPrompt(source.llmMarkdown || '', source.extractedText)
    const sourceRank = sourceRankFromText(source.fileName, text)
    let page = ''
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!.trim()
      const pageMatch = raw.match(/(?:P[ÁA]GINA|p[áa]g(?:ina)?\.?)\s*(\d+)/i)
      if (pageMatch) page = pageMatch[1]!
      const line = raw.replace(/\s+/g, ' ').trim()
      if (!line) continue
      out.push({ sourceName: source.fileName, page, lineNo: i + 1, text: line, sourceRank })
    }
  }
  return out.sort((a, b) => b.sourceRank - a.sourceRank || a.sourceName.localeCompare(b.sourceName) || a.lineNo - b.lineNo)
}

function numberTokens(line: string): string[] {
  return line.match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?%?|-?\d+(?:,\d+)?%?/g) ?? []
}

function bestNumberFromLine(line: string): string | null {
  const tokens = numberTokens(line).filter((token) => !/^20\d{2}$/.test(token))
  return tokens.at(-1) ?? null
}

function directFieldValue(key: string, line: string): string | null {
  if (key === 'empresa') {
    const m = line.match(FUNDAMENTAL_RAW_PATTERNS.empresa[0]!)
    return m?.[1]?.trim() ?? null
  }
  if (key === 'tipo') {
    const m = line.match(FUNDAMENTAL_RAW_PATTERNS.tipo[0]!)
    return m?.[1]?.toUpperCase() ?? null
  }
  const value = bestNumberFromLine(line)
  if (!value) return null
  return normalizeFundamentalValueForKey(key, value)
}

function buildFundamentalFieldsFromSources(): FundamentalField[] {
  const lines = splitFundamentalLines()
  const byKey = new Map(FUNDAMENTAL_FIELDS.map((field) => [field.key, { ...field, value: 'Informação não encontrada' } as FundamentalField]))
  const ticker = selectedNotebook.value?.ticker ?? extractTickerFromDocument(lines.map((line) => line.text).join('\n'), '')
  if (ticker) {
    const field = byKey.get('papel')
    if (field) {
      field.value = ticker
      field.source = selectedNotebook.value?.ticker ? 'Ticker do caderno' : 'Extraído das fontes'
      field.calculation = 'Identificado como ticker da ação.'
    }
  }

  for (const [key, patterns] of Object.entries(FUNDAMENTAL_RAW_PATTERNS)) {
    const field = byKey.get(key)
    if (!field || !isMissingFundamentalValue(field.value)) continue
    const match = lines.find((line) => patterns.some((pattern) => pattern.test(line.text)))
    if (!match) continue
    const value = directFieldValue(key, match.text)
    if (!value) continue
    field.value = value
    field.source = 'Extraído deterministicamente'
    field.source_file = match.sourceName
    field.source_page = match.page
    field.source_line = `linha ${match.lineNo}: ${match.text}`
    field.calculation = 'Extraído diretamente da linha mais recente encontrada nas fontes.'
  }

  return [...byKey.values()]
}

function mergeAiExtractedFundamentals(base: FundamentalField[], raw: unknown): FundamentalField[] {
  const obj = raw as {
    fields?: Array<{
      key?: unknown
      value?: unknown
      source?: unknown
      source_file?: unknown
      source_page?: unknown
      source_line?: unknown
    }>
  }
  if (!Array.isArray(obj.fields)) return base
  const byKey = new Map(base.map((field) => [field.key, field]))
  const knownKeys = new Set(FUNDAMENTAL_FIELDS.map((field) => field.key))
  for (const item of obj.fields) {
    const key = String(item.key ?? '')
    if (!knownKeys.has(key)) continue
    const value = typeof item.value === 'string' ? item.value.trim() : ''
    if (!value || isMissingFundamentalValue(value)) continue
    const current = byKey.get(key)
    if (!current) continue
    const currentMissing = isMissingFundamentalValue(current.value)
    const currentIsManual = !!current.manual
    if (currentIsManual) continue
    if (!currentMissing && current.source && current.source !== 'Extraído deterministicamente') continue
    current.value = normalizeFundamentalValueForKey(key, value)
    current.source = typeof item.source === 'string' && item.source.trim() ? item.source.trim() : 'Conferido pela IA'
    current.source_file =
      typeof item.source_file === 'string' && item.source_file.trim() ? item.source_file.trim() : current.source_file
    current.source_page =
      typeof item.source_page === 'string' && item.source_page.trim() ? item.source_page.trim() : current.source_page
    current.source_line =
      typeof item.source_line === 'string' && item.source_line.trim() ? item.source_line.trim() : current.source_line
    current.calculation = 'Extraído ou confirmado pela IA a partir de trecho explícito. Nenhum cálculo de indicador foi feito pela IA.'
  }
  return base
}

async function enhanceFundamentalFieldsWithAi(
  fields: FundamentalField[],
  snapshot: FundamentalSnapshot,
): Promise<FundamentalField[]> {
  const model = llmRuntime.chatModelName.trim()
  if (!model || !llmRuntime.effectiveServerBase) return fields
  const sources = [...readySources.value].sort((a, b) => {
    const ta = structuredTextForPrompt(a.llmMarkdown || '', a.extractedText)
    const tb = structuredTextForPrompt(b.llmMarkdown || '', b.extractedText)
    return sourceRankFromText(b.fileName, tb) - sourceRankFromText(a.fileName, ta)
  })
  const wanted = FUNDAMENTAL_FIELDS.map((field) => `${field.key}: ${field.label} (${field.section})`).join('\n')
  let merged = fields
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!
    updateFundamentalProgress(snapshot, 38 + (i / Math.max(1, sources.length)) * 35, `IA conferindo ${i + 1}/${sources.length}...`)
    const text = structuredTextForPrompt(source.llmMarkdown || '', source.extractedText).slice(0, 8_500)
    const prompt = [
      'Você é um extrator/auditor de fatos financeiros. NÃO faça cálculos.',
      'Extraia somente valores explicitamente presentes no texto. Se não estiver explícito, omita o campo.',
      'Prefira dados do período mais recente dentro deste arquivo.',
      'Responda somente JSON válido.',
      '',
      'Formato:',
      '{"fields":[{"key":"receita_liquida_12m","value":"1.234.567","source_file":"arquivo.pdf","source_page":"5","source_line":"trecho literal"}]}',
      '',
      'Campos possíveis:',
      wanted,
      '',
      `ARQUIVO: ${source.fileName}`,
      text,
    ].join('\n')
    try {
      const out = await chatCompletion({
        baseUrl: llmRuntime.effectiveServerBase,
        apiToken: llmRuntime.llmApiToken,
        model,
        temperature: 0,
        timeoutMs: 75_000,
        messages: [{ role: 'user', content: prompt }],
      })
      merged = mergeAiExtractedFundamentals(merged, extractJsonObject(out.text))
    } catch (e) {
      logger.warn('AI fundamental fact check skipped for one source', {
        fileName: source.fileName,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return merged
}

function applyCalculatedFundamentals(fields: FundamentalField[]): FundamentalField[] {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const get = (key: string) => parsePtNumber(byKey.get(key)?.value)
  const sourceFor = (...keys: string[]) =>
    keys
      .map((key) => byKey.get(key))
      .filter((field): field is FundamentalField => !!field && !isMissingFundamentalValue(field.value))
  const setCalc = (key: string, value: number | null, calculation: string, suffix = '') => {
    const field = byKey.get(key)
    if (!field || value == null) return
    const currentAmbiguousPercent =
      suffix === '%' && !isMissingFundamentalValue(field.value) && !field.value.includes('%') && parsePtNumber(field.value) != null
    if (!isMissingFundamentalValue(field.value) && !currentAmbiguousPercent) return
    const deps = sourceFor(...(calculation.match(/\{([a-z0-9_]+)\}/g) ?? []).map((x) => x.slice(1, -1)))
    field.value = formatPtNumber(value, suffix)
    field.calculated = true
    field.source = 'Calculado a partir dos dados extraídos'
    field.source_file = deps.map((dep) => dep.source_file).find(Boolean)
    field.source_page = deps.map((dep) => dep.source_page).filter(Boolean).join(', ')
    field.source_line = deps.map((dep) => dep.source_line).filter(Boolean).join(' | ')
    field.calculation = calculation.replace(/\{([a-z0-9_]+)\}/g, (_m, key: string) => `${byKey.get(key)?.label ?? key}: ${byKey.get(key)?.value ?? 'n/d'}`)
  }

  const receita12m = get('receita_liquida_12m')
  const ebit12m = get('ebit_12m')
  const lucro12m = get('lucro_liquido_12m')
  const ativo = get('ativo')
  const patrimonio = get('patrim_liq')
  const divLiquida = get('div_liquida')
  const valorMercado = get('valor_mercado')
  const valorFirma = get('valor_firma') ?? (valorMercado != null && divLiquida != null ? valorMercado + divLiquida : null)
  const nroAcoes = get('nro_acoes')
  const cotacao = get('cotacao')

  setCalc('valor_firma', valorMercado != null && divLiquida != null ? valorMercado + divLiquida : null, '{valor_mercado} + {div_liquida}')
  setCalc('lpa', lucro12m != null && nroAcoes ? lucro12m / nroAcoes : null, '{lucro_liquido_12m} / {nro_acoes}')
  setCalc('vpa', patrimonio != null && nroAcoes ? patrimonio / nroAcoes : null, '{patrim_liq} / {nro_acoes}')
  const lpa = get('lpa')
  const vpa = get('vpa')
  setCalc('pl', cotacao != null && lpa ? cotacao / lpa : valorMercado != null && lucro12m ? valorMercado / lucro12m : null, cotacao != null ? '{cotacao} / {lpa}' : '{valor_mercado} / {lucro_liquido_12m}')
  setCalc('pvp', cotacao != null && vpa ? cotacao / vpa : valorMercado != null && patrimonio ? valorMercado / patrimonio : null, cotacao != null ? '{cotacao} / {vpa}' : '{valor_mercado} / {patrim_liq}')
  setCalc('pebit', valorMercado != null && ebit12m ? valorMercado / ebit12m : null, '{valor_mercado} / {ebit_12m}')
  setCalc('psr', valorMercado != null && receita12m ? valorMercado / receita12m : null, '{valor_mercado} / {receita_liquida_12m}')
  setCalc('pativos', valorMercado != null && ativo ? valorMercado / ativo : null, '{valor_mercado} / {ativo}')
  setCalc('ev_ebit', valorFirma != null && ebit12m ? valorFirma / ebit12m : null, '{valor_firma} / {ebit_12m}')
  setCalc('ev_ebitda', valorFirma != null && ebit12m ? valorFirma / ebit12m : null, '{valor_firma} / EBITDA; usando EBIT como aproximação apenas se EBITDA não estiver disponível')
  setCalc('marg_ebit', ebit12m != null && receita12m ? (ebit12m / receita12m) * 100 : null, '{ebit_12m} / {receita_liquida_12m}', '%')
  setCalc('marg_liquida', lucro12m != null && receita12m ? (lucro12m / receita12m) * 100 : null, '{lucro_liquido_12m} / {receita_liquida_12m}', '%')
  setCalc('ebit_ativo', ebit12m != null && ativo ? (ebit12m / ativo) * 100 : null, '{ebit_12m} / {ativo}', '%')
  setCalc('roe', lucro12m != null && patrimonio ? (lucro12m / patrimonio) * 100 : null, '{lucro_liquido_12m} / {patrim_liq}', '%')
  setCalc('div_liq_patrim', divLiquida != null && patrimonio ? divLiquida / patrimonio : null, '{div_liquida} / {patrim_liq}')
  setCalc('giro_ativos', receita12m != null && ativo ? receita12m / ativo : null, '{receita_liquida_12m} / {ativo}')
  setCalc('roic', ebit12m != null && patrimonio != null && divLiquida != null ? (ebit12m / (patrimonio + divLiquida)) * 100 : null, '{ebit_12m} / ({patrim_liq} + {div_liquida})', '%')

  for (const field of fields) {
    field.value = normalizeFundamentalValueForKey(field.key, field.value)
    if (hasSuspiciousUnitForField(field)) {
      field.calculation = [
        field.calculation,
        'Aviso: unidade/formato potencialmente ambíguo. Confira no trecho de origem antes de usar em análise.',
      ].filter(Boolean).join('\n')
    }
  }
  return fields
}

async function generateFundamentalSnapshot() {
  const notebookId = notebook.activeNotebookId
  if (!notebookId) return
  const running = generatingFundamentalSnapshot.value
  if (running) {
    activeFundamentalSnapshotId.value = running.id
    activeStudioReportId.value = null
    store.select(null)
    return
  }

  const id = crypto.randomUUID()
  const snapshot: FundamentalSnapshot = {
    id,
    notebookId,
    ticker: selectedNotebook.value?.ticker ?? null,
    title: 'Snapshot Fundamentalista',
    status: 'generating',
    fields: [],
    error: null,
    progressPercent: 1,
    etaLabel: 'Estimando tempo...',
    createdAt: new Date().toISOString(),
  }
  fundamentalStore.upsertLocal(snapshot)
  activeFundamentalSnapshotId.value = id
  activeStudioReportId.value = null
  store.select(null)
  persistFundamentalSafely(snapshot)

  try {
    updateFundamentalProgress(snapshot, 2, 'Estimando tempo...')
    if (!readySources.value.length) throw new Error('Adicione pelo menos uma fonte pronta neste caderno.')
    updateFundamentalProgress(snapshot, 12, 'Lendo todos os arquivos...')
    await nextTick()
    updateFundamentalProgress(snapshot, 35, 'Procurando linhas financeiras...')
    let fields = buildFundamentalFieldsFromSources()
    updateFundamentalProgress(snapshot, 38, 'IA conferindo dados extraídos...')
    fields = await enhanceFundamentalFieldsWithAi(fields, snapshot)
    updateFundamentalProgress(snapshot, 82, 'Calculando indicadores deterministicamente...')
    snapshot.fields = applyCalculatedFundamentals(fields)
    updateFundamentalProgress(snapshot, 98, 'Salvando dados...')
    const ticker = snapshot.fields.find((field) => field.key === 'papel')?.value
    snapshot.ticker = ticker && !/informação/i.test(ticker) ? ticker : selectedNotebook.value?.ticker ?? null
    snapshot.status = 'ready'
    updateFundamentalProgress(snapshot, 100, 'Concluído')
    persistFundamentalSafely(snapshot)
  } catch (e) {
    snapshot.status = 'error'
    snapshot.error = e instanceof Error ? e.message : String(e)
    updateFundamentalProgress(snapshot, 100, 'Interrompido')
    persistFundamentalSafely(snapshot)
  }
}

async function preflightChatModel(report: StudioReport, model: string): Promise<void> {
  updateReportProgress(
    report,
    6,
    'Testando conexão do modelo...',
    'Verificando se o endpoint de chat responde antes de indexar e gerar o relatório.',
    20,
  )
  try {
    const out = await chatCompletion({
      baseUrl: llmRuntime.effectiveServerBase,
      apiToken: llmRuntime.llmApiToken,
      model,
      temperature: 0,
      timeoutMs: 15_000,
      messages: [{ role: 'user', content: 'Responda apenas: OK' }],
    })
    if (!out.text.trim()) throw new Error('O modelo respondeu vazio ao teste de conexão.')
    logger.info('Chat model preflight succeeded', { model, responseLength: out.text.length })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    logger.error('Chat model preflight failed', { model, error: detail })
    throw new Error(
      `O modelo está marcado como conectado, mas o chat não respondeu em até 15s.\n\n${detail}\n\n` +
        'Ação sugerida: confirme se o servidor OpenAI-compatible aceita /v1/chat/completions, se o modelo terminou de carregar e se a URL/token nos Ajustes estão corretos.',
    )
  }
}

async function collectRiskEvidence(notebookId: string, report: StudioReport): Promise<string> {
  logger.info('Starting risk evidence collection', { notebookId })
  updateReportProgress(
    report,
    8,
    'Preparando índice semântico...',
    'Criando/validando chunks por página e seção no Vectra. Na primeira vez isso pode levar alguns segundos; se demorar, uso as fontes carregadas como fallback.',
    45,
  )

  try {
    logger.info('Ensuring vector chunks for notebook', { notebookId })
    const indexed = await withTimeout(
      vectorGarantirChunksDoNotebook(notebookId),
      18_000,
      'Indexação semântica ainda em andamento; usando fallback local para não travar a geração.',
    )
    if (indexed) {
      logger.info('Vector chunks indexed successfully', { notebookId, documentsIndexed: indexed.documentsIndexed, chunksIndexed: indexed.chunksIndexed })
      updateReportProgress(
        report,
        25,
        'Índice semântico pronto',
        `Documentos indexados agora: ${indexed.documentsIndexed}; chunks novos: ${indexed.chunksIndexed}.`,
        35,
      )
    }
  } catch (e) {
    logger.error('Vector chunk indexing failed, using fallback', { notebookId, error: e instanceof Error ? e.message : String(e) })
    updateReportProgress(
      report,
      28,
      'Usando fallback local...',
      `${e instanceof Error ? e.message : String(e)}\n\nContinuando com evidências das fontes carregadas no caderno.`,
      30,
    )
    return localRiskEvidenceFromReadySources()
  }

  const seen = new Set<string>()
  const blocks: string[] = []
  const queries = riskQueries()
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]!
    logger.debug('Searching vector database for evidence', { query, notebookId, index: i + 1, total: queries.length })
    updateReportProgress(
      report,
      28 + ((i + 1) / queries.length) * 32,
      `Buscando evidências ${i + 1}/${queries.length}...`,
      `Consulta semântica: ${query}`,
      Math.max(12, Math.round((queries.length - i) * 4 + 18)),
    )
    const rows = await vectorBuscarChunksDoNotebook(query, notebookId, 8)
    logger.debug('Vector search results', { query, resultsCount: rows.length })
    for (const row of rows) {
      const key = String(row.metadata.chunkId ?? row.id)
      if (seen.has(key)) continue
      seen.add(key)
      const text = typeof row.metadata.chunkText === 'string' ? row.metadata.chunkText : ''
      if (!text.trim()) continue
      blocks.push(`[${chunkReference(row)} | score ${row.score.toFixed(3)}]\n${text.slice(0, 2200)}`)
    }
  }
  const evidence = blocks.slice(0, 28).join('\n\n---\n\n')
  updateReportProgress(report, 62, 'Evidências reunidas', `${blocks.length} trecho(s) relevantes selecionados.`, 25)
  return evidence.trim() || localRiskEvidenceFromReadySources()
}

function fallbackRiskSection(sectionTitle: string, evidence: string, error: unknown): string {
  const sample = evidence
    .split(/\n\n---\n\n/)
    .slice(0, 4)
    .map((block) => block.slice(0, 900))
    .join('\n\n')
  const detail = error instanceof Error ? error.message : String(error)
  return [
    `## ${sectionTitle}`,
    '',
    '**Status:** seção gerada em modo resiliente porque a chamada ao LLM falhou.',
    '',
    '**Severidade:** Informação não detalhada nas fontes.',
    '',
    '**Evidências disponíveis para revisão:**',
    sample || 'Informação não detalhada nas fontes.',
    '',
    `**Falha da chamada:** ${detail}`,
  ].join('\n')
}

async function generateRiskSectionWithRetries(input: {
  sectionTitle: string
  instruction: string
  evidence: string
  companyHint: string
  model: string
  report: StudioReport
  index: number
  total: number
  onPartialText?: (text: string) => void
}): Promise<string> {
  const maxAttempts = 3
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info('Generating risk section with LLM', { sectionTitle: input.sectionTitle, attempt, maxAttempts, model: input.model })
    updateReportProgress(
      input.report,
      68 + (input.index / input.total) * 27,
      `Gerando seção ${input.index + 1}/${input.total}: ${input.sectionTitle}`,
      `${input.report.body}\n\nTentativa ${attempt}/${maxAttempts} para "${input.sectionTitle}".`,
      Math.max(8, Math.round((input.total - input.index) * 18)),
    )
    try {
      const sectionEvidence = selectEvidenceForSection({
        evidence: input.evidence,
        sectionTitle: input.sectionTitle,
        instruction: input.instruction,
      })
      const prompt = [
        'Aja como um Analista de Investimentos Sênior especialista no setor de Saneamento Básico / Utilities reguladas.',
        'Você está gerando UMA seção de um Relatório de Riscos. Use estritamente as evidências fornecidas.',
        'Não invente dados. Se uma informação não estiver nas evidências, escreva "Informação não detalhada nas fontes".',
        input.companyHint,
        '',
        `SEÇÃO: ${input.sectionTitle}`,
        `TAREFA: ${input.instruction}`,
        '',
        'Formato obrigatório:',
        `## ${input.sectionTitle}`,
        '- Severidade: baixa/média/alta ou "Informação não detalhada nas fontes"',
        '- Evidências: cite números ou frases e a Fonte/página',
        '- Interpretação: explique o risco para investidor',
        '- Pontos de acompanhamento: bullets objetivos',
        '',
        `EVIDÊNCIAS SELECIONADAS (${estimatePromptTokens(sectionEvidence)} tokens estimados):`,
        sectionEvidence,
      ].filter(Boolean).join('\n')
      logger.debug('Sending chat completion request', {
        baseUrl: llmRuntime.effectiveServerBase,
        model: input.model,
        promptLength: prompt.length,
        promptTokensEstimate: estimatePromptTokens(prompt),
        originalEvidenceLength: input.evidence.length,
        sectionEvidenceLength: sectionEvidence.length,
      })
      let lastPartialAt = 0
      const out = await chatCompletion({
        baseUrl: llmRuntime.effectiveServerBase,
        apiToken: llmRuntime.llmApiToken,
        model: input.model,
        temperature: 0.1,
        timeoutMs: 240_000,
        onTextDelta: (_delta, text) => {
          const now = Date.now()
          if (now - lastPartialAt < 250) return
          lastPartialAt = now
          input.onPartialText?.(text)
        },
        messages: [{ role: 'user', content: prompt }],
      })
      logger.info('Chat completion successful', { sectionTitle: input.sectionTitle, responseLength: out.text.length })
      const text = out.text.trim()
      if (text) return text
      throw new Error('O modelo retornou vazio.')
    } catch (e) {
      logger.error('Chat completion failed', { sectionTitle: input.sectionTitle, attempt, error: e instanceof Error ? e.message : String(e) })
      lastError = e
      if (attempt < maxAttempts) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 1500))
      }
    }
  }
  logger.warn('All chat completion attempts failed, using fallback', { sectionTitle: input.sectionTitle })
  const fallbackEvidence = selectEvidenceForSection({
    evidence: input.evidence,
    sectionTitle: input.sectionTitle,
    instruction: input.instruction,
    maxChars: 7_000,
    maxBlockChars: 900,
  })
  return fallbackRiskSection(input.sectionTitle, fallbackEvidence || input.evidence, lastError)
}

async function generateRiskReport() {
  const notebookId = notebook.activeNotebookId
  if (!notebookId) return
  const running = generatingRiskReport.value
  if (running) {
    const ageMs = Date.now() - new Date(running.createdAt).getTime()
    if (Number.isFinite(ageMs) && ageMs > STALE_GENERATING_REPORT_MS) {
      running.status = 'error'
      running.progressPercent = 100
      running.etaLabel = 'Interrompido'
      running.subtitle = 'Geração anterior travou'
      running.body =
        'A geração anterior ficou sem progresso por tempo demais e foi encerrada automaticamente. Iniciei uma nova tentativa.'
      persistReportSafely(running)
    } else {
      activeStudioReportId.value = running.id
      activeFundamentalSnapshotId.value = null
      store.select(null)
      return
    }
  }
  const id = crypto.randomUUID()
  const report: StudioReport = {
    id,
    notebookId,
    type: 'risk',
    title: 'Relatório de Riscos',
    subtitle: 'Gerando evidências...',
    status: 'generating',
    body: 'Buscando evidências por página/seção nas fontes do caderno...',
    createdAt: new Date().toISOString(),
    progressPercent: 3,
    etaLabel: '~60s restantes',
  }
  reportStore.upsertLocal(report)
  activeStudioReportId.value = id
  activeFundamentalSnapshotId.value = null
  store.select(null)
  persistReportSafely(report)

  try {
    if (!readySources.value.length) throw new Error('Adicione pelo menos uma fonte pronta neste caderno.')
    const model = llmRuntime.chatModelName.trim()
    if (!model || !llmRuntime.effectiveServerBase) {
      throw new Error('Conecte um modelo LLM antes de gerar o relatório.')
    }
    await preflightChatModel(report, model)
    const evidence = await collectRiskEvidence(notebookId, report)
    if (!evidence.trim()) throw new Error('Não encontrei chunks indexados suficientes para gerar o relatório.')

    updateReportProgress(report, 68, 'Analisando riscos no LLM...', 'Enviando evidências para o modelo conectado por seção.', 90)
    const companyHint = selectedNotebook.value?.ticker ? `Ticker do caderno: ${selectedNotebook.value.ticker}` : ''
    const header = [
      '# Relatório de Riscos',
      '',
      `Fontes analisadas: ${readySources.value.length}`,
      companyHint || null,
      '',
      '> Gerado em modo resiliente: cada seção é enviada separadamente ao LLM; falhas de conexão geram seção fallback com evidências recuperadas.',
    ].filter(Boolean).join('\n')
    const sections: string[] = []
    report.body = header
    for (let i = 0; i < RISK_REPORT_SECTIONS.length; i++) {
      const section = RISK_REPORT_SECTIONS[i]!
      const text = await generateRiskSectionWithRetries({
        sectionTitle: section.title,
        instruction: section.instruction,
        evidence,
        companyHint,
        model,
        report,
        index: i,
        total: RISK_REPORT_SECTIONS.length,
        onPartialText: (partial) => {
          report.body = [header, ...sections, partial.trim()].filter(Boolean).join('\n\n---\n\n')
        },
      })
      sections.push(text)
      report.body = [header, ...sections].join('\n\n---\n\n')
    }
    report.status = 'ready'
    updateReportProgress(report, 100, `${readySources.value.length} fonte(s) analisada(s)`, report.body, 0)
    persistReportSafely(report)
  } catch (e) {
    report.status = 'error'
    report.progressPercent = 100
    report.etaLabel = 'Interrompido'
    report.subtitle = 'Falha ao gerar'
    report.body = e instanceof Error ? e.message : String(e)
    persistReportSafely(report)
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[#edf1f7] text-slate-950">
    <header class="flex h-16 shrink-0 items-center gap-4 px-4">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <OpenYieldLogo size="xl" />
          </div>
          <p class="truncate text-xs text-slate-500">
            {{ selectedNotebook ? notebookDisplayTitle(selectedNotebook) : 'Caderno' }}
          </p>
        </div>
      </div>

      <div class="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
        <div
          v-for="n in notebook.notebooks"
          :key="n.id"
          class="flex max-w-[12rem] shrink-0 items-stretch overflow-hidden rounded-full border text-xs font-medium transition"
          :class="
            notebook.activeNotebookId === n.id
              ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
          "
        >
          <button
            type="button"
            class="min-w-0 flex-1 truncate px-3 py-2 text-left"
            :title="notebookDisplayTitle(n)"
            @click="notebook.setActiveNotebook(n.id)"
            @dblclick.prevent="openRenameDialog(n.id)"
          >
            {{ n.title }}
          </button>
          <button
            type="button"
            class="w-7 shrink-0 border-l border-white/15 text-current opacity-60 transition hover:bg-white/10 hover:opacity-100"
            title="Fechar caderno"
            @click="onCloseNotebookTab(n.id)"
          >
            ×
          </button>
        </div>
        <button
          type="button"
          class="h-9 rounded-full border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700"
          title="Novo caderno"
          @click="notebook.addNotebook()"
        >
          +
        </button>
      </div>

      <div class="flex min-w-0 shrink-0 items-center gap-2">
        <LlmRuntimeBar />
      </div>
    </header>

    <main class="grid min-h-0 flex-1 gap-3 px-4 pb-2 xl:grid-cols-[320px_minmax(0,1fr)_360px] lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div>
            <h2 class="text-sm font-semibold text-slate-950">Fontes</h2>
            <p class="text-[11px] text-slate-500">{{ readySources.length }} prontas · {{ pendingSources.length }} em extração</p>
          </div>
          <button
            type="button"
            class="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            @click="addAnother"
          >
            + PDF
          </button>
        </div>

        <div class="border-b border-slate-200 p-3">
          <PdfDropArea ref="dropRef" compact @files="onFiles" />
        </div>

        <ul v-if="visibleSources.length" class="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto p-3">
          <li v-for="s in visibleSources" :key="s.id">
            <div class="group flex min-w-0 items-start gap-1">
              <button
                type="button"
                class="flex min-w-0 flex-1 overflow-hidden rounded-xl border px-3 py-3 text-left text-sm transition"
                :class="
                  store.selectedId === s.id
                    ? 'border-indigo-300 bg-indigo-50 text-slate-950 shadow-sm'
                    : 'border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white hover:shadow-sm'
                "
                :data-cy="`source-item-${s.id}`"
                @click="activeStudioReportId = null; activeFundamentalSnapshotId = null; store.select(s.id)"
              >
                <div class="flex min-w-0 flex-1 gap-2">
                  <ProgressSpinner
                    v-if="s.status === 'pending'"
                    class="h-5 w-5 shrink-0"
                    stroke-width="4"
                    style="width: 1.25rem; height: 1.25rem"
                  />
                  <span
                    v-else
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-[10px] font-black text-rose-700"
                    aria-hidden="true"
                  >
                    PDF
                  </span>
                  <div class="min-w-0 flex-1">
                    <span class="block truncate font-medium leading-5" :title="s.fileName">{{ s.fileName }}</span>
                    <div v-if="s.status === 'pending' && s.extractionProgress" class="mt-2 w-full">
                      <ProgressBar
                        :value="s.extractionProgress.percent"
                        :show-value="true"
                        class="!h-1.5 !text-[10px] !leading-none"
                      />
                      <span class="mt-1 block truncate text-[10px] text-slate-500">
                        {{ s.extractionProgress.percent }}% · {{ s.extractionProgress.label }}
                      </span>
                    </div>
                    <p v-else class="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {{ sourcePreviewText(s) || 'Fonte indexada no caderno.' }}
                    </p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                aria-label="Remover fonte"
                @click.stop="store.remove(s.id)"
              >
                ×
              </button>
            </div>
          </li>
        </ul>
        <div v-else class="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">
          Adicione releases, ITRs, DFPs ou apresentações para montar o caderno.
        </div>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div>
            <div class="flex items-center gap-2">
              <h2 v-if="activeStudioReport || activeFundamentalSnapshot || store.selected" class="text-sm font-semibold text-slate-950">
                {{ activeStudioReport ? activeStudioReport.title : activeFundamentalSnapshot ? activeFundamentalSnapshot.title : 'Documento' }}
              </h2>
              <OpenYieldLogo v-else size="sm" />
              <span
                v-if="!activeStudioReport && !activeFundamentalSnapshot && !store.selected"
                tabindex="0"
                class="group relative flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-500"
                aria-label="OpenYield é um harness de finanças e mercado de capitais."
              >
                ?
                <span
                  class="pointer-events-none absolute left-0 top-6 z-30 hidden w-80 whitespace-normal rounded-lg border border-slate-200 bg-slate-950 p-3 text-left text-[11px] font-normal leading-relaxed text-white shadow-xl group-hover:block group-focus:block"
                >
                  OpenYield é um harness de finanças e mercado de capitais. Ele usa PDFs do notebook, snapshots fundamentalistas, relatórios, índice vetorial e LLM local para responder perguntas, comparar períodos, explicar cálculos, pedir fontes faltantes, gerar relatórios e auditar respostas com scoring.
                </span>
              </span>
            </div>
            <p class="text-[11px] text-slate-500">
              {{ activeStudioReport?.subtitle ?? (activeFundamentalSnapshot ? `${activeFundamentalSnapshot.ticker ?? selectedNotebook?.ticker ?? 'Ticker'} · ${activeFundamentalSnapshot.status}` : store.selected?.fileName ?? `${readySources.length} fonte(s) neste caderno`) }}
            </p>
          </div>
          <button
            v-if="activeStudioReport || activeFundamentalSnapshot"
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg leading-none text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
            title="Fechar e voltar para OpenYield"
            aria-label="Fechar visualização"
            @click="activeStudioReportId = null; activeFundamentalSnapshotId = null; store.select(null)"
          >
            ×
          </button>
          <div v-else-if="store.selected?.status === 'ready'" class="flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              class="rounded-full px-3 py-1 transition"
              :class="panelTab === 'llm' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="panelTab = 'llm'"
            >
              Leitura
            </button>
            <button
              type="button"
              class="rounded-full px-3 py-1 transition"
              :class="panelTab === 'raw' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="panelTab = 'raw'"
            >
              Texto
            </button>
          </div>
        </div>

        <template v-if="activeStudioReport">
          <ScrollPanel class="min-h-0 flex-1 overflow-auto bg-[#fbfcff]">
            <article class="mx-auto flex w-full max-w-5xl flex-col px-5 py-6">
              <div
                class="rounded-2xl border p-5 shadow-sm"
                :class="
                  activeStudioReport.status === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-white text-slate-800'
                "
              >
                <div class="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Relatório OpenYield</p>
                    <h3 class="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                      {{ activeStudioReport.title }}
                    </h3>
                    <p class="mt-1 text-xs text-slate-500">{{ activeStudioReport.subtitle }}</p>
                    <p v-if="activeStudioReport.status === 'generating'" class="mt-1 text-[11px] text-slate-400">
                      {{ activeStudioReport.etaLabel }}
                    </p>
                  </div>
                  <ProgressSpinner
                    v-if="activeStudioReport.status === 'generating'"
                    class="h-8 w-8 shrink-0"
                    stroke-width="4"
                    style="width: 2rem; height: 2rem"
                  />
                </div>
                <div v-if="activeStudioReport.status === 'generating'" class="mb-4">
                  <ProgressBar :value="activeStudioReport.progressPercent" :show-value="true" class="!h-2" />
                </div>
                <div
                  class="report-markdown-body"
                  :class="activeStudioReport.status === 'error' ? 'report-markdown-body--error' : ''"
                  v-html="activeStudioReportHtml"
                />
              </div>
            </article>
          </ScrollPanel>
        </template>

        <template v-else-if="activeFundamentalSnapshot">
          <ScrollPanel class="min-h-0 flex-1 overflow-auto bg-[#fbfcff]">
            <article class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-6">
              <header class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700">Dados estruturados</p>
                    <h3 class="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                      {{ activeFundamentalSnapshot.ticker ?? selectedNotebook?.ticker ?? 'Fundamentos' }}
                    </h3>
                    <p class="mt-1 text-sm text-slate-500">
                      Campos extraídos das fontes e persistidos para análises futuras.
                    </p>
                  </div>
                  <div class="rounded-xl border px-3 py-2 text-xs font-semibold"
                    :class="
                      activeFundamentalSnapshot.status === 'ready'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : activeFundamentalSnapshot.status === 'error'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                    "
                  >
                    {{ activeFundamentalSnapshot.status === 'ready' ? 'Extraído' : activeFundamentalSnapshot.status === 'error' ? 'Falhou' : 'Extraindo...' }}
                  </div>
                </div>
                <p v-if="activeFundamentalSnapshot.error" class="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  {{ activeFundamentalSnapshot.error }}
                </p>
                <div v-if="activeFundamentalSnapshot.status === 'generating'" class="mt-4">
                  <div class="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{{ activeFundamentalSnapshot.progressPercent }}%</span>
                    <span>{{ activeFundamentalSnapshot.etaLabel }}</span>
                  </div>
                  <ProgressBar :value="activeFundamentalSnapshot.progressPercent" :show-value="false" class="!h-2" />
                </div>
              </header>

              <div class="grid gap-4 lg:grid-cols-2">
                <section
                  v-for="section in fundamentalSections(activeFundamentalSnapshot)"
                  :key="section.title"
                  class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  :class="section.title === 'Indicadores fundamentalistas' || section.title.includes('Dados') ? 'lg:col-span-2' : ''"
                >
                  <h4 class="border-b border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950">
                    {{ section.title }}
                  </h4>
                  <div class="grid sm:grid-cols-2">
                    <div
                      v-for="field in section.fields"
                      :key="field.key"
                      class="grid grid-cols-[minmax(7rem,0.9fr)_minmax(0,1.1fr)] border-b border-r border-slate-100 last:border-b-0"
                    >
                      <div class="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{{ field.label }}</div>
                      <div class="min-w-0 px-3 py-2">
                        <div class="flex items-center gap-2">
                          <input
                            :value="isMissingFundamentalValue(field.value) ? '' : field.value"
                            type="text"
                            class="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm font-semibold outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                            :class="
                              field.manual
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : isMissingFundamentalValue(field.value)
                                  ? 'border-dashed border-slate-300 bg-white text-slate-700'
                                  : 'border-transparent bg-transparent text-slate-900'
                            "
                            :placeholder="isMissingFundamentalValue(field.value) ? 'Adicionar valor' : ''"
                            @input="onFundamentalFieldInput(activeFundamentalSnapshot, field, ($event.target as HTMLInputElement).value)"
                          />
                          <span
                            v-if="hasFundamentalEvidence(field)"
                            tabindex="0"
                            class="group relative flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-500 shadow-sm"
                            :aria-label="fundamentalEvidenceTooltip(field)"
                          >
                            ?
                            <span
                              class="pointer-events-none absolute right-0 top-6 z-20 hidden w-80 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-950 p-3 text-left text-[11px] font-normal leading-relaxed text-white shadow-xl group-hover:block group-focus:block"
                            >
                              {{ fundamentalEvidenceTooltip(field) }}
                            </span>
                          </span>
                        </div>
                        <span class="mt-0.5 block truncate text-[10px] font-normal"
                          :class="field.manual ? 'text-emerald-600' : 'text-slate-400'"
                        >
                          {{ field.manual ? 'Editado manualmente' : field.calculated ? 'Calculado com dados extraídos' : field.source || (isMissingFundamentalValue(field.value) ? 'Não encontrado nas fontes' : 'Extraído das fontes') }}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </article>
          </ScrollPanel>
        </template>

        <template v-else-if="!store.selected">
          <div ref="chatScrollEl" class="min-h-0 flex-1 overflow-y-auto bg-[#fbfcff]">
            <div class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5 py-6">
              <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-indigo-600">Caderno ativo</p>
                    <h3 class="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                      {{ selectedNotebook?.title ?? 'Caderno' }}
                    </h3>
                  </div>
                  <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {{ readySources.length }} fonte(s)
                  </span>
                </div>
                <p class="max-w-3xl text-sm leading-6 text-slate-600">
                  {{ selectedPreviewText || 'Selecione uma fonte para ler o conteúdo extraído, ou faça uma pergunta geral sobre o caderno.' }}
                </p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button
                    v-for="q in starterQuestions"
                    :key="q"
                    type="button"
                    class="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
                    @click="useStarterQuestion(q)"
                  >
                    {{ q }}
                  </button>
                </div>
              </div>

              <div v-if="chatMessages.length" class="space-y-3">
                <div
                  v-for="m in chatMessages"
                  :key="m.id"
                  class="max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm"
                  :class="
                    m.role === 'user'
                      ? 'ml-auto bg-slate-950 text-white'
                      : 'mr-auto border border-slate-200 bg-white text-slate-700'
                  "
                >
                  <template v-if="m.role === 'user'">
                    {{ m.text }}
                  </template>
                  <template v-else>
                    <div v-if="m.steps?.length" class="mb-3 space-y-1 border-b border-slate-100 pb-3">
                      <div
                        v-for="step in m.steps"
                        :key="step.label"
                        class="flex items-start gap-2 text-xs"
                        :class="
                          step.status === 'error'
                            ? 'text-rose-600'
                            : step.status === 'warn'
                              ? 'text-amber-600'
                              : step.status === 'running'
                                ? 'text-indigo-600'
                                : 'text-slate-500'
                        "
                      >
                        <span
                          class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                          :class="step.status === 'running' ? 'animate-pulse bg-indigo-500' : 'bg-current'"
                        />
                        <span>
                          <span class="font-semibold">{{ step.label }}</span>
                          <span v-if="step.detail"> · {{ step.detail }}</span>
                        </span>
                      </div>
                    </div>
                    <details
                      v-if="m.thinkingText"
                      class="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2"
                      :open="m.status === 'thinking' || m.status === 'streaming'"
                    >
                      <summary class="cursor-pointer text-xs font-semibold text-indigo-700">
                        {{ m.status === 'done' ? 'Raciocínio do modelo' : 'A pensar…' }}
                      </summary>
                      <pre class="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-indigo-900/80">{{ m.thinkingText }}</pre>
                    </details>
                    <div
                      v-if="m.text"
                      class="report-markdown-body"
                      v-html="markdownToSanitizedHtml(m.text)"
                    />
                    <p v-else-if="m.status === 'thinking' || m.status === 'streaming'" class="text-sm text-slate-500">
                      {{ m.thinkingText ? 'A redigir resposta…' : 'Pensando…' }}
                    </p>
                    <p v-if="m.score != null" class="mt-3 text-[11px] font-semibold text-slate-400">
                      Score da resposta: {{ Math.round(m.score * 100) }}%
                    </p>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <form class="shrink-0 border-t border-slate-200 bg-white p-4" @submit.prevent="submitChat">
            <div class="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
              <input
                v-model="chatDraft"
                type="text"
                :disabled="chatRunning"
                class="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                :placeholder="chatRunning ? 'Processando com RAG e scoring...' : 'Pergunte sobre resultados, riscos, guidance, dividendos...'"
              />
              <span class="hidden text-xs text-slate-400 sm:inline">{{ readySources.length }} fonte(s)</span>
              <button
                type="submit"
                :disabled="chatRunning"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-indigo-700"
                :class="chatRunning ? 'cursor-progress opacity-60' : ''"
                aria-label="Enviar pergunta"
              >
                {{ chatRunning ? '…' : '→' }}
              </button>
            </div>
          </form>
        </template>

        <ScrollPanel v-else class="min-h-0 flex-1 overflow-auto bg-[#fbfcff]">
          <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-4">
            <div v-if="store.selected.status === 'ready'" class="min-h-[calc(100vh-9rem)] rounded-2xl bg-white">
              <pre
                v-show="panelTab === 'raw'"
                data-cy="source-text-panel"
                class="max-h-[calc(100vh-11rem)] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-700"
                >{{ selectedPromptText }}</pre
              >
              <LlmMarkdownPreview
                v-show="panelTab === 'llm'"
                :markdown="store.selected.llmMarkdown"
                :file="store.selected.file"
              />
            </div>

            <div
              v-else-if="store.selected.status === 'error'"
              class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800"
              data-cy="source-error-panel"
            >
              {{ store.selected.error }}
            </div>

            <div
              v-else-if="store.selected.status === 'pending'"
              class="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <ProgressBar :value="store.selected.extractionProgress?.percent ?? 0" :show-value="true" class="!h-5" />
              <p class="mt-3 text-center text-sm text-slate-500" data-cy="extraction-detail">
                {{
                  store.selected.extractionProgress?.detail ??
                  store.selected.extractionProgress?.label ??
                  'A iniciar extração...'
                }}
              </p>
            </div>
          </div>
        </ScrollPanel>

      </section>

      <aside class="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:flex">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div>
            <h2 class="text-sm font-semibold text-slate-950">Estúdio</h2>
            <p class="text-[11px] text-slate-500">Ferramentas OpenYield</p>
          </div>
          <button
            type="button"
            class="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Novo
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3 border-b border-slate-200 p-4">
          <button type="button" class="rounded-xl bg-indigo-50 p-3 text-left transition hover:bg-indigo-100">
            <span class="block text-xs font-semibold text-indigo-700">Resumo executivo</span>
            <span class="mt-1 block text-[11px] text-indigo-500">Release + números</span>
          </button>
          <button
            type="button"
            class="rounded-xl bg-emerald-50 p-3 text-left transition hover:bg-emerald-100"
            :class="generatingFundamentalSnapshot ? 'cursor-progress ring-1 ring-emerald-200' : ''"
            :title="generatingFundamentalSnapshot ? 'Snapshot em extração; clique para abrir.' : 'Extrair tabela fundamentalista'"
            @click="generateFundamentalSnapshot"
          >
            <span class="block text-xs font-semibold text-emerald-700">Fundamentos</span>
            <span class="mt-1 block text-[11px] text-emerald-500">
              {{ generatingFundamentalSnapshot ? 'Extraindo...' : 'Tabela estruturada' }}
            </span>
          </button>
          <button
            type="button"
            class="rounded-xl bg-amber-50 p-3 text-left transition hover:bg-amber-100"
            :class="generatingRiskReport ? 'cursor-progress ring-1 ring-amber-200' : ''"
            :title="generatingRiskReport ? 'Relatório de riscos em geração; clique para abrir.' : 'Gerar relatório de riscos'"
            @click="generateRiskReport"
          >
            <span class="block text-xs font-semibold text-amber-700">Riscos</span>
            <span class="mt-1 block text-[11px] text-amber-500">
              {{ generatingRiskReport ? 'Gerando...' : 'Pontos críticos' }}
            </span>
          </button>
          <button type="button" class="rounded-xl bg-rose-50 p-3 text-left transition hover:bg-rose-100">
            <span class="block text-xs font-semibold text-rose-700">Relatório</span>
            <span class="mt-1 block text-[11px] text-rose-500">PDF final</span>
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div class="mb-5">
            <div class="mb-3 flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Dados</p>
              <span class="text-[11px] text-slate-400">{{ fundamentalSnapshots.length }}</span>
            </div>
            <div v-if="fundamentalSnapshots.length" class="space-y-2">
              <button
                v-for="snapshot in fundamentalSnapshots"
                :key="snapshot.id"
                type="button"
                class="flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition"
                :class="
                  activeFundamentalSnapshotId === snapshot.id
                    ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm'
                "
                @click="activeFundamentalSnapshotId = snapshot.id; activeStudioReportId = null; store.select(null)"
              >
                <span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  :class="
                    snapshot.status === 'ready'
                      ? 'bg-emerald-500'
                      : snapshot.status === 'error'
                        ? 'bg-rose-500'
                        : 'animate-pulse bg-amber-500'
                  "
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-slate-950">{{ snapshot.title }}</span>
                  <span class="mt-0.5 block truncate text-xs text-slate-500">
                    {{ snapshot.ticker ?? selectedNotebook?.ticker ?? 'Sem ticker' }} · {{ snapshot.fields.length }} campo(s)
                  </span>
                  <span v-if="snapshot.status === 'generating'" class="mt-1 block text-[11px] text-slate-400">
                    {{ snapshot.progressPercent }}% · {{ snapshot.etaLabel }}
                  </span>
                </span>
              </button>
            </div>
          </div>

          <div class="mb-3 flex items-center justify-between">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Relatórios</p>
            <span class="text-[11px] text-slate-400">{{ studioReports.length }}</span>
          </div>
          <div v-if="studioReports.length" class="space-y-2">
            <button
              v-for="report in studioReports"
              :key="report.id"
              type="button"
              class="flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition"
              :class="
                activeStudioReportId === report.id
                  ? 'border-amber-300 bg-amber-50 shadow-sm'
                  : 'border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm'
              "
              @click="activeStudioReportId = report.id; activeFundamentalSnapshotId = null; store.select(null)"
            >
              <span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                :class="
                  report.status === 'ready'
                    ? 'bg-emerald-500'
                    : report.status === 'error'
                      ? 'bg-rose-500'
                      : 'animate-pulse bg-amber-500'
                "
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-slate-950">{{ report.title }}</span>
                <span class="mt-0.5 block truncate text-xs text-slate-500">{{ report.subtitle }}</span>
                <span v-if="report.status === 'generating'" class="mt-1 block text-[11px] text-slate-400">
                  {{ report.progressPercent }}% · {{ report.etaLabel }}
                </span>
              </span>
            </button>
          </div>
          <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Clique em uma ferramenta acima para gerar relatórios a partir das fontes do caderno.
          </div>
        </div>
      </aside>
    </main>

    <footer class="flex h-6 shrink-0 items-center justify-between border-t border-slate-200 bg-[#e9edf5] px-4 text-[11px] text-slate-500">
      <span>O OpenYield pode gerar respostas incorretas. Por isso, confira o conteúdo nas fontes e documentos oficiais.</span>
      <button
        type="button"
        class="font-semibold text-slate-600 hover:text-indigo-700"
        @click="developerLogsVisible = true"
      >
        Developer Logs
      </button>
    </footer>

    <Dialog
      v-model:visible="renameOpen"
      modal
      header="Renomear caderno"
      class="w-[min(420px,95vw)]"
      :pt="{
        root: { class: 'border border-slate-700 bg-slate-900 text-slate-100' },
        header: { class: 'border-b border-slate-800' },
      }"
    >
      <div class="flex flex-col gap-3 p-2 text-sm">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-slate-400">Nome na aba (ex.: CSMG3 ou relatório trimestral)</span>
          <InputText
            v-model="renameTitle"
            class="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-slate-400">Ticker opcional (maiúsculas, ex. CSMG3)</span>
          <InputText
            v-model="renameTicker"
            placeholder="vazio = só o nome"
            class="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-100"
          />
        </label>
        <div class="flex justify-end gap-2">
          <Button type="button" label="Cancelar" size="small" severity="secondary" @click="renameOpen = false" />
          <Button type="button" label="Guardar" size="small" @click="applyRename" />
        </div>
      </div>
    </Dialog>

    <DeveloperLogsDialog v-model:visible="developerLogsVisible" />
  </div>
</template>

<style scoped>
.report-markdown-body {
  @apply text-slate-700;
}

.report-markdown-body :deep(h1) {
  @apply mb-4 border-b border-slate-200 pb-2 text-xl font-semibold tracking-tight text-slate-950;
}

.report-markdown-body :deep(h2) {
  @apply mb-3 mt-8 scroll-mt-4 border-l-4 border-amber-500 pl-3 text-base font-semibold text-slate-950 first:mt-0;
}

.report-markdown-body :deep(h3) {
  @apply mb-2 mt-5 text-sm font-semibold text-slate-800;
}

.report-markdown-body :deep(p) {
  @apply mb-3 text-sm leading-relaxed text-slate-700 last:mb-0;
}

.report-markdown-body :deep(strong) {
  @apply font-semibold text-slate-950;
}

.report-markdown-body :deep(ul),
.report-markdown-body :deep(ol) {
  @apply mb-3 ml-5 text-sm leading-relaxed text-slate-700;
}

.report-markdown-body :deep(li) {
  @apply mb-1.5 pl-1;
}

.report-markdown-body :deep(blockquote) {
  @apply my-3 rounded-r-lg border-l-4 border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900;
}

.report-markdown-body :deep(hr) {
  @apply my-6 border-slate-200;
}

.report-markdown-body :deep(code) {
  @apply rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.8rem] text-indigo-700;
}

.report-markdown-body :deep(pre) {
  @apply my-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700;
}

.report-markdown-body :deep(pre code) {
  @apply bg-transparent p-0 text-inherit;
}

.report-markdown-body :deep(table) {
  @apply my-3 w-full border-collapse overflow-hidden rounded-md border border-slate-200 text-sm;
}

.report-markdown-body :deep(th),
.report-markdown-body :deep(td) {
  @apply border border-slate-200 px-2 py-1.5 text-left;
}

.report-markdown-body :deep(th) {
  @apply bg-slate-100 text-slate-800;
}

.report-markdown-body--error :deep(p) {
  @apply text-rose-900;
}
</style>
