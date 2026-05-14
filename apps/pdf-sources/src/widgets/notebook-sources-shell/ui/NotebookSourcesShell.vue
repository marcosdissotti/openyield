<script setup lang="ts">
import { ref } from 'vue'
import ScrollPanel from 'primevue/scrollpanel'
import ProgressSpinner from 'primevue/progressspinner'
import ProgressBar from 'primevue/progressbar'
import PdfDropArea from '#features/pdf-drop-area/ui/PdfDropArea.vue'
import { LlmMarkdownPreview } from '#widgets/llm-markdown-preview'
import { usePdfSourcesStore } from '#entities/pdf-source'
import { buildLlmDocumentFromPdf } from '#features/extract-pdf-rich'
import { mapPdfExtractError } from '#shared/lib/mapPdfExtractError'
import { enrichMarkdownWithLlamaVision } from '#features/llama-vision-enrich/lib/enrichMarkdownWithLlamaVision'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import LlmRuntimeBar from '#widgets/llm-runtime-bar/ui/LlmRuntimeBar.vue'

const store = usePdfSourcesStore()
const llmRuntime = useLlmRuntimeStore()
const dropRef = ref<InstanceType<typeof PdfDropArea> | null>(null)
const panelTab = ref<'raw' | 'llm'>('llm')

async function onFiles(files: File[]) {
  for (const file of files) {
    const id = store.addPending(file)
    try {
      const result = await buildLlmDocumentFromPdf(file, {
        onProgress: (p) => store.updateProgress(id, p),
        /* Gráficos vectoriais não disparam detecção de bitmap; OCR página a página recupera rótulos/%. */
        ocrAllPages: true,
      })
      let llmMarkdown = result.llmMarkdown
      if (llmRuntime.canRunVision() && llmRuntime.effectiveServerBase) {
        const modelName = llmRuntime.chatModelName.trim() || 'default'
        try {
          llmMarkdown = await enrichMarkdownWithLlamaVision(file, llmMarkdown, {
            baseUrl: llmRuntime.effectiveServerBase,
            model: modelName,
            onProgress: (p) => store.updateProgress(id, p),
          })
        } catch {
          /* fallback silencioso: mantém markdown sem visão */
        }
      }
      store.complete(id, {
        extractedText: result.rawPlainText,
        llmMarkdown,
      })
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
  <div class="flex h-screen min-h-0 flex-col bg-slate-950 text-slate-100">
    <LlmRuntimeBar class="shrink-0" />
    <div class="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
    <aside class="flex min-h-0 flex-col border-r border-slate-800 p-3">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Fontes</h2>
        <button
          v-if="store.sources.length"
          type="button"
          class="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          @click="addAnother"
        >
          Adicionar
        </button>
      </div>
      <ul v-if="store.sources.length" class="min-h-0 flex-1 space-y-2 overflow-y-auto">
        <li v-for="s in store.sources" :key="s.id">
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
      <p v-else class="text-xs text-slate-500">Nenhuma fonte ainda.</p>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-col">
      <PdfDropArea
        ref="dropRef"
        :compact="store.sources.length > 0"
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
        <ScrollPanel class="min-h-0 flex-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
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
        v-else-if="store.sources.length"
        class="flex flex-1 items-center justify-center p-6 text-sm text-slate-500"
      >
        Seleciona uma fonte na lista.
      </div>

      <div v-else class="min-h-0 flex-1" />
    </section>
  </div>
  </div>
</template>
