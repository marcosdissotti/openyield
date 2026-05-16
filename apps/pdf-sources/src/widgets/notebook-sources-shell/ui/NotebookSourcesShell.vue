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
import { LlamaRuntimeError } from '#features/llama-runtime/lib/llamaRuntimeApi'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import LlmRuntimeBar from '#widgets/llm-runtime-bar/ui/LlmRuntimeBar.vue'
import { isPdfDbAvailable, pdfDbPersistDocument, pdfDbReadDocumentFile } from '#features/pdf-persistence/lib/pdfDbClient'

const store = usePdfSourcesStore()
const notebook = useNotebookStore()
const llmRuntime = useLlmRuntimeStore()
const dropRef = ref<InstanceType<typeof PdfDropArea> | null>(null)
const panelTab = ref<'raw' | 'llm'>('llm')
const restoringPreviewFiles = new Set<string>()

const visibleSources = computed(() => {
  const id = notebook.activeNotebookId
  if (!id) return []
  return store.sources.filter((s) => s.notebookId === id)
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

async function onFiles(files: File[]) {
  if (!notebook.activeNotebookId) notebook.ensureDefaultInMemory()
  const nbId = notebook.activeNotebookId
  if (!nbId) return
  for (const file of files) {
    const id = store.addPending(file, nbId)
    try {
      const result = await buildLlmDocumentFromPdf(file, {
        onProgress: (p) => store.updateProgress(id, p),
        ocrAllPages: import.meta.env.VITE_PDF_OCR_ALL_PAGES !== '0',
      })
      let llmMarkdown = result.llmMarkdown
      if (llmRuntime.canRunVision() && llmRuntime.effectiveServerBase) {
        const modelName = llmRuntime.chatModelName.trim() || 'default'
        try {
          const rawEdge = import.meta.env.VITE_VISION_MAX_LONG_EDGE
          let visionMaxLongEdgePx: number | undefined
          if (rawEdge !== undefined && String(rawEdge).trim() !== '') {
            const e = parseInt(String(rawEdge), 10)
            if (Number.isFinite(e)) visionMaxLongEdgePx = Math.max(0, e)
          }
          const rawScale = import.meta.env.VITE_VISION_SCALE
          let visionScale: number | undefined
          if (rawScale !== undefined && String(rawScale).trim() !== '') {
            const s = parseFloat(String(rawScale))
            if (Number.isFinite(s) && s > 0.25 && s <= 6) visionScale = s
          }
          const rawCd = import.meta.env.VITE_VISION_COOLDOWN_MS
          let visionCooldownMs: number | undefined
          if (rawCd !== undefined && String(rawCd).trim() !== '') {
            const c = parseInt(String(rawCd), 10)
            if (Number.isFinite(c) && c >= 0 && c <= 60_000) visionCooldownMs = c
          }
          llmMarkdown = await enrichMarkdownWithLlamaVision(file, llmMarkdown, {
            baseUrl: llmRuntime.effectiveServerBase,
            apiToken: llmRuntime.llmApiToken,
            model: modelName,
            onProgress: (p) => store.updateProgress(id, p),
            bitmapPageNumbers: result.bitmapPageNumbers,
            ...(visionMaxLongEdgePx !== undefined ? { visionMaxLongEdgePx } : {}),
            ...(visionScale !== undefined ? { visionScale } : {}),
            ...(visionCooldownMs !== undefined ? { visionCooldownMs } : {}),
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
            notebookId: nbId,
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
}

function addAnother() {
  dropRef.value?.openFileDialog()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
    <LlmRuntimeBar class="shrink-0" />

    <div
      class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-2 py-1.5"
    >
      <div
        v-for="n in notebook.notebooks"
        :key="n.id"
        class="flex max-w-[11rem] shrink-0 items-stretch rounded-md border text-xs font-medium transition-colors"
        :class="
          notebook.activeNotebookId === n.id
            ? 'border-indigo-500/60 bg-indigo-900/40 text-white'
            : 'border-transparent bg-slate-800/60 text-slate-300'
        "
      >
        <button
          type="button"
          class="min-w-0 flex-1 truncate px-2 py-1 text-left hover:bg-white/5"
          :title="n.ticker ? `${n.title} (${n.ticker})` : n.title"
          @click="notebook.setActiveNotebook(n.id)"
          @dblclick.prevent="openRenameDialog(n.id)"
        >
          {{ n.title }}
        </button>
        <button
          type="button"
          class="flex w-7 shrink-0 items-center justify-center border-l border-slate-700/80 text-slate-500 hover:bg-slate-700/80 hover:text-rose-400"
          title="Fechar caderno"
          @click="onCloseNotebookTab(n.id)"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-md border border-dashed border-slate-600 px-2 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
        title="Novo caderno"
        @click="notebook.addNotebook()"
      >
        +
      </button>
      <span class="ml-2 shrink-0 text-[10px] text-slate-600">duplo clique para renomear</span>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
      <aside class="flex min-h-0 flex-col border-r border-slate-800 p-3">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Fontes</h2>
          <button
            v-if="visibleSources.length"
            type="button"
            class="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
            @click="addAnother"
          >
            Adicionar
          </button>
        </div>
        <ul v-if="visibleSources.length" class="min-h-0 flex-1 space-y-2 overflow-y-auto">
          <li v-for="s in visibleSources" :key="s.id">
            <div class="flex items-start gap-1">
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors"
                :class="
                  store.selectedId === s.id
                    ? 'bg-indigo-900/50 text-white ring-1 ring-indigo-500/60'
                    : 'text-slate-300 hover:bg-slate-800'
                "
                :data-cy="`source-item-${s.id}`"
                @click="store.select(s.id)"
              >
                <div class="flex items-center gap-2">
                  <ProgressSpinner
                    v-if="s.status === 'pending'"
                    class="h-5 w-5 shrink-0"
                    stroke-width="4"
                    style="width: 1.25rem; height: 1.25rem"
                  />
                  <span v-else class="h-5 w-5 shrink-0 rounded bg-slate-700" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate" :title="s.fileName">{{ s.fileName }}</span>
                </div>
                <div v-if="s.status === 'pending' && s.extractionProgress" class="w-full pl-7">
                  <ProgressBar
                    :value="s.extractionProgress.percent"
                    :show-value="true"
                    class="!h-1.5 !text-[10px] !leading-none"
                  />
                  <span
                    class="mt-0.5 block truncate text-[10px] text-slate-400"
                    :title="s.extractionProgress.detail ?? s.extractionProgress.label"
                  >
                    {{ s.extractionProgress.percent }}%
                    <template v-if="s.extractionProgress.etaSeconds != null">
                      · ~{{ s.extractionProgress.etaSeconds }}s
                    </template>
                    — {{ s.extractionProgress.label }}
                  </span>
                </div>
              </button>
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-lg leading-none text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                aria-label="Remover fonte"
                @click.stop="store.remove(s.id)"
              >
                ×
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="text-xs text-slate-500">Nenhuma fonte neste caderno.</p>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col">
        <PdfDropArea
          ref="dropRef"
          :compact="visibleSources.length > 0"
          class="shrink-0"
          @files="onFiles"
        />

        <div v-if="store.selected?.status === 'ready'" class="flex min-h-0 min-w-0 flex-1 flex-col p-2">
          <div class="mb-2 flex gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-xs font-medium"
              :class="panelTab === 'raw' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'"
              @click="panelTab = 'raw'"
            >
              Texto bruto
            </button>
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-xs font-medium"
              :class="panelTab === 'llm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'"
              @click="panelTab = 'llm'"
            >
              Markdown (LLM)
            </button>
          </div>
          <ScrollPanel class="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <pre
              v-show="panelTab === 'raw'"
              data-cy="source-text-panel"
              class="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-200"
              >{{ store.selected.extractedText }}</pre
            >
            <LlmMarkdownPreview
              v-show="panelTab === 'llm'"
              :markdown="store.selected.llmMarkdown"
              :file="store.selected.file"
            />
          </ScrollPanel>
        </div>

        <div
          v-else-if="store.selected?.status === 'error'"
          class="flex flex-1 items-start p-6 text-sm text-amber-300"
          data-cy="source-error-panel"
        >
          {{ store.selected.error }}
        </div>

        <div
          v-else-if="store.selected?.status === 'pending'"
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-slate-300"
        >
          <div class="w-full max-w-lg space-y-4">
            <ProgressBar
              :value="store.selected.extractionProgress?.percent ?? 0"
              :show-value="true"
              class="!h-5"
            />
            <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span class="tabular-nums font-medium text-slate-100">
                {{ store.selected.extractionProgress?.percent ?? 0 }}%
              </span>
              <span
                v-if="store.selected.extractionProgress?.etaSeconds != null"
                class="text-xs text-slate-500"
              >
                ≈ {{ store.selected.extractionProgress.etaSeconds }}s restantes
              </span>
            </div>
            <p
              class="min-h-[2.75rem] text-center text-[11px] leading-relaxed text-slate-400"
              data-cy="extraction-detail"
            >
              {{
                store.selected.extractionProgress?.detail ??
                store.selected.extractionProgress?.label ??
                'A iniciar extração…'
              }}
            </p>
          </div>
        </div>

        <div
          v-else-if="!store.selected && store.sources.some((s) => s.status === 'pending')"
          class="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-slate-400"
        >
          <div class="w-full max-w-lg space-y-3">
            <ProgressBar mode="indeterminate" class="!h-2" />
            <p class="text-center text-sm">A extrair outra fonte…</p>
          </div>
        </div>

        <div
          v-else-if="visibleSources.length"
          class="flex flex-1 items-center justify-center p-6 text-sm text-slate-500"
        >
          Seleciona uma fonte na lista.
        </div>

        <div v-else class="flex min-h-0 flex-1 overflow-auto px-4 py-4">

          <span class="text-xs text-slate-500">Conteúdo do PDF</span>
        </div>
      </section>
    </div>

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
