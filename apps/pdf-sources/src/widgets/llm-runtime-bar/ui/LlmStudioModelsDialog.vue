<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import ModelCapabilityBadges from './ModelCapabilityBadges.vue'
import { inferModelCapabilitiesFromFileName } from '#features/llama-runtime/lib/inferModelCapabilities'
import { LM_STUDIO_DEFAULT_BASE_URL } from '#features/llama-runtime/lib/resolveLlmServerBaseUrl'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const store = useLlmRuntimeStore()
/** Rascunho no modal — só vai para a store ao premir «Conectar». */
const connectionDraft = ref(LM_STUDIO_DEFAULT_BASE_URL)
const connectBusy = ref(false)
const draftError = ref<string | null>(null)

function close() {
  emit('update:visible', false)
}

function capsForId(id: string) {
  return inferModelCapabilitiesFromFileName(`${id}.gguf`)
}

function normalizePastedUrl(raw: string): string {
  let u = raw.trim().replace(/\/$/, '')
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u
}

watch(
  () => props.visible,
  (open) => {
    if (!open) return
    const saved = store.llmServerBaseUrl.trim()
    connectionDraft.value = saved || LM_STUDIO_DEFAULT_BASE_URL
  },
)

async function connect() {
  draftError.value = null
  const normalized = normalizePastedUrl(connectionDraft.value)
  if (!normalized) {
    draftError.value = 'Cole uma URL válida (ex.: http://127.0.0.1:1234).'
    return
  }
  connectBusy.value = true
  store.llmServerBaseUrl = normalized
  try {
    await store.refreshDiscoveredModels()
  } finally {
    connectBusy.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    header="LM Studio"
    :style="{ width: 'min(440px, 96vw)' }"
    :pt="{
      root: { class: 'border border-slate-800 bg-[#0d0f14] text-slate-100 shadow-2xl' },
      header: { class: 'border-b border-slate-800/90 bg-[#12151c] px-4 py-3 text-sm font-semibold text-slate-200' },
      content: { class: 'p-4' },
    }"
    @update:visible="emit('update:visible', $event)"
  >
    <p class="text-[11px] leading-snug text-slate-500">
      Cole o URL do LM Studio (Developer → server) e prima «Conectar». No browser em dev,
      <code class="text-slate-600">127.0.0.1:1234</code>
      usa o proxy da app (evita CORS). Com
      <strong class="text-slate-400">LM Link</strong>
      activo, o LM Studio pode servir pedidos a localhost com um modelo noutro equipamento — mantenha o URL local do LM Studio.
    </p>

    <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <InputText
        v-model="connectionDraft"
        type="url"
        autocomplete="url"
        :placeholder="LM_STUDIO_DEFAULT_BASE_URL"
        class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600"
        @keydown.enter.prevent="connect()"
      />
      <Button
        type="button"
        label="Conectar"
        class="shrink-0 sm:min-w-[7.5rem]"
        :loading="connectBusy || store.modelsListLoading"
        @click="connect()"
      />
    </div>

    <p v-if="draftError" class="mt-3 text-xs text-amber-400/95">{{ draftError }}</p>
    <p v-if="store.modelsListError" class="mt-3 text-xs leading-relaxed text-rose-400">{{ store.modelsListError }}</p>

    <div v-if="store.discoveredModels.length" class="mt-4">
      <p class="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Modelo carregado</p>
      <ul class="max-h-[min(280px,45vh)] divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
        <li v-for="m in store.discoveredModels" :key="m.id">
          <button
            type="button"
            class="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-slate-800/60"
            :class="store.chatModelName === m.id ? 'bg-indigo-950/40' : ''"
            @click="store.setChatModelId(m.id); close()"
          >
            <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-100">{{ m.id }}</span>
            <ModelCapabilityBadges class="shrink-0" :caps="capsForId(m.id)" mode="icons" />
            <span class="shrink-0 rounded bg-indigo-900/50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-200">Usar</span>
          </button>
        </li>
      </ul>
    </div>
    <p
      v-else-if="!connectBusy && !store.modelsListLoading && !store.modelsListError && !draftError"
      class="mt-4 text-center text-xs text-slate-500"
    >
      Ainda sem modelos. Depois de conectar, carregue um modelo no LM Studio e volte a premir «Conectar».
    </p>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
      <Button
        type="button"
        label="Actualizar lista"
        size="small"
        severity="secondary"
        :loading="store.modelsListLoading"
        :disabled="connectBusy"
        @click="store.refreshDiscoveredModels()"
      />
      <Button label="Fechar" type="button" severity="secondary" size="small" @click="close" />
    </div>
  </Dialog>
</template>
