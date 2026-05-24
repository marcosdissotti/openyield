<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  createPdfPagePngObjectUrl,
  createPdfPageRegionPngObjectUrl,
  createPdfPageThumbnailUrls,
} from '../lib/createPdfPageThumbnailUrls'
import { groupMarkdownPagesForPreview } from '../lib/groupMarkdownPagesForPreview'
import { buildPagePreviewVisualMap } from '#widgets/chart-reconstruct/lib/buildPagePreviewVisualMap'
import { extractVisionChartJsonByPage } from '../lib/extractVisionChartJsonByPage'
import { stripVisionEnrichmentAppendix } from '../lib/stripVisionEnrichmentAppendix'
import { visionRecordToPageVisual, type VisionPageVisual } from '../lib/visionJsonToPageVisual'
import PageDocumentVisualBlock from './PageDocumentVisualBlock.vue'
import VisionEnrichedVisualBlock from './VisionEnrichedVisualBlock.vue'

const props = defineProps<{
  markdown: string
  file?: File
}>()

marked.use({ gfm: true, breaks: true })

const DOMPURIFY_OPTS = {
  ADD_ATTR: ['target', 'rel'],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
}

function toSanitizedHtml(md: string): string {
  const raw = marked.parse(md || '', { async: false })
  const html = typeof raw === 'string' ? raw : ''
  return DOMPurify.sanitize(html, DOMPURIFY_OPTS)
}

function mdToHtml(md: string): string {
  return toSanitizedHtml(md)
}

const docView = computed(() => groupMarkdownPagesForPreview(stripVisionEnrichmentAppendix(props.markdown || '')))

function compactMarkdownText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unspaceQuarterToken(text: string): string {
  return text.replace(/\b([1-4])\s*T\s*([0-9])\s*([0-9])\b/gi, '$1T$2$3')
}

function releasePeriodLabel(text: string): string | null {
  const normalized = unspaceQuarterToken(text)
  const quarterMatch =
    normalized.match(/\b([1-4])T(\d{2})\b/i) ??
    normalized.match(/\b([1-4])[ºo]?\s+trimestre\s+de\s+(20\d{2})\b/i)
  if (!quarterMatch) return null
  const quarter = quarterMatch[1]!
  const yy = quarterMatch[2]!
  const year = yy.length === 2 ? `20${yy}` : yy
  const quarterToken = `${quarter}T${year.slice(-2)}`
  const hasAnnual = new RegExp(`(exerc[ií]cio|acumulad[oa]|ano).*${year}`, 'i').test(normalized)
  return `${quarter}º Trimestre de ${year} (${quarterToken})${hasAnnual ? ` e acumulado do exercício de ${year}` : ''}`
}

function releaseDateLabel(text: string): string | null {
  const m = text.match(/\b(\d{1,2}\s+de\s+[a-zç]+(?:\s+de)?\s+20\d{2})\b/i)
  return m?.[1]?.replace(/\s+/g, ' ') ?? null
}

const documentHeader = computed(() => {
  const markdown = stripVisionEnrichmentAppendix(props.markdown || '')
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
  const text = compactMarkdownText(markdown)
  const b3 = text.match(/\bB3\s*:\s*([A-Z]{4}\d{1,2})\b/i)
  const copasa = /\bCOPASA\s+MG\b/i.test(text)
  const company = copasa ? 'COPASA MG (Companhia de Saneamento de Minas Gerais)' : null
  const ticker = b3?.[1]?.toUpperCase() ?? null
  const period = releasePeriodLabel(text)
  const releaseDate = releaseDateLabel(text)
  const facts = [
    company ? { label: 'Empresa', value: company } : null,
    ticker ? { label: 'Ticker', value: `${ticker} (B3)` } : null,
    period ? { label: 'Período', value: period } : null,
    releaseDate ? { label: 'Divulgação', value: releaseDate } : null,
  ].filter((x): x is { label: string; value: string } => x != null)
  return { title, facts }
})

const preambleWithoutTitle = computed(() => {
  const view = docView.value
  if (view.mode !== 'structured') return ''
  return (view.preambleMarkdown ?? '').replace(/^#\s+.+\n*/, '').trim()
})

const visionVisualByPage = computed(() => {
  const m = extractVisionChartJsonByPage(props.markdown || '')
  const out = new Map<number, VisionPageVisual>()
  for (const [p, rec] of m) {
    const v = visionRecordToPageVisual(p, rec)
    if (v) out.set(p, v)
  }
  return out
})

const pagePreviewByPage = computed(() => buildPagePreviewVisualMap(props.markdown || ''))

function visionVisualForPage(pageNum: number): VisionPageVisual | null {
  return visionVisualByPage.value.get(pageNum) ?? null
}

function pageHasOcrDerivedVisuals(pageNum: number): boolean {
  return pagePreviewByPage.value.has(pageNum)
}

const thumbs = ref<string[]>([])
const thumbsLoading = ref(false)
const thumbsError = ref(false)
let objectUrls: string[] = []
const visualSnaps = ref<Map<number, string>>(new Map())
const visualSnapsLoading = ref(false)
let visualObjectUrls: string[] = []

function thumbForPage(pageNum: number): string | undefined {
  return thumbs.value[pageNum - 1]
}

function visualSnapForPage(pageNum: number): string | undefined {
  return visualSnaps.value.get(pageNum)
}

function visualEvidencePages(): number[] {
  const pages = new Set<number>()
  for (const pageNum of pagePreviewByPage.value.keys()) pages.add(pageNum)
  for (const pageNum of visionVisualByPage.value.keys()) pages.add(pageNum)
  return Array.from(pages).sort((a, b) => a - b)
}

function evidenceCropForPage(pageNum: number): { x: number; y: number; w: number; h: number } {
  const visual = pagePreviewByPage.value.get(pageNum)
  if (visual?.mode === 'chart' && visual.companionTables?.length) return { x: 0, y: 0, w: 1, h: 0.55 }
  if (visual?.mode === 'chart') return { x: 0, y: 0, w: 1, h: 0.62 }
  if (visual?.mode === 'table') return { x: 0, y: 0, w: 1, h: 0.58 }
  return { x: 0, y: 0, w: 1, h: 0.62 }
}

function showThumbColumn(pageNum: number): boolean {
  if (!props.file) return false
  return !!(
    thumbForPage(pageNum) ||
    thumbsLoading.value ||
    (!thumbsLoading.value && !thumbForPage(pageNum))
  )
}

function pageBlockSectionClass(pageIndex: number): string {
  const v = docView.value
  const hasPreamble = v.mode === 'structured' && !!(v.preambleMarkdown && v.preambleMarkdown.trim())
  if (pageIndex === 0 && !hasPreamble) return 'mt-4 sm:mt-5'
  return 'mt-6 border-t border-slate-800/80 pt-6 sm:mt-8 sm:pt-8'
}

const modalOpen = ref(false)
const modalPageNum = ref(1)
const modalThumbSrc = ref('')
const modalHiResSrc = ref<string | null>(null)
const modalHiResLoading = ref(false)
let modalHiResObjectUrl: string | null = null
const imageZoom = ref(1)
const modalRootRef = ref<HTMLElement | null>(null)

const MIN_ZOOM = 0.35
const MAX_ZOOM = 5

function closePagePreview() {
  modalOpen.value = false
  modalThumbSrc.value = ''
  modalHiResSrc.value = null
  modalHiResLoading.value = false
  imageZoom.value = 1
  if (modalHiResObjectUrl) {
    URL.revokeObjectURL(modalHiResObjectUrl)
    modalHiResObjectUrl = null
  }
}

async function openPagePreview(pageNum: number) {
  const thumb = thumbForPage(pageNum)
  if (!thumb || !props.file) return
  modalPageNum.value = pageNum
  modalThumbSrc.value = thumb
  modalHiResSrc.value = null
  imageZoom.value = 1
  modalOpen.value = true
  modalHiResLoading.value = true
  await nextTick()
  modalRootRef.value?.focus()

  try {
    const url = await createPdfPagePngObjectUrl(props.file, pageNum, 2.35)
    if (!modalOpen.value) {
      URL.revokeObjectURL(url)
      return
    }
    if (modalHiResObjectUrl) {
      URL.revokeObjectURL(modalHiResObjectUrl)
    }
    modalHiResObjectUrl = url
    modalHiResSrc.value = url
  } catch {
    /* mantém miniatura */
  } finally {
    modalHiResLoading.value = false
  }
}

function zoomIn() {
  imageZoom.value = Math.min(MAX_ZOOM, Math.round((imageZoom.value + 0.2) * 100) / 100)
}

function zoomOut() {
  imageZoom.value = Math.max(MIN_ZOOM, Math.round((imageZoom.value - 0.2) * 100) / 100)
}

function resetZoom() {
  imageZoom.value = 1
}

function onModalWheel(e: WheelEvent) {
  if (!modalOpen.value) return
  const step = e.deltaY > 0 ? -0.12 : 0.12
  imageZoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((imageZoom.value + step) * 100) / 100))
}

function revokeThumbs() {
  for (const u of objectUrls) {
    URL.revokeObjectURL(u)
  }
  objectUrls = []
  thumbs.value = []
}

function revokeVisualSnaps() {
  for (const u of visualObjectUrls) {
    URL.revokeObjectURL(u)
  }
  visualObjectUrls = []
  visualSnaps.value = new Map()
}

watch(
  () => props.file,
  async (file) => {
    closePagePreview()
    revokeThumbs()
    thumbsError.value = false
    if (!file) return
    thumbsLoading.value = true
    try {
      const urls = await createPdfPageThumbnailUrls(file, 0.55)
      objectUrls = urls
      thumbs.value = urls
    } catch {
      thumbsError.value = true
    } finally {
      thumbsLoading.value = false
    }
  },
  { immediate: true },
)

watch(
  () => [props.file, props.markdown] as const,
  async ([file]) => {
    revokeVisualSnaps()
    if (!file) return
    const pages = visualEvidencePages()
    if (!pages.length) return
    visualSnapsLoading.value = true
    try {
      const entries: Array<[number, string]> = []
      for (const pageNum of pages) {
        const url = await createPdfPageRegionPngObjectUrl(file, pageNum, evidenceCropForPage(pageNum), 1.25)
        visualObjectUrls.push(url)
        entries.push([pageNum, url])
      }
      visualSnaps.value = new Map(entries)
    } catch {
      revokeVisualSnaps()
    } finally {
      visualSnapsLoading.value = false
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  closePagePreview()
  revokeThumbs()
  revokeVisualSnaps()
})
</script>

<template>
  <div
    data-cy="source-markdown-panel"
    class="llm-md-preview flex min-h-0 flex-1 flex-col gap-4 text-slate-700"
  >
    <article
      class="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white px-3 py-4 shadow-sm sm:px-5 sm:py-6"
    >
      <template v-if="docView.mode === 'single'">
        <div class="markdown-body" v-html="mdToHtml(docView.markdown)" />
      </template>
      <template v-else>
        <header v-if="documentHeader.title" class="mb-6 border-b border-slate-200 pb-5">
          <h1 class="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {{ documentHeader.title }}
          </h1>
          <dl
            v-if="documentHeader.facts.length"
            class="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div v-for="fact in documentHeader.facts" :key="fact.label" class="min-w-0">
              <dt class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{{ fact.label }}</dt>
              <dd class="mt-1 text-xs font-medium leading-5 text-slate-800">{{ fact.value }}</dd>
            </div>
          </dl>
        </header>
        <div
          v-if="preambleWithoutTitle"
          class="markdown-body mb-6"
          v-html="mdToHtml(preambleWithoutTitle)"
        />
        <section
          v-for="(pb, pi) in docView.pages"
          :key="`page-${pb.pageNum}`"
          :class="['page-block grid gap-4 sm:gap-5', pageBlockSectionClass(pi)]"
        >
          <div
            class="grid gap-4 lg:items-start lg:gap-6"
            :class="showThumbColumn(pb.pageNum) ? 'lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]' : ''"
          >
            <figure
              v-if="showThumbColumn(pb.pageNum) && thumbForPage(pb.pageNum)"
              class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 lg:sticky lg:top-2"
            >
              <button
                type="button"
                class="group relative block w-full cursor-zoom-in p-0 text-left outline-none ring-indigo-400/0 transition hover:ring-2 focus-visible:ring-2 focus-visible:ring-indigo-400"
                :aria-label="`Ampliar página ${pb.pageNum}`"
                @click="openPagePreview(pb.pageNum)"
              >
                <div class="relative aspect-[3/4] w-full max-w-[16rem] overflow-hidden sm:max-w-none">
                  <img
                    :src="thumbForPage(pb.pageNum)"
                    :alt="`Página ${pb.pageNum} do PDF`"
                    class="h-full w-full object-cover object-top transition duration-200 group-hover:brightness-110"
                    loading="lazy"
                  />
                  <span
                    class="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm"
                  >
                    Página {{ pb.pageNum }}
                  </span>
                  <span
                    class="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100"
                  >
                    Clicar para ampliar
                  </span>
                </div>
              </button>
            </figure>

            <div
              v-else-if="showThumbColumn(pb.pageNum) && thumbsLoading"
              class="flex max-w-[16rem] flex-col justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center lg:sticky lg:top-2"
              aria-busy="true"
            >
              <span class="mx-auto h-8 w-8 animate-pulse rounded-full bg-slate-200" />
              <span class="text-[11px] text-slate-500">A carregar miniatura…</span>
            </div>

            <div
              v-else-if="showThumbColumn(pb.pageNum) && !thumbsLoading && !thumbForPage(pb.pageNum)"
              class="max-w-[16rem] rounded-xl border border-slate-200 bg-slate-50 p-3 text-center lg:sticky lg:top-2"
            >
              <span class="text-[11px] text-slate-500">{{
                thumbsError ? 'Miniaturas indisponíveis' : 'Sem miniatura para esta página'
              }}</span>
            </div>

            <div
              class="flex min-w-0 flex-col gap-5"
              :class="!props.file || !showThumbColumn(pb.pageNum) ? 'lg:col-span-full' : ''"
            >
              <h2 class="preview-page-title">Página {{ pb.pageNum }}</h2>
              <div v-for="sec in pb.sections" :key="sec.kind" class="space-y-2">
                <h3 class="preview-page-subsection">{{ sec.title }}</h3>
                <div class="markdown-body markdown-body--slice min-w-0" v-html="mdToHtml(sec.bodyMarkdown)" />
              </div>
              <figure
                v-if="visualSnapForPage(pb.pageNum)"
                class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                :data-cy="`page-${pb.pageNum}-visual-evidence`"
              >
                <div class="border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Recorte original para conferência
                  </p>
                </div>
                <img
                  :src="visualSnapForPage(pb.pageNum)"
                  :alt="`Recorte visual da página ${pb.pageNum}`"
                  class="block max-h-[24rem] w-full object-contain"
                  loading="lazy"
                />
              </figure>
              <div
                v-else-if="visualSnapsLoading && (pageHasOcrDerivedVisuals(pb.pageNum) || visionVisualForPage(pb.pageNum))"
                class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500"
              >
                A preparar recorte visual…
              </div>
              <PageDocumentVisualBlock
                v-if="pageHasOcrDerivedVisuals(pb.pageNum)"
                :page-num="pb.pageNum"
                :page-visual="pagePreviewByPage.get(pb.pageNum)"
              />
              <div v-if="visionVisualForPage(pb.pageNum)" :data-cy="`page-${pb.pageNum}-vision-visual`">
                <h3 class="preview-page-subsection">IA</h3>
                <VisionEnrichedVisualBlock :visual="visionVisualForPage(pb.pageNum)!" />
              </div>
            </div>
          </div>
        </section>
      </template>
    </article>

    <Teleport to="body">
      <div
        v-if="modalOpen"
        ref="modalRootRef"
        class="fixed inset-0 z-[200] flex flex-col bg-slate-950/95 text-slate-100 shadow-2xl outline-none backdrop-blur-sm"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="`Pré-visualização página ${modalPageNum}`"
        @keydown.escape.prevent="closePagePreview"
      >
        <div class="absolute inset-0 bg-black/40" aria-hidden="true" @click="closePagePreview" />
        <header
          class="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 bg-slate-900/90 px-4 py-3"
          @click.stop
        >
          <h3 class="text-sm font-semibold text-white">Página {{ modalPageNum }}</h3>
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center rounded-lg border border-slate-600 bg-slate-800/80 p-0.5">
              <button
                type="button"
                class="rounded px-2.5 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
                aria-label="Afastar"
                @click="zoomOut"
              >
                −
              </button>
              <span class="min-w-[3.25rem] px-1 text-center text-xs tabular-nums text-slate-400"
                >{{ Math.round(imageZoom * 100) }}%</span
              >
              <button
                type="button"
                class="rounded px-2.5 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
                aria-label="Aproximar"
                @click="zoomIn"
              >
                +
              </button>
            </div>
            <button
              type="button"
              class="rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              @click="resetZoom"
            >
              100%
            </button>
            <button
              type="button"
              class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              @click="closePagePreview"
            >
              Fechar
            </button>
          </div>
        </header>
        <div
          class="relative z-10 min-h-0 flex-1 overflow-auto overscroll-contain"
          @wheel.prevent="onModalWheel"
        >
          <div class="flex min-h-[70vh] w-full items-start justify-center p-6 sm:p-10">
            <div
              class="inline-block origin-top transition-transform duration-75 will-change-transform"
              :style="{ transform: `scale(${imageZoom})` }"
            >
              <div class="relative rounded-lg border border-slate-600 bg-slate-900 shadow-2xl">
                <img
                  v-if="modalThumbSrc"
                  :key="modalHiResSrc || modalThumbSrc"
                  :src="modalHiResSrc || modalThumbSrc"
                  :alt="`Página ${modalPageNum} ampliada`"
                  class="block max-h-[85vh] w-auto max-w-[min(96vw,1600px)] select-none"
                  draggable="false"
                />
                <div
                  v-if="modalHiResLoading"
                  class="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-950/50 text-xs text-slate-300"
                >
                  A carregar alta resolução…
                </div>
              </div>
            </div>
          </div>
        </div>
        <p class="relative z-10 shrink-0 border-t border-slate-800 bg-slate-900/80 px-4 py-2 text-center text-[11px] text-slate-500">
          Roda do rato para zoom · Esc para fechar · Clicar fora fecha
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.preview-page-title {
  @apply mb-1 scroll-mt-4 border-l-4 border-indigo-500 pl-3 text-base font-semibold text-slate-950;
}

.preview-page-subsection {
  @apply border-b border-slate-200 pb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-600;
}

.markdown-body :deep(h1) {
  @apply mb-4 border-b border-slate-200 pb-2 text-xl font-semibold tracking-tight text-slate-950;
}

.markdown-body :deep(h2) {
  @apply mb-3 mt-8 scroll-mt-4 border-l-4 border-indigo-500 pl-3 text-base font-semibold text-slate-950 first:mt-0;
}

.markdown-body--slice :deep(h2:first-of-type) {
  @apply mt-0;
}

.markdown-body :deep(h3) {
  @apply mb-2 mt-5 text-sm font-semibold text-slate-800;
}

.markdown-body :deep(p) {
  @apply mb-3 text-sm leading-relaxed text-slate-700 last:mb-0;
}

.markdown-body :deep(strong) {
  @apply font-semibold text-slate-950;
}

.markdown-body :deep(em) {
  @apply text-slate-700;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  @apply mb-3 ml-5 text-sm text-slate-700;
}

.markdown-body :deep(li) {
  @apply mb-1;
}

.markdown-body :deep(blockquote) {
  @apply my-3 border-l-4 border-slate-300 pl-3 text-sm italic text-slate-500;
}

.markdown-body :deep(code) {
  @apply rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.8rem] text-indigo-700;
}

.markdown-body :deep(pre) {
  @apply my-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700;
}

.markdown-body :deep(pre code) {
  @apply bg-transparent p-0 text-inherit;
}

.markdown-body :deep(a) {
  @apply text-indigo-700 underline decoration-indigo-300 underline-offset-2 transition hover:text-indigo-900;
}

.markdown-body :deep(hr) {
  @apply my-6 border-slate-200;
}

.markdown-body :deep(table) {
  @apply my-3 w-full border-collapse overflow-hidden rounded-md border border-slate-200 text-sm;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  @apply border border-slate-200 px-2 py-1.5 text-left;
}

.markdown-body :deep(th) {
  @apply bg-slate-100 text-slate-800;
}

.markdown-body :deep(img) {
  @apply my-3 max-h-72 max-w-full rounded-lg border border-slate-200 object-contain shadow-sm;
}
</style>
