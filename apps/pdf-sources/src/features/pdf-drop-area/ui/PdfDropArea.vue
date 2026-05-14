<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: false },
)

const emit = defineEmits<{
  files: [File[]]
}>()

const inputRef = ref<HTMLInputElement | null>(null)

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const raw = [...(e.dataTransfer?.files ?? [])]
  const files = raw.filter(isPdf)
  if (files.length) emit('files', files)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])].filter(isPdf)
  if (files.length) emit('files', files)
  input.value = ''
}

function openFileDialog() {
  inputRef.value?.click()
}

defineExpose({ openFileDialog })
</script>

<template>
  <div
    data-cy="pdf-drop-area"
    class="flex w-full flex-col items-center justify-center rounded-xl border border-dashed transition-colors"
    :class="
      props.compact
        ? 'border-slate-700 bg-slate-900/40 px-4 py-3'
        : 'min-h-[220px] flex-1 border-slate-600 bg-slate-900/30 p-8'
    "
    @drop="onDrop"
    @dragover="onDragOver"
  >
    <input
      ref="inputRef"
      type="file"
      accept="application/pdf,.pdf"
      class="hidden"
      multiple
      @change="onFileChange"
    />
    <p class="mb-3 text-center text-sm text-slate-400">
      {{ props.compact ? 'Arraste PDFs aqui ou escolha ficheiros.' : 'Largue um PDF aqui ou clique para escolher.' }}
    </p>
    <button
      type="button"
      class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      @click="openFileDialog"
    >
      Escolher PDF
    </button>
  </div>
</template>
