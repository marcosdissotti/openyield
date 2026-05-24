<script setup lang="ts">
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useNotebookStore } from '#entities/notebook'

const notebook = useNotebookStore()

const renameOpen = ref(false)
const renameNotebookId = ref<string | null>(null)
const renameTitle = ref('')
const renameTicker = ref('')

function notebookDisplayTitle(n: { title: string; ticker?: string | null }) {
  return n.ticker ? `${n.title} (${n.ticker})` : n.title
}

function openRenameDialog(notebookId: string) {
  const n = notebook.notebooks.find((x) => x.id === notebookId)
  if (!n) return
  renameNotebookId.value = notebookId
  renameTitle.value = n.title
  renameTicker.value = n.ticker ?? ''
  renameOpen.value = true
}

async function applyRename() {
  const id = renameNotebookId.value
  if (!id) return
  const title = renameTitle.value.trim() || 'Caderno'
  const tickerRaw = renameTicker.value.trim()
  const ticker = tickerRaw ? tickerRaw.toUpperCase().replace(/\s+/g, '') : null
  await notebook.updateNotebookMeta(id, title, ticker)
  renameOpen.value = false
}

async function onCloseNotebookTab(notebookId: string) {
  const n = notebook.notebooks.find((x) => x.id === notebookId)
  const msg = n ? `Fechar o caderno «${n.title}»?` : 'Fechar este caderno?'
  if (!window.confirm(msg)) return
  await notebook.deleteNotebookById(notebookId)
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-1">
    <div
      v-for="n in notebook.notebooks"
      :key="n.id"
      class="flex max-w-[12rem] shrink-0 items-stretch overflow-hidden rounded-full border text-xs font-medium transition"
      :class="
        notebook.activeNotebookId === n.id
          ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
      "
    >
      <button
        type="button"
        class="min-w-0 flex-1 truncate px-3 py-2 text-left"
        :title="notebookDisplayTitle(n)"
        @click="notebook.setActiveNotebook(n.id)"
        @dblclick.prevent="openRenameDialog(n.id)"
      >
        {{ n.title }}
      </button>
      <button
        type="button"
        class="w-7 shrink-0 border-l border-white/15 text-current opacity-60 transition hover:bg-white/10 hover:opacity-100"
        title="Fechar caderno"
        @click="onCloseNotebookTab(n.id)"
      >
        ×
      </button>
    </div>
    <button
      type="button"
      class="h-9 shrink-0 rounded-full border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700"
      title="Novo caderno"
      @click="notebook.addNotebook()"
    >
      +
    </button>
    <span class="hidden shrink-0 text-[10px] text-slate-400 lg:inline">duplo clique para renomear</span>
  </div>

  <Dialog
    v-model:visible="renameOpen"
    modal
    header="Renomear caderno"
    class="w-[min(420px,95vw)]"
    :pt="{
      root: { class: 'border border-slate-200 bg-white text-slate-950' },
      header: { class: 'border-b border-slate-200' },
    }"
  >
    <div class="flex flex-col gap-3 p-2 text-sm">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-slate-500">Nome na aba (ex.: CSMG3)</span>
        <InputText v-model="renameTitle" class="rounded border border-slate-300 px-2 py-1.5" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-slate-500">Ticker opcional</span>
        <InputText v-model="renameTicker" class="rounded border border-slate-300 px-2 py-1.5 font-mono text-sm" />
      </label>
      <div class="flex justify-end gap-2">
        <Button type="button" label="Cancelar" size="small" severity="secondary" @click="renameOpen = false" />
        <Button type="button" label="Guardar" size="small" @click="applyRename" />
      </div>
    </div>
  </Dialog>
</template>
