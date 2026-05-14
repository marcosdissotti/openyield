<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { OcrChartReconstruction, PagePreviewVisual } from '#widgets/chart-reconstruct'
import {
  buildPagePreviewVisualMap,
  OcrReconstructedChartCard,
  ReconstructedTableBlock,
} from '#widgets/chart-reconstruct'
import { createPdfPagePngObjectUrl, createPdfPageThumbnailUrls } from '../lib/createPdfPageThumbnailUrls'

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

type Segment =
  | { kind: 'preamble'; html: string }
  | { kind: 'page'; pageNum: number; sectionLabel: string; html: string }

const thumbs = ref<string[]>([])
const thumbsLoading = ref(false)
const thumbsError = ref(false)
let objectUrls: string[] = []

const segments = computed((): Segment[] => {
  const src = (props.markdown || '').replace(/\r\n/g, '\n')
  if (!/^## Página \d+/m.test(src)) {
    return [{ kind: 'preamble', html: toSanitizedHtml(src) }]
  }
  const chunks = src.split(/(?=^## Página \d+)/m)
  const out: Segment[] = []
  const head = chunks[0] ?? ''
  if (head.trim()) {
    out.push({ kind: 'preamble', html: toSanitizedHtml(head) })
  }
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i] ?? ''
    const m = c.match(/^## Página (\d+)/)
    const pageNum = m ? parseInt(m[1], 10) : 1
    const head = c.match(/^##\s+Página\s+\d+\s+—\s*(.+)$/m)
    const sectionLabel = (head?.[1] ?? '').trim()
    out.push({ kind: 'page', pageNum, sectionLabel, html: toSanitizedHtml(c) })
  }
  return out
})

const previewVisualByPage = computed(() => buildPagePreviewVisualMap(props.markdown || ''))

function chartVisualForPage(pageNum: number): OcrChartReconstruction | null {
  const v = previewVisualByPage.value.get(pageNum)
  return v?.mode === 'chart' ? v.chart : null
}

function tableVisualForPage(pageNum: number): Extract<PagePreviewVisual, { mode: 'table' }> | null {
  const v = previewVisualByPage.value.get(pageNum)
  return v?.mode === 'table' ? v : null
}

function isTextoExtraidoSection(seg: Segment): boolean {
  return seg.kind === 'page' && seg.sectionLabel.trim().toLowerCase() === 'texto extraído'
}

function thumbForPage(pageNum: number): string | undefined {
  return thumbs.value[pageNum - 1]
}

/** Primeiro bloco `## Página` do documento (para não duplicar margem com o título) */
function isFirstPageSegment(index: number): boolean {
  for (let i = 0; i < index; i++) {
    if (segments.value[i]?.kind === 'page') return false
  }
  return segments.value[index]?.kind === 'page'
}

/** Primeira secção deste número de página (texto vs layout vs OCR): mostra miniatura só aqui */
function isFirstSegmentForPageNumber(segIdx: number, pageNum: number): boolean {
  for (let i = 0; i < segIdx; i++) {
    const s = segments.value[i]
    if (s?.kind === 'page' && s.pageNum === pageNum) return false
  }
  return true
}

function showThumbColumn(segIdx: number, pageNum: number): boolean {
  if (!props.file || !isFirstSegmentForPageNumber(segIdx, pageNum)) return false
  return !!(
    thumbForPage(pageNum) ||
    thumbsLoading.value ||
    (!thumbsLoading.value && !thumbForPage(pageNum))
  )
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

onUnmounted(() => {
  closePagePreview()
  revokeThumbs()
})
</script>

<template>
  <div
    data-cy="source-markdown-panel"
    class="llm-md-preview flex min-h-0 flex-1 flex-col gap-4 text-slate-200"
  >
    <article
      class="min-h-0 flex-1 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-4 shadow-inner sm:px-5 sm:py-6"
    >
      <template v-for="(seg, idx) in segments" :key="idx">
        <div v-if="seg.kind === 'preamble'" class="markdown-body" v-html="seg.html" />

        <section
          v-else
          :class="[
            'page-block grid gap-4 sm:gap-5',
            isFirstPageSegment(idx)
              ? 'mt-4 sm:mt-5'
              : 'mt-6 border-t border-slate-800/80 pt-6 sm:mt-8 sm:pt-8',
          ]"
        >
          <div
            class="grid gap-4 lg:items-start lg:gap-6"
            :class="showThumbColumn(idx, seg.pageNum) ? 'lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]' : ''"
          >
            <figure
              v-if="showThumbColumn(idx, seg.pageNum) && thumbForPage(seg.pageNum)"
              class="overflow-hidden rounded-xl border border-slate-600/80 bg-slate-900 shadow-lg ring-1 ring-black/25 lg:sticky lg:top-2"
            >
              <button
                type="button"
                class="group relative block w-full cursor-zoom-in p-0 text-left outline-none ring-indigo-400/0 transition hover:ring-2 focus-visible:ring-2 focus-visible:ring-indigo-400"
                :aria-label="`Ampliar página ${seg.pageNum}`"
                @click="openPagePreview(seg.pageNum)"
              >
                <div class="relative aspect-[3/4] w-full max-w-[16rem] overflow-hidden sm:max-w-none">
                  <img
                    :src="thumbForPage(seg.pageNum)"
                    :alt="`Página ${seg.pageNum} do PDF`"
                    class="h-full w-full object-cover object-top transition duration-200 group-hover:brightness-110"
                    loading="lazy"
                  />
                  <span
                    class="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm"
                  >
                    Página {{ seg.pageNum }}
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
              v-else-if="showThumbColumn(idx, seg.pageNum) && thumbsLoading"
              class="flex max-w-[16rem] flex-col justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-4 text-center lg:sticky lg:top-2"
              aria-busy="true"
            >
              <span class="mx-auto h-8 w-8 animate-pulse rounded-full bg-slate-700" />
              <span class="text-[11px] text-slate-500">A carregar miniatura…</span>
            </div>

            <div
              v-else-if="showThumbColumn(idx, seg.pageNum) && !thumbsLoading && !thumbForPage(seg.pageNum)"
              class="max-w-[16rem] rounded-xl border border-slate-700/60 bg-slate-900/30 p-3 text-center lg:sticky lg:top-2"
            >
              <span class="text-[11px] text-slate-500">{{
                thumbsError ? 'Miniaturas indisponíveis' : 'Sem miniatura para esta página'
              }}</span>
            </div>

            <div
              class="markdown-body markdown-body--slice min-w-0"
              :class="!props.file || !showThumbColumn(idx, seg.pageNum) ? 'lg:col-span-full' : ''"
              v-html="seg.html"
            />
          </div>

          <div
            v-if="seg.kind === 'page' && isTextoExtraidoSection(seg) && (chartVisualForPage(seg.pageNum) || tableVisualForPage(seg.pageNum))"
            class="mt-4 border-t border-slate-800/90 pt-4"
            :data-cy="`page-${seg.pageNum}-reconstructed-visual`"
          >
            <template v-if="chartVisualForPage(seg.pageNum)">
              <p class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Gráfico reconstruído (Chart.js)
              </p>
              <OcrReconstructedChartCard :config="chartVisualForPage(seg.pageNum)!" embedded />
            </template>
            <template v-else-if="tableVisualForPage(seg.pageNum)">
              <p class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Tabela(s) reconstruída(s) a partir do layout
              </p>
              <ReconstructedTableBlock
                :tables="tableVisualForPage(seg.pageNum)!.tables"
                :note="tableVisualForPage(seg.pageNum)!.note"
              />
            </template>
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
.markdown-body :deep(h1) {
  @apply mb-4 border-b border-slate-700 pb-2 text-xl font-semibold tracking-tight text-white;
}

.markdown-body :deep(h2) {
  @apply mb-3 mt-8 scroll-mt-4 border-l-4 border-indigo-500 pl-3 text-base font-semibold text-indigo-100 first:mt-0;
}

.markdown-body--slice :deep(h2:first-of-type) {
  @apply mt-0;
}

.markdown-body :deep(h3) {
  @apply mb-2 mt-5 text-sm font-semibold text-slate-200;
}

.markdown-body :deep(p) {
  @apply mb-3 text-sm leading-relaxed text-slate-300 last:mb-0;
}

.markdown-body :deep(strong) {
  @apply font-semibold text-slate-100;
}

.markdown-body :deep(em) {
  @apply text-slate-200;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  @apply mb-3 ml-5 text-sm text-slate-300;
}

.markdown-body :deep(li) {
  @apply mb-1;
}

.markdown-body :deep(blockquote) {
  @apply my-3 border-l-4 border-slate-600 pl-3 text-sm italic text-slate-400;
}

.markdown-body :deep(code) {
  @apply rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[0.8rem] text-amber-100/95;
}

.markdown-body :deep(pre) {
  @apply my-3 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/90 p-3 font-mono text-xs leading-relaxed text-emerald-100/90;
}

.markdown-body :deep(pre code) {
  @apply bg-transparent p-0 text-inherit;
}

.markdown-body :deep(a) {
  @apply text-indigo-400 underline decoration-indigo-500/40 underline-offset-2 transition hover:text-indigo-300;
}

.markdown-body :deep(hr) {
  @apply my-6 border-slate-700;
}

.markdown-body :deep(table) {
  @apply my-3 w-full border-collapse overflow-hidden rounded-md border border-slate-700 text-sm;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  @apply border border-slate-700 px-2 py-1.5 text-left;
}

.markdown-body :deep(th) {
  @apply bg-slate-800/80 text-slate-200;
}

.markdown-body :deep(img) {
  @apply my-3 max-h-72 max-w-full rounded-lg border border-slate-600 object-contain shadow-lg;
}
</style>
