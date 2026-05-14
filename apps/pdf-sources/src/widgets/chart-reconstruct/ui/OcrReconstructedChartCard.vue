<script setup lang="ts">
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { OcrChartReconstruction } from '../model/chartReconstruction'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  Title,
  Tooltip,
  Legend,
)

const props = withDefaults(
  defineProps<{
    config: OcrChartReconstruction
    /** Quando true, menos margem inferior (ex.: embutido por página no preview). */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

const PALETTE = [
  { border: 'rgb(129, 140, 248)', fill: 'rgba(129, 140, 248, 0.25)' },
  { border: 'rgb(45, 212, 191)', fill: 'rgba(45, 212, 191, 0.22)' },
  { border: 'rgb(251, 191, 36)', fill: 'rgba(251, 191, 36, 0.22)' },
  { border: 'rgb(244, 114, 182)', fill: 'rgba(244, 114, 182, 0.2)' },
]

function renderChart() {
  chart?.destroy()
  chart = null
  const el = canvasRef.value
  if (!el) return

  const { chartKind, labels, datasets } = props.config
  const type = chartKind === 'line' ? 'line' : 'bar'

  chart = new Chart(el, {
    type,
    data: {
      labels,
      datasets: datasets.map((ds, i) => {
        const c = PALETTE[i % PALETTE.length]!
        return {
          label: ds.label,
          data: ds.data,
          borderColor: c.border,
          backgroundColor: type === 'bar' ? c.fill : 'transparent',
          borderWidth: type === 'line' ? 2 : 1,
          tension: 0.25,
          fill: false,
          pointRadius: type === 'line' ? 3 : 0,
        }
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#cbd5e1', font: { size: 11 } },
        },
        title: {
          display: false,
        },
        tooltip: {
          titleColor: '#f1f5f9',
          bodyColor: '#e2e8f0',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
        },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 },
          grid: { color: 'rgba(51, 65, 85, 0.35)' },
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(51, 65, 85, 0.35)' },
        },
      },
    },
  })
}

onMounted(renderChart)
watch(
  () => props.config,
  () => renderChart(),
  { deep: true },
)
onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <div
    :class="[
      'rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 shadow-inner ring-1 ring-slate-800/60',
      embedded ? 'mb-0' : 'mb-6',
    ]"
  >
    <p class="mb-3 text-[11px] leading-snug text-slate-400">
      <span class="font-medium text-slate-300">{{ config.title }}</span>
      · tipo inferido:
      <span class="text-indigo-300">{{ config.chartKind === 'line' ? 'linhas (eixo temporal / períodos)' : 'barras' }}</span>
    </p>
    <div class="relative h-72 w-full max-w-3xl">
      <canvas ref="canvasRef" />
    </div>
  </div>
</template>
