<script setup lang="ts">
import { onBeforeMount } from 'vue'
import { useAppShellStore } from '#entities/app-shell'
import { NotebookPage } from '#pages'
import LlmRuntimeSettingsDialog from '#widgets/llm-runtime-bar/ui/LlmRuntimeSettingsDialog.vue'
import { bootstrapPdfWorkspace } from '#features/pdf-persistence/bootstrapWorkspace'

const shell = useAppShellStore()

onBeforeMount(() => {
  void bootstrapPdfWorkspace()
})
</script>

<template>
  <div class="flex h-screen min-h-0 bg-slate-950 text-slate-100">
    <!-- Activity rail (LM Studio–style) -->
    <nav
      class="flex w-[52px] shrink-0 flex-col items-stretch border-r border-slate-800/90 bg-[#1a1a1a] py-2"
      aria-label="Aplicações"
    >
      <div class="flex flex-col items-center gap-1 px-1">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 transition-colors"
          :class="
            shell.activeApp === 'pdf'
              ? 'bg-slate-700/90 text-white ring-1 ring-slate-500/50'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
          "
          title="Fontes PDF"
          aria-label="Fontes PDF"
          @click="shell.setActiveApp('pdf')"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M8 7V3h8v4" />
            <path d="M8 11h8" />
            <path d="M7 21h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
        <button
          type="button"
          disabled
          class="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-lg text-slate-600 opacity-50"
          title="Em breve"
          aria-disabled="true"
        >
          <span class="font-mono text-sm">&gt;_</span>
        </button>
      </div>
      <div class="flex flex-1 flex-col" />
      <div class="flex flex-col items-center gap-2 px-1 pb-1">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          title="Configurações"
          aria-label="Configurações"
          @click="shell.openSettings()"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.61V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.61 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.61-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.61-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.61V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.61 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c0 .69.41 1.32 1.05 1.61H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.61 1Z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </nav>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <NotebookPage v-if="shell.activeApp === 'pdf'" />
    </div>

    <LlmRuntimeSettingsDialog v-model:visible="shell.settingsVisible" />
  </div>
</template>
