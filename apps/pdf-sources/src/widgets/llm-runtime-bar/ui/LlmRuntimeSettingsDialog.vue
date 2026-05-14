<script setup lang="ts">
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import { LM_STUDIO_DEFAULT_BASE_URL } from '#features/llama-runtime/lib/resolveLlmServerBaseUrl'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const store = useLlmRuntimeStore()
const copyHint = ref<string | null>(null)
let copyHintTimer: ReturnType<typeof setTimeout> | null = null

function close() {
  emit('update:visible', false)
}

async function test() {
  await store.testConnection()
}

function urlToCopy(): string {
  const t = store.llmServerBaseUrl.trim()
  return t || LM_STUDIO_DEFAULT_BASE_URL
}

async function copyLlmUrl() {
  const text = urlToCopy()
  try {
    await navigator.clipboard.writeText(text)
    copyHint.value = 'Copiado para a área de transferência.'
  } catch {
    copyHint.value = 'Não foi possível copiar (permissão do browser).'
  }
  if (copyHintTimer) clearTimeout(copyHintTimer)
  copyHintTimer = setTimeout(() => {
    copyHint.value = null
    copyHintTimer = null
  }, 2500)
}

function useDefaultLmStudioUrl() {
  store.llmServerBaseUrl = LM_STUDIO_DEFAULT_BASE_URL
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Runtime LLM (LM Studio)"
    class="w-[min(480px,95vw)]"
    :pt="{
      root: { class: 'border border-slate-700 bg-slate-900 text-slate-100' },
      header: { class: 'border-b border-slate-800' },
    }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4 p-2 text-sm">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-slate-400"
          >URL base da API (LM Studio). Por defeito
          <code class="text-slate-500">{{ LM_STUDIO_DEFAULT_BASE_URL }}</code>
          — pode copiar e colar aí ou para outra app. Apague o campo para, em dev no browser, usar o proxy
          <code class="text-slate-500">/lm-studio</code>
          (útil se o LM Studio bloquear CORS).</span
        >
        <div class="flex flex-wrap gap-2">
          <InputText
            v-model="store.llmServerBaseUrl"
            :placeholder="LM_STUDIO_DEFAULT_BASE_URL"
            class="min-w-[12rem] flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-100"
          />
          <Button type="button" label="Copiar URL" size="small" severity="secondary" @click="copyLlmUrl" />
          <Button
            type="button"
            label="Usar 127.0.0.1:1234"
            size="small"
            severity="secondary"
            @click="useDefaultLmStudioUrl"
          />
        </div>
        <p v-if="copyHint" class="text-[11px] text-emerald-400/95">{{ copyHint }}</p>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-slate-400"
          >Campo
          <code class="text-slate-500">model</code>
          enviado ao chat (normalmente o id devolvido por
          <code class="text-slate-500">/v1/models</code>
          ). Pode editar manualmente se necessário.</span
        >
        <InputText
          v-model="store.chatModelName"
          placeholder="id do modelo no LM Studio"
          class="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100"
        />
      </label>
      <div class="flex flex-wrap items-center gap-2">
        <Button label="Testar ligação" size="small" :loading="store.connectionStatus === 'checking'" @click="test" />
        <Button label="Detectar modelos" size="small" severity="secondary" @click="store.refreshDiscoveredModels()" />
        <span v-if="store.connectionStatus === 'ok'" class="text-xs text-emerald-400">OK</span>
        <span v-if="store.connectionStatus === 'error'" class="text-xs text-rose-400">{{ store.lastError }}</span>
      </div>
      <p class="text-[11px] leading-relaxed text-slate-500">
        Versão PRO (futuro): escolha entre fornecedores na nuvem (ex.: Gemini, GPT). Por agora só LM Studio local.
      </p>
      <p class="text-[11px] leading-relaxed text-slate-500">
        Token Hugging Face (opcional, outras funcionalidades):
        <code class="text-slate-400">.env</code>
        com
        <code class="text-slate-400">HF_TOKEN</code>
        — proxy
        <code class="text-slate-400">/hf-hub</code>
        em dev.
      </p>
      <div class="flex justify-end">
        <Button label="Fechar" severity="secondary" size="small" @click="close" />
      </div>
    </div>
  </Dialog>
</template>
