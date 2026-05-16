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
  <div class="h-screen min-h-0 overflow-hidden bg-[#edf1f7] text-slate-950">
    <NotebookPage v-if="shell.activeApp === 'pdf'" />
    <LlmRuntimeSettingsDialog v-model:visible="shell.settingsVisible" />
  </div>
</template>
