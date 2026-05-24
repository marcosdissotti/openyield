<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { logger, type LogEntry, type LogLevel } from '#shared/lib/logger'

const visible = defineModel<boolean>('visible', { default: false })
const logs = ref<LogEntry[]>([])
const autoScroll = ref(true)
const filterLevel = ref<LogLevel | 'ALL'>('ALL')
const scrollContainerRef = ref<HTMLElement | null>(null)

const filteredLogs = computed(() => {
  if (filterLevel.value === 'ALL') return logs.value
  return logs.value.filter(log => log.level === filterLevel.value)
})

const logCounts = computed(() => ({
  ALL: logs.value.length,
  DEBUG: logs.value.filter(l => l.level === 'DEBUG').length,
  INFO: logs.value.filter(l => l.level === 'INFO').length,
  WARN: logs.value.filter(l => l.level === 'WARN').length,
  ERROR: logs.value.filter(l => l.level === 'ERROR').length,
}))

let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = logger.subscribe((newLogs) => {
    logs.value = newLogs
  })
})

onUnmounted(() => {
  unsubscribe?.()
})

// Watch for log changes and auto-scroll
watch(filteredLogs, async () => {
  if (autoScroll.value && visible.value) {
    await nextTick()
    requestAnimationFrame(() => scrollToBottom())
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToBottom())
    })
  }
}, { deep: true })

// Watch for visibility changes to scroll when dialog opens
watch(visible, async (newVal) => {
  if (newVal && autoScroll.value) {
    await nextTick()
    requestAnimationFrame(() => scrollToBottom())
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToBottom())
    })
  }
})

function scrollToBottom() {
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
  }
}

function clearLogs() {
  logger.clearLogs()
}

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'DEBUG':
      return 'text-emerald-600'
    case 'INFO':
      return 'text-emerald-600'
    case 'WARN':
      return 'text-emerald-600'
    case 'ERROR':
      return 'text-rose-600'
    default:
      return 'text-slate-600'
  }
}

function getLevelBg(level: LogLevel): string {
  switch (level) {
    case 'DEBUG':
      return 'bg-slate-100'
    case 'INFO':
      return 'bg-blue-50'
    case 'WARN':
      return 'bg-emerald-50'
    case 'ERROR':
      return 'bg-rose-50'
    default:
      return 'bg-slate-50'
  }
}

function formatData(data: unknown): string {
  if (data === null || data === undefined) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="OpenYield - Developer Logs"
    :style="{ width: '90vw', maxWidth: '1200px', maxHeight: '90vh' }"
    :pt="{
      root: { class: 'border border-slate-300 bg-slate-900 text-slate-100' },
      header: { class: 'border-b border-slate-700 bg-slate-800' },
      content: { class: 'p-0 overflow-hidden' },
    }"
  >
    <div class="flex h-full flex-col">
      <!-- Toolbar -->
      <div class="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <div class="flex items-center gap-2">
          <button
            v-for="level in ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const"
            :key="level"
            type="button"
            class="rounded px-2 py-1 text-xs font-semibold transition"
            :class="
              filterLevel === level
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            "
            @click="filterLevel = level"
          >
            {{ level }} ({{ logCounts[level] }})
          </button>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1 text-xs text-slate-400">
            <input
              v-model="autoScroll"
              type="checkbox"
              class="rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            Auto-scroll
          </label>
          <Button
            type="button"
            label="Clear"
            size="small"
            severity="secondary"
            @click="clearLogs"
          />
        </div>
      </div>

      <!-- Logs content -->
      <div ref="scrollContainerRef" class="max-h-[100vh] pb-[300px] logs-scroll-panel flex-1 overflow-y-auto bg-[#0d1117]">
        <div class="font-mono text-xs">
          <div
            v-for="(log, index) in filteredLogs"
            :key="index"
            class="border-b border-slate-800 px-4 py-1.5"
            :class="getLevelBg(log.level)"
          >
            <div class="flex items-start gap-2">
              <span class="shrink-0 text-slate-400">{{ log.timestamp }}</span>
              <span
                class="shrink-0 font-bold"
                :class="getLevelColor(log.level)"
              >
                [{{ log.level }}]
              </span>
              <span class="flex-1 text-slate-200">{{ log.message }}</span>
            </div>
            <div
              v-if="log.data !== undefined"
              class="mt-1 ml-24 overflow-auto rounded bg-slate-800 p-2 text-slate-300"
            >
              <pre class="whitespace-pre-wrap">{{ formatData(log.data) }}</pre>
            </div>
          </div>
          <div v-if="filteredLogs.length === 0" class="px-4 py-8 text-center text-slate-500">
            No logs to display
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>
