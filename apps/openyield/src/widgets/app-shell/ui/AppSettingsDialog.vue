<script setup lang="ts">
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import LlmRuntimeSettingsPanel from '#widgets/llm-runtime-bar/ui/LlmRuntimeSettingsPanel.vue'
import {
  applyImportedPackToApp,
  collectLocalSnapshotsForExport,
  exportWorkspacePack,
  importWorkspacePack,
  isWorkspacePackAvailable,
  type WorkspacePackImportMode,
} from '#features/workspace-pack/lib/workspacePackClient'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

type SettingsSection = 'data' | 'llm'

const activeSection = ref<SettingsSection>('data')
const includeLlmSettings = ref(true)
const includeLocalSnapshots = ref(true)
const importMode = ref<WorkspacePackImportMode>('merge')
const busy = ref(false)
const statusMessage = ref<string | null>(null)
const statusKind = ref<'info' | 'success' | 'error'>('info')

const llmStore = useLlmRuntimeStore()
const packAvailable = isWorkspacePackAvailable()

const navItems: Array<{ id: SettingsSection; label: string; hint: string }> = [
  { id: 'data', label: 'Dados Vectra', hint: 'Importar e exportar análises' },
  { id: 'llm', label: 'Runtime LLM', hint: 'LM Studio e tokens' },
]

function close() {
  emit('update:visible', false)
}

function setStatus(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  statusMessage.value = message
  statusKind.value = kind
}

async function onExport() {
  if (!packAvailable) {
    setStatus('Exportação só disponível na app desktop (Electron).', 'error')
    return
  }
  busy.value = true
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
    setStatus(`Pacote guardado em ${result.path ?? 'ficheiro escolhido'}.`, 'success')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Falha ao exportar.', 'error')
  } finally {
    busy.value = false
  }
}

async function onImport() {
  if (!packAvailable) {
    setStatus('Importação só disponível na app desktop (Electron).', 'error')
    return
  }
  busy.value = true
  setStatus('A importar pacote…')
  try {
    const result = await importWorkspacePack(importMode.value)
    if (result.canceled) {
      setStatus('Importação cancelada.', 'info')
      return
    }
    await applyImportedPackToApp(result.manifest)
    const modeLabel = result.mode === 'merge' ? 'mesclado' : 'substituído'
    setStatus(`Pacote "${result.fileName}" importado (${modeLabel}).`, 'success')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Falha ao importar.', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Configurações"
    class="w-[min(720px,95vw)]"
    :pt="{
      root: { class: 'border border-slate-700 bg-slate-900 text-slate-100' },
      header: { class: 'border-b border-slate-800' },
    }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex min-h-[420px] gap-0 overflow-hidden rounded-lg border border-slate-800">
      <nav class="flex w-44 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60 p-2">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="rounded-md px-3 py-2 text-left transition-colors"
          :class="
            activeSection === item.id
              ? 'bg-slate-800 text-slate-100'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          "
          @click="activeSection = item.id"
        >
          <span class="block text-sm font-medium">{{ item.label }}</span>
          <span class="mt-0.5 block text-[10px] leading-snug text-slate-500">{{ item.hint }}</span>
        </button>
      </nav>

      <div class="min-w-0 flex-1 overflow-y-auto p-4">
        <section v-if="activeSection === 'data'" class="flex flex-col gap-4 text-sm">
          <div>
            <h3 class="text-base font-medium text-slate-100">Partilhar análises</h3>
            <p class="mt-1 text-xs leading-relaxed text-slate-400">
              Exporta ou importa um pacote
              <code class="text-slate-500">.openyield.zip</code>
              com notebooks, PDFs, índice Vectra, relatórios e snapshots de valuation (Graham, FCD, etc.).
            </p>
          </div>

          <div
            v-if="!packAvailable"
            class="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90"
          >
            Importar e exportar só funciona na app desktop. No browser podes configurar o LLM, mas os dados Vectra
            ficam no disco local do Electron.
          </div>

          <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <h4 class="text-sm font-medium text-slate-200">Exportar</h4>
            <p class="mt-1 text-xs text-slate-500">Gera um ficheiro para partilhar com outros utilizadores OpenYield.</p>
            <div class="mt-3 flex flex-col gap-2">
              <label class="flex items-start gap-2 text-xs text-slate-300">
                <Checkbox v-model="includeLlmSettings" binary input-id="pack-llm" :disabled="!packAvailable" />
                <span>Incluir configurações LLM (URL, modelo, tokens)</span>
              </label>
              <label class="flex items-start gap-2 text-xs text-slate-300">
                <Checkbox v-model="includeLocalSnapshots" binary input-id="pack-snap" :disabled="!packAvailable" />
                <span>Incluir snapshots locais (Graham, Graham Number, FCD fallback)</span>
              </label>
            </div>
            <Button
              class="mt-3"
              label="Exportar pacote…"
              size="small"
              :loading="busy"
              :disabled="!packAvailable"
              @click="onExport"
            />
          </div>

          <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <h4 class="text-sm font-medium text-slate-200">Importar</h4>
            <p class="mt-1 text-xs text-slate-500">Carrega um pacote partilhado por outro utilizador.</p>
            <div class="mt-3 flex flex-col gap-2 text-xs text-slate-300">
              <label class="flex cursor-pointer items-start gap-2">
                <input v-model="importMode" type="radio" value="merge" class="mt-0.5" :disabled="!packAvailable" />
                <span>
                  <strong class="font-medium text-slate-200">Mesclar</strong>
                  — adiciona notebooks e documentos novos sem apagar os existentes.
                </span>
              </label>
              <label class="flex cursor-pointer items-start gap-2">
                <input v-model="importMode" type="radio" value="replace" class="mt-0.5" :disabled="!packAvailable" />
                <span>
                  <strong class="font-medium text-slate-200">Substituir tudo</strong>
                  — apaga os dados Vectra actuais e usa só o pacote importado.
                </span>
              </label>
            </div>
            <Button
              class="mt-3"
              label="Importar pacote…"
              size="small"
              severity="secondary"
              :loading="busy"
              :disabled="!packAvailable"
              @click="onImport"
            />
          </div>

          <p
            v-if="statusMessage"
            class="text-xs"
            :class="{
              'text-emerald-400': statusKind === 'success',
              'text-rose-400': statusKind === 'error',
              'text-slate-400': statusKind === 'info',
            }"
          >
            {{ statusMessage }}
          </p>
        </section>

        <section v-else>
          <h3 class="mb-3 text-base font-medium text-slate-100">Runtime LLM (LM Studio)</h3>
          <LlmRuntimeSettingsPanel :active="visible && activeSection === 'llm'" />
        </section>
      </div>
    </div>

    <template #footer>
      <Button label="Fechar" severity="secondary" size="small" @click="close" />
    </template>
  </Dialog>
</template>
