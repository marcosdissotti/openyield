<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { isElectronDesktop } from '#shared/lib/isElectronDesktop'

import pkg from '../../../../package.json'
import appIconUrl from '../../../assets/oy-icon.png'
import OpenYieldLogo from '#shared/ui/OpenYieldLogo.vue'

const showTitleBar = isElectronDesktop()
const isMaximized = ref(false)

let disposeMaximizedListener: (() => void) | undefined

onMounted(async () => {
  const api = window.pdfSourcesElectron
  if (!api?.windowIsMaximized) return

  isMaximized.value = await api.windowIsMaximized()
  disposeMaximizedListener = api.onWindowMaximizedChanged?.((maximized) => {
    isMaximized.value = maximized
  })
})

onBeforeUnmount(() => {
  disposeMaximizedListener?.()
})

function minimize() {
  window.pdfSourcesElectron?.windowMinimize?.()
}

function toggleMaximize() {
  window.pdfSourcesElectron?.windowMaximize?.()
}

function closeWindow() {
  window.pdfSourcesElectron?.windowClose?.()
}
</script>

<template>
  <header
    v-if="showTitleBar"
    class="title-bar flex h-8 shrink-0 select-none items-stretch bg-black text-[13px] text-white"
  >
    <div
      class="title-bar-drag flex min-w-0 flex-1 items-center gap-2 px-3"
      @dblclick="toggleMaximize"
    >
      <img
        :src="appIconUrl"
        alt=""
        class="h-4 w-4 shrink-0 rounded-[3px] object-cover"
        aria-hidden="true"
      />
      <OpenYieldLogo size="sm" theme="dark" />
      <span class="truncate font-medium tracking-tight text-white/70">— {{ pkg.version }}</span>
    </div>

    <div class="title-bar-controls flex shrink-0 items-stretch">
      <button
        type="button"
        class="title-bar-btn flex w-11 items-center justify-center transition hover:bg-white/10"
        aria-label="Minimizar"
        @click="minimize"
      >
        <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 9.5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>

      <button
        type="button"
        class="title-bar-btn flex w-11 items-center justify-center transition hover:bg-white/10"
        :aria-label="isMaximized ? 'Restaurar' : 'Maximizar'"
        @click="toggleMaximize"
      >
        <svg v-if="!isMaximized" class="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <rect x="2.25" y="2.25" width="7.5" height="7.5" stroke="currentColor" stroke-width="1.2" />
        </svg>
        <svg v-else class="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M4.25 4.25V3.25a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H8.75"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <rect x="2.25" y="4.75" width="5" height="5" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>

      <button
        type="button"
        class="title-bar-btn title-bar-btn-close flex w-11 items-center justify-center transition hover:bg-[#e81123]"
        aria-label="Fechar"
        @click="closeWindow"
      >
        <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 3l6 6M9 3 3 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.title-bar-drag {
  -webkit-app-region: drag;
  app-region: drag;
}

.title-bar-btn {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
</style>
