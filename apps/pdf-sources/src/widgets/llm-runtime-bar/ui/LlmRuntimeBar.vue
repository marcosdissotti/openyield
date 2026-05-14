<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useLlmRuntimeStore } from '#entities/llm-runtime'
import LlmStudioModelsDialog from './LlmStudioModelsDialog.vue'
import LlmRuntimeSettingsDialog from './LlmRuntimeSettingsDialog.vue'

const llm = useLlmRuntimeStore()
const pickerOpen = ref(false)
const settingsOpen = ref(false)

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
</script>

<template>
  <div
    class="flex items-center gap-2 border-b border-slate-800 bg-slate-950/90 px-3 py-2 text-slate-200 backdrop-blur"
  >
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm hover:border-slate-500"
      title="Modelo LM Studio (Ctrl+L)"
      @click="pickerOpen = true"
    >
      <span class="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">LM</span>
      <span class="min-w-0 flex-1 truncate font-medium text-slate-100">{{ llm.displayModelLabel }}</span>
      <span class="shrink-0 text-slate-500">▾</span>
    </button>
    <button
      type="button"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
      title="Ajustes do runtime"
      aria-label="Ajustes"
      @click="settingsOpen = true"
    >
      ⚙
    </button>
    <button
      type="button"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
      title="Limpar modelo seleccionado na app"
      aria-label="Eject"
      @click="eject"
    >
      ⏏
    </button>
    <LlmStudioModelsDialog v-model:visible="pickerOpen" />
    <LlmRuntimeSettingsDialog v-model:visible="settingsOpen" />
  </div>
</template>
