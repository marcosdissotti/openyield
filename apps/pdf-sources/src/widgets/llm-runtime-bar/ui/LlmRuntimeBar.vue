<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import { useAppShellStore } from '#entities/app-shell'
import LlmStudioModelsDialog from './LlmStudioModelsDialog.vue'

const llm = useLlmRuntimeStore()
const shell = useAppShellStore()
const pickerOpen = ref(false)

function onKey(ev: KeyboardEvent) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'l') {
    ev.preventDefault()
    pickerOpen.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

function eject() {
  llm.clearModelSelection()
}

const statusLabel = computed(() => (llm.connectionStatus === 'ok' ? 'Conectado' : 'Configurar LLM'))
</script>

<template>
  <div class="flex min-w-0 items-center gap-2 text-slate-700">
    <button
      type="button"
      class="flex h-10 min-w-0 max-w-[19rem] items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-left text-sm shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/60"
      title="Modelo LM Studio (Ctrl+L)"
      @click="pickerOpen = true"
    >
      <span
        class="h-2.5 w-2.5 shrink-0 rounded-full"
        :class="
          llm.connectionStatus === 'ok'
            ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]'
            : 'bg-slate-300'
        "
      />
      <span class="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{{ statusLabel }}</span>
      <span class="min-w-0 truncate font-medium text-slate-900">{{ llm.displayModelLabel }}</span>
    </button>
    <button
      type="button"
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
      title="Ajustes do runtime"
      aria-label="Ajustes"
      @click="shell.openSettings()"
    >
      ⚙
    </button>
    <button
      type="button"
      class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 sm:flex"
      title="Limpar modelo seleccionado na app"
      aria-label="Eject"
      @click="eject"
    >
      ⏏
    </button>
    <LlmStudioModelsDialog v-model:visible="pickerOpen" />
  </div>
</template>
