<script setup lang="ts">
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import LlmRuntimeSettingsPanel from './LlmRuntimeSettingsPanel.vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

function close() {
  emit('update:visible', false)
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
    <div class="p-2">
      <LlmRuntimeSettingsPanel :active="visible" />
    </div>
    <template #footer>
      <Button label="Fechar" severity="secondary" size="small" @click="close" />
    </template>
  </Dialog>
</template>
