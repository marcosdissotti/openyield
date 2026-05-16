<script setup lang="ts">
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
import { buildLlmDocumentFromPdf } from '#features/extract-pdf-rich'
import { mapPdfExtractError } from '#shared/lib/mapPdfExtractError'
import { enrichMarkdownWithLlamaVision } from '#features/llama-vision-enrich/lib/enrichMarkdownWithLlamaVision'
import { chatCompletion, LlamaRuntimeError } from '#features/llama-runtime/lib/llamaRuntimeApi'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import LlmRuntimeBar from '#widgets/llm-runtime-bar/ui/LlmRuntimeBar.vue'
import { isPdfDbAvailable, pdfDbPersistDocument, pdfDbReadDocumentFile } from '#features/pdf-persistence/lib/pdfDbClient'
import {
  vectorBuscarChunksDoNotebook,
  vectorGarantirChunksDoNotebook,
  type VectorSearchResult,
} from '#features/vector-persistence/lib/vectorClient'

const store = usePdfSourcesStore()
const notebook = useNotebookStore()
const llmRuntime = useLlmRuntimeStore()
const dropRef = ref<InstanceType<typeof PdfDropArea> | null>(null)
const panelTab = ref<'raw' | 'llm'>('llm')
const restoringPreviewFiles = new Set<string>()
const chatDraft = ref('')
const chatMessages = ref<Array<{ role: 'user' | 'assistant'; text: string }>>([])
interface StudioReport {
  id: string
  type: 'risk'
  title: string
  subtitle: string
  status: 'generating' | 'ready' | 'error'
  body: string
  createdAt: string
  progressPercent: number
  etaLabel: string
}

const studioReports = ref<StudioReport[]>([])
const activeStudioReportId = ref<string | null>(null)
let extractionQueue: Promise<void> = Promise.resolve()

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
const generatingRiskReport = computed(
  () => studioReports.value.find((report) => report.type === 'risk' && report.status === 'generating') ?? null,
)
const selectedPreviewText = computed(() => {
  const text = store.selected?.llmMarkdown || store.selected?.extractedText || ''
  return text.replace(/[#*_`>|-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 520)
})

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
      console.error('[pdf-sources] Falha a restaurar preview do PDF:', e)
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
  try {
    const result = await buildLlmDocumentFromPdf(file, {
      onProgress: (p) => store.updateProgress(id, p),
      ocrAllPages: import.meta.env.VITE_PDF_OCR_ALL_PAGES !== '0',
    })
    let llmMarkdown = result.llmMarkdown
    if (llmRuntime.canRunVision() && llmRuntime.effectiveServerBase) {
      const modelName = llmRuntime.chatModelName.trim() || 'default'
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
    if (isPdfDbAvailable()) {
      try {
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
        if (src && persisted?.pdfPath) src.pdfPath = persisted.pdfPath
      } catch (e) {
        console.error('[pdf-sources] Falha a persistir no Vectra:', e)
      }
    }
  } catch (e) {
    store.fail(id, mapPdfExtractError(e))
  }
}

function onFiles(files: File[]) {
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

function submitChat() {
  const text = chatDraft.value.trim()
  if (!text) return
  chatMessages.value.push({ role: 'user', text })
  chatMessages.value.push({
    role: 'assistant',
    text:
      readySources.value.length > 0
        ? 'Chat com RAG entra aqui: vou usar as fontes selecionadas, o índice vetorial e o modelo conectado para responder com citações.'
        : 'Adicione uma fonte primeiro para eu responder com base nos documentos do caderno.',
  })
  chatDraft.value = ''
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

async function collectRiskEvidence(notebookId: string, report: StudioReport): Promise<string> {
  updateReportProgress(
    report,
    8,
    'Preparando índice semântico...',
    'Criando/validando chunks por página e seção no Vectra. Na primeira vez isso pode levar alguns segundos; se demorar, uso as fontes carregadas como fallback.',
    45,
  )

  try {
    const indexed = await withTimeout(
      vectorGarantirChunksDoNotebook(notebookId),
      18_000,
      'Indexação semântica ainda em andamento; usando fallback local para não travar a geração.',
    )
    if (indexed) {
      updateReportProgress(
        report,
        25,
        'Índice semântico pronto',
        `Documentos indexados agora: ${indexed.documentsIndexed}; chunks novos: ${indexed.chunksIndexed}.`,
        35,
      )
    }
  } catch (e) {
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
    updateReportProgress(
      report,
      28 + ((i + 1) / queries.length) * 32,
      `Buscando evidências ${i + 1}/${queries.length}...`,
      `Consulta semântica: ${query}`,
      Math.max(12, Math.round((queries.length - i) * 4 + 18)),
    )
    const rows = await vectorBuscarChunksDoNotebook(query, notebookId, 8)
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
}): Promise<string> {
  const maxAttempts = 3
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    updateReportProgress(
      input.report,
      68 + (input.index / input.total) * 27,
      `Gerando seção ${input.index + 1}/${input.total}: ${input.sectionTitle}`,
      `${input.report.body}\n\nTentativa ${attempt}/${maxAttempts} para "${input.sectionTitle}".`,
      Math.max(8, Math.round((input.total - input.index) * 18)),
    )
    try {
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
        'EVIDÊNCIAS:',
        input.evidence,
      ].filter(Boolean).join('\n')
      const out = await chatCompletion({
        baseUrl: llmRuntime.effectiveServerBase,
        apiToken: llmRuntime.llmApiToken,
        model: input.model,
        temperature: 0.1,
        timeoutMs: 70_000,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = out.text.trim()
      if (text) return text
      throw new Error('O modelo retornou vazio.')
    } catch (e) {
      lastError = e
      if (attempt < maxAttempts) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 1500))
      }
    }
  }
  return fallbackRiskSection(input.sectionTitle, input.evidence, lastError)
}

async function generateRiskReport() {
  const notebookId = notebook.activeNotebookId
  if (!notebookId) return
  const running = generatingRiskReport.value
  if (running) {
    activeStudioReportId.value = running.id
    store.select(null)
    return
  }
  const id = crypto.randomUUID()
  const report: StudioReport = {
    id,
    type: 'risk',
    title: 'Relatório de Riscos',
    subtitle: 'Gerando evidências...',
    status: 'generating',
    body: 'Buscando evidências por página/seção nas fontes do caderno...',
    createdAt: new Date().toISOString(),
    progressPercent: 3,
    etaLabel: '~60s restantes',
  }
  studioReports.value.unshift(report)
  activeStudioReportId.value = id
  store.select(null)

  try {
    if (!readySources.value.length) throw new Error('Adicione pelo menos uma fonte pronta neste caderno.')
    const model = llmRuntime.chatModelName.trim()
    if (!model || !llmRuntime.effectiveServerBase) {
      throw new Error('Conecte um modelo LLM antes de gerar o relatório.')
    }
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
      })
      sections.push(text)
      report.body = [header, ...sections].join('\n\n---\n\n')
    }
    report.status = 'ready'
    updateReportProgress(report, 100, `${readySources.value.length} fonte(s) analisada(s)`, report.body, 0)
  } catch (e) {
    report.status = 'error'
    report.progressPercent = 100
    report.etaLabel = 'Interrompido'
    report.subtitle = 'Falha ao gerar'
    report.body = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="flex h-screen min-h-0 flex-col bg-[#edf1f7] text-slate-950">
    <header class="flex h-16 shrink-0 items-center gap-4 px-4">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm">
          <span class="text-sm font-black tracking-tight">RI</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="truncate text-lg font-semibold tracking-tight text-slate-950">
              RI Hub
            </h1>
            <span class="hidden rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline">
              Investidores
            </span>
          </div>
          <p class="truncate text-xs text-slate-500">
            {{ selectedNotebook?.ticker ? `${selectedNotebook.title} · ${selectedNotebook.ticker}` : selectedNotebook?.title ?? 'Caderno' }}
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
            :title="n.ticker ? `${n.title} (${n.ticker})` : n.title"
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
                @click="activeStudioReportId = null; store.select(s.id)"
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
            <h2 class="text-sm font-semibold text-slate-950">
              {{ activeStudioReport ? activeStudioReport.title : store.selected ? 'Documento' : 'Conversa' }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ activeStudioReport?.subtitle ?? store.selected?.fileName ?? `${readySources.length} fonte(s) neste caderno` }}
            </p>
          </div>
          <div v-if="!activeStudioReport && store.selected?.status === 'ready'" class="flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
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
                    <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Relatório RI Hub</p>
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
                <pre class="whitespace-pre-wrap font-sans text-sm leading-7">{{ activeStudioReport.body }}</pre>
              </div>
            </article>
          </ScrollPanel>
        </template>

        <template v-else-if="!store.selected">
          <ScrollPanel class="min-h-0 flex-1 overflow-auto bg-[#fbfcff]">
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
                  v-for="(m, idx) in chatMessages"
                  :key="idx"
                  class="max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm"
                  :class="
                    m.role === 'user'
                      ? 'ml-auto bg-slate-950 text-white'
                      : 'mr-auto border border-slate-200 bg-white text-slate-700'
                  "
                >
                  {{ m.text }}
                </div>
              </div>
            </div>
          </ScrollPanel>

          <form class="shrink-0 border-t border-slate-200 bg-white p-4" @submit.prevent="submitChat">
            <div class="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
              <input
                v-model="chatDraft"
                type="text"
                class="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Pergunte sobre resultados, riscos, guidance, dividendos..."
              />
              <span class="hidden text-xs text-slate-400 sm:inline">{{ readySources.length }} fonte(s)</span>
              <button
                type="submit"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-indigo-700"
                aria-label="Enviar pergunta"
              >
                →
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
            <p class="text-[11px] text-slate-500">Ferramentas RI</p>
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
          <button type="button" class="rounded-xl bg-emerald-50 p-3 text-left transition hover:bg-emerald-100">
            <span class="block text-xs font-semibold text-emerald-700">Tabela financeira</span>
            <span class="mt-1 block text-[11px] text-emerald-500">KPIs e períodos</span>
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
              @click="activeStudioReportId = report.id; store.select(null)"
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

    <footer class="flex h-6 shrink-0 items-center justify-center border-t border-slate-200 bg-[#e9edf5] px-4 text-center text-[11px] text-slate-500">
      O RI Hub pode gerar respostas incorretas. Por isso, confira o conteúdo nas fontes e documentos oficiais.
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
  </div>
</template>
