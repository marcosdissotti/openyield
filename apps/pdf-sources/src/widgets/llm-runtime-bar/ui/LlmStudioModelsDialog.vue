<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import { LM_STUDIO_DEFAULT_BASE_URL } from '#features/llama-runtime/lib/resolveLlmServerBaseUrl'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const store = useLlmRuntimeStore()
/** Rascunho no modal — só vai para a store ao premir «Conectar». */
const connectionDraft = ref(LM_STUDIO_DEFAULT_BASE_URL)
const connectBusy = ref(false)
const draftError = ref<string | null>(null)

const detectedModel = computed(() => store.chatModelName.trim())
const isConnected = computed(() => !!detectedModel.value && store.connectionStatus === 'ok')
const usableModelCount = computed(
  () => store.discoveredModels.filter((m) => !/embed|embedding|rerank/i.test(m.id)).length,
)
const statusLabel = computed(() => {
  if (connectBusy.value || store.modelsListLoading || store.connectionStatus === 'checking') return 'Conectando'
  if (isConnected.value) return 'Conectado'
  if (store.connectionStatus === 'error') return 'Desconectado'
  return 'Não conectado'
})
const statusClass = computed(() => {
  if (connectBusy.value || store.modelsListLoading || store.connectionStatus === 'checking') {
    return 'border-sky-900/60 bg-sky-950/30 text-sky-200'
  }
  if (isConnected.value) {
    return 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200'
  }
  if (store.connectionStatus === 'error') return 'border-rose-900/60 bg-rose-950/30 text-rose-200'
  return 'border-slate-800 bg-slate-950/70 text-slate-400'
})

function close() {
  emit('update:visible', false)
}

function disconnect() {
  draftError.value = null
  store.disconnect()
}

function normalizePastedUrl(raw: string): string {
  let u = raw.trim().replace(/\/$/, '')
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u
}

watch(
  () => props.visible,
  (open, _oldOpen, onCleanup) => {
    if (!open) return
    const saved = store.llmServerBaseUrl.trim()
    connectionDraft.value = saved || LM_STUDIO_DEFAULT_BASE_URL
    if (isConnected.value) {
      void store.refreshDiscoveredModels({ silent: true })
    }
    const timer = window.setInterval(() => {
      if (!props.visible || !isConnected.value || store.modelsListLoading || connectBusy.value) return
      void store.refreshDiscoveredModels({ silent: true })
    }, 4000)
    onCleanup(() => window.clearInterval(timer))
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
  store.setLlmApiToken(store.llmApiToken.trim())
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
    :closable="false"
    :style="{ width: 'min(440px, 96vw)' }"
    :pt="{
      root: { class: 'border border-slate-800 bg-[#0d0f14] text-slate-100 shadow-2xl' },
      header: { class: 'border-b border-slate-800/90 bg-[#12151c] px-4 py-3' },
      content: { class: 'p-0' },
    }"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="text-sm font-semibold text-slate-100">Conexão LLM</span>
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

    <div class="space-y-4 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
      <span
        class="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium"
        :class="statusClass"
      >
        <span
          class="h-2 w-2 rounded-full"
          :class="{
            'bg-sky-300': connectBusy || store.modelsListLoading || store.connectionStatus === 'checking',
            'bg-emerald-300': isConnected,
            'bg-rose-300': store.connectionStatus === 'error',
            'bg-slate-500': store.connectionStatus === 'idle',
          }"
        />
        {{ statusLabel }}
      </span>
      <span v-if="store.effectiveServerBase" class="max-w-full truncate font-mono text-[10px] text-slate-500">
        {{ store.effectiveServerBase }}
      </span>
      </div>

      <p class="text-[11px] leading-snug text-slate-500">
        Cole o URL do servidor OpenAI-compatible. No browser em dev,
        <code class="text-slate-600">127.0.0.1:1234</code> usa o proxy da app.
      </p>

      <div class="grid gap-2">
        <InputText
          v-model="connectionDraft"
          type="url"
          autocomplete="url"
          :placeholder="LM_STUDIO_DEFAULT_BASE_URL"
          class="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600"
          @keydown.enter.prevent="isConnected ? disconnect() : connect()"
        />

        <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <InputText
            :model-value="store.llmApiToken"
            :type="store.llmApiTokenVisible ? 'text' : 'password'"
            autocomplete="off"
            placeholder="Token da API (opcional)"
            class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600"
            @update:model-value="store.setLlmApiToken(String($event))"
            @keydown.enter.prevent="isConnected ? disconnect() : connect()"
          />
          <Button
            type="button"
            :label="store.llmApiTokenVisible ? 'Ocultar' : 'Mostrar'"
            severity="secondary"
            class="shrink-0"
            @click="store.llmApiTokenVisible = !store.llmApiTokenVisible"
          />
          <Button
            type="button"
            :label="isConnected ? 'Desconectar' : 'Conectar'"
            :severity="isConnected ? 'secondary' : undefined"
            class="shrink-0 min-w-[8rem]"
            :loading="connectBusy || store.modelsListLoading"
            @click="isConnected ? disconnect() : connect()"
          />
        </div>
      </div>

      <p v-if="draftError" class="text-xs text-amber-400/95">{{ draftError }}</p>
      <p v-if="store.modelsListError" class="text-xs leading-relaxed text-rose-400">{{ store.modelsListError }}</p>

      <div v-if="detectedModel" class="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-3">
        <p class="text-[10px] font-medium uppercase tracking-wide text-emerald-300/80">Modelo detectado</p>
        <p class="mt-1 truncate font-mono text-xs text-slate-100">{{ detectedModel }}</p>
        <p class="mt-1 text-[11px] leading-snug text-slate-500">
          A app escolheu automaticamente um modelo compatível da API.
        </p>
      </div>
      <p
        v-else-if="store.discoveredModels.length && !usableModelCount && !connectBusy && !store.modelsListLoading"
        class="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-3 text-xs leading-relaxed text-amber-200/90"
      >
        A API respondeu, mas só foram encontrados modelos de embedding. Carregue um modelo de chat/visão no servidor e conecte novamente.
      </p>
      <p
        v-else-if="!connectBusy && !store.modelsListLoading && !store.modelsListError && !draftError"
        class="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3 text-center text-xs text-slate-500"
      >
        Ao conectar, a app identifica o modelo automaticamente pela API.
      </p>
    </div>
  </Dialog>
</template>
