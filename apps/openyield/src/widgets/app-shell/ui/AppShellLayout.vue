<script setup lang="ts">
import { onBeforeMount } from 'vue'
import { useAppShellStore } from '#entities/app-shell'
import { NotebookPage, FcdPage } from '#pages'
import AppActivityRail from '#widgets/app-shell/ui/AppActivityRail.vue'
import AppTitleBar from '#widgets/app-shell/ui/AppTitleBar.vue'
import AppSettingsDialog from '#widgets/app-shell/ui/AppSettingsDialog.vue'
import { bootstrapPdfWorkspace } from '#features/pdf-persistence/bootstrapWorkspace'

const shell = useAppShellStore()

onBeforeMount(() => {
  void bootstrapPdfWorkspace()
})
</script>

<template>
  <div class="flex h-screen min-h-0 flex-col overflow-hidden bg-[#edf1f7] text-slate-950">
    <AppTitleBar />
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <AppActivityRail />
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <NotebookPage v-if="shell.activeApp === 'pdf'" />
        <FcdPage v-else-if="shell.activeApp === 'fcd'" class="min-h-0 flex-1" />
      </div>
      <AppSettingsDialog v-model:visible="shell.settingsVisible" />
    </div>
  </div>
</template>
