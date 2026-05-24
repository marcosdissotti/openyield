<script setup lang="ts">
import { useAppShellStore } from '#entities/app-shell'

const shell = useAppShellStore()
</script>

<template>
  <nav
    class="flex w-[72px] shrink-0 flex-col items-center border-r border-slate-200 bg-white py-4"
    aria-label="Aplicações"
  >
    <div class="flex w-full flex-col items-center gap-3 px-2">
      <button
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-xl transition"
        :class="
          shell.activeApp === 'pdf'
            ? 'bg-slate-950 text-white shadow-md'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
        "
        title="OpenYield"
        aria-label="OpenYield"
        @click="shell.setActiveApp('pdf')"
      >
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke-linecap="round" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </svg>
      </button>

      <button
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-xl transition"
        :class="
          shell.activeApp === 'fcd'
            ? 'bg-slate-950 text-white shadow-md'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
        "
        title="FCD — Fluxo de Caixa Descontado"
        aria-label="FCD"
        @click="shell.setActiveApp('fcd')"
      >
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M4 20V10" stroke-linecap="round" />
          <path d="M10 20V4" stroke-linecap="round" />
          <path d="M16 20v-6" stroke-linecap="round" />
          <path d="M22 20V8" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="flex-1" />

    <button
      type="button"
      class="mb-1 flex h-12 w-12 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      title="Configurações"
      aria-label="Configurações"
      @click="shell.openSettings()"
    >
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path
          d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.61V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.61 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.61-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.61-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.61V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.61 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c0 .69.41 1.32 1.05 1.61H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.61 1Z"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </nav>
</template>
