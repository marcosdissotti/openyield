<script setup lang="ts">
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import LlmRuntimeSettingsPanel from '#widgets/llm-runtime-bar/ui/LlmRuntimeSettingsPanel.vue'
import {
  applyImportedPackToApp,
  collectLocalSnapshotsForExport,
  exportWorkspacePack,
  importWorkspacePack,
  isWorkspacePackAvailable,
  workspacePackUnavailableReason,
  type WorkspacePackImportMode,
} from '#features/workspace-pack/lib/workspacePackClient'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

type SettingsSection = 'data' | 'llm'

const activeSection = ref<SettingsSection>('data')
const includeLlmSettings = ref(true)
const includeLocalSnapshots = ref(true)
const importMode = ref<WorkspacePackImportMode>('replace')
const exportBusy = ref(false)
const importBusy = ref(false)
const statusMessage = ref<string | null>(null)
const statusKind = ref<'info' | 'success' | 'error'>('info')

const llmStore = useLlmRuntimeStore()
const packAvailable = computed(() => isWorkspacePackAvailable())
const packUnavailableReason = computed(() => workspacePackUnavailableReason())

const navItems: Array<{ id: SettingsSection; label: string; hint: string }> = [
  { id: 'data', label: 'Dados Vectra', hint: 'Importar e exportar' },
  { id: 'llm', label: 'Runtime LLM', hint: 'LM Studio e tokens' },
]

const primaryBtnClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500'
const secondaryBtnClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40'

function close() {
  emit('update:visible', false)
}

function setStatus(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  statusMessage.value = message
  statusKind.value = kind
}

async function onExport() {
  if (!packAvailable.value) {
    setStatus(packUnavailableReason.value ?? 'Exportação indisponível.', 'error')
    return
  }
  exportBusy.value = true
  setStatus('A preparar pacote…')
  try {
    const result = await exportWorkspacePack({
      includeLlmSettings: includeLlmSettings.value,
      includeLocalSnapshots: includeLocalSnapshots.value,
      llmSettings: llmStore.exportSettings() as unknown as Record<string, unknown>,
      localSnapshots: collectLocalSnapshotsForExport(),
    })
    if (result.canceled) {
      setStatus('Exportação cancelada.', 'info')
      return
    }
    setStatus(`Pacote guardado: ${result.path ?? 'ficheiro escolhido'}`, 'success')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Falha ao exportar.', 'error')
  } finally {
    exportBusy.value = false
  }
}

async function onImport() {
  if (!packAvailable.value) {
    setStatus(packUnavailableReason.value ?? 'Importação indisponível.', 'error')
    return
  }
  importBusy.value = true
  setStatus('A importar pacote…')
  try {
    const result = await importWorkspacePack(importMode.value)
    if (result.canceled) {
      setStatus('Importação cancelada.', 'info')
      return
    }
    await applyImportedPackToApp(result.manifest, result.activeNotebookId)
    const modeLabel = result.mode === 'merge' ? 'mesclado' : 'substituído'
    setStatus(`Pacote "${result.fileName}" importado (${modeLabel}).`, 'success')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Falha ao importar.', 'error')
  } finally {
    importBusy.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    :closable="false"
    :style="{ width: 'min(760px, 96vw)' }"
    :pt="{
      root: { class: 'border border-slate-800 bg-[#0d0f14] text-slate-100 shadow-2xl' },
      header: { class: 'border-b border-slate-800/90 bg-[#12151c] px-4 py-3' },
      content: { class: 'p-0' },
      footer: { class: 'border-t border-slate-800/90 bg-[#12151c] px-4 py-3' },
    }"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="text-sm font-semibold text-slate-100">Configurações</span>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          title="Fechar"
          aria-label="Fechar"
          @click="close"
        >
          ×
        </button>
      </div>
    </template>

    <div class="flex min-h-[460px]">
      <nav class="flex w-48 shrink-0 flex-col gap-1 border-r border-slate-800/90 bg-[#0a0c10] p-3">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="rounded-lg px-3 py-2.5 text-left transition-colors"
          :class="
            activeSection === item.id
              ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-700'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          "
          @click="activeSection = item.id"
        >
          <span class="block text-sm font-medium">{{ item.label }}</span>
          <span class="mt-0.5 block text-[10px] text-slate-500">{{ item.hint }}</span>
        </button>
      </nav>

      <div class="min-w-0 flex-1 overflow-y-auto p-5">
        <section v-if="activeSection === 'data'" class="space-y-5">
          <div>
            <h3 class="text-base font-semibold text-slate-100">Partilhar análises</h3>
            <p class="mt-1.5 text-xs leading-relaxed text-slate-400">
              Exporta ou importa um pacote
              <code class="rounded bg-slate-900 px-1 py-0.5 text-slate-300">.openyield.zip</code>
              com notebooks, PDFs, índice Vectra, relatórios e snapshots de valuation.
            </p>
          </div>

          <div
            v-if="packUnavailableReason"
            class="rounded-lg border border-amber-800/60 bg-amber-950/25 px-3 py-2.5 text-xs leading-relaxed text-amber-100/90"
          >
            {{ packUnavailableReason }}
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <article class="flex flex-col rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <h4 class="text-sm font-semibold text-slate-100">Exportar</h4>
              <p class="mt-1 text-xs leading-relaxed text-slate-500">
                Gera um ficheiro para partilhar com outros utilizadores OpenYield.
              </p>

              <div class="mt-4 space-y-2.5">
                <label class="flex cursor-pointer items-start gap-2.5 text-xs text-slate-300">
                  <input
                    v-model="includeLlmSettings"
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/40"
                    :disabled="!packAvailable"
                  />
                  <span>Incluir configurações LLM (URL, modelo, tokens)</span>
                </label>
                <label class="flex cursor-pointer items-start gap-2.5 text-xs text-slate-300">
                  <input
                    v-model="includeLocalSnapshots"
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/40"
                    :disabled="!packAvailable"
                  />
                  <span>Incluir snapshots locais (Graham, Graham Number, FCD)</span>
                </label>
              </div>

              <button
                type="button"
                :class="[primaryBtnClass, 'mt-auto pt-4']"
                :disabled="exportBusy"
                @click="onExport"
              >
                <span v-if="exportBusy">A exportar…</span>
                <span v-else>Exportar pacote</span>
              </button>
            </article>

            <article class="flex flex-col rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <h4 class="text-sm font-semibold text-slate-100">Importar</h4>
              <p class="mt-1 text-xs leading-relaxed text-slate-500">
                Carrega um pacote partilhado por outro utilizador.
              </p>

              <div class="mt-4 space-y-2.5 text-xs text-slate-300">
                <label class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-800 px-3 py-2 transition-colors hover:bg-slate-900/60">
                  <input
                    v-model="importMode"
                    type="radio"
                    value="merge"
                    class="mt-0.5 h-4 w-4 border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/40"
                    :disabled="!packAvailable"
                  />
                  <span>
                    <span class="font-medium text-slate-100">Mesclar</span>
                    <span class="mt-0.5 block text-slate-500">Adiciona notebooks novos sem apagar os existentes.</span>
                  </span>
                </label>
                <label class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-800 px-3 py-2 transition-colors hover:bg-slate-900/60">
                  <input
                    v-model="importMode"
                    type="radio"
                    value="replace"
                    class="mt-0.5 h-4 w-4 border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/40"
                    :disabled="!packAvailable"
                  />
                  <span>
                    <span class="font-medium text-slate-100">Substituir tudo</span>
                    <span class="mt-0.5 block text-slate-500">Apaga os dados actuais e usa só o pacote importado.</span>
                  </span>
                </label>
              </div>

              <button
                type="button"
                :class="[secondaryBtnClass, 'mt-auto pt-4']"
                :disabled="importBusy"
                @click="onImport"
              >
                <span v-if="importBusy">A importar…</span>
                <span v-else>Importar pacote</span>
              </button>
            </article>
          </div>

          <p
            v-if="statusMessage"
            class="rounded-lg border px-3 py-2 text-xs leading-relaxed"
            :class="{
              'border-emerald-800/60 bg-emerald-950/25 text-emerald-200': statusKind === 'success',
              'border-rose-800/60 bg-rose-950/25 text-rose-200': statusKind === 'error',
              'border-slate-800 bg-slate-950/50 text-slate-400': statusKind === 'info',
            }"
          >
            {{ statusMessage }}
          </p>
        </section>

        <section v-else>
          <h3 class="mb-4 text-base font-semibold text-slate-100">Runtime LLM (LM Studio)</h3>
          <LlmRuntimeSettingsPanel :active="visible && activeSection === 'llm'" />
        </section>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <button type="button" :class="secondaryBtnClass" @click="close">Fechar</button>
      </div>
    </template>
  </Dialog>
</template>
