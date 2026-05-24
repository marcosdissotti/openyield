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
  const type = chartKind === 'bar' ? 'bar' : 'line'
  const isArea = chartKind === 'area'

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
          backgroundColor: type === 'bar' || isArea ? c.fill : 'transparent',
          borderWidth: type === 'line' ? 2 : 1,
          tension: 0.25,
          fill: isArea ? 'origin' : false,
          pointRadius: type === 'line' ? (isArea ? 2 : 3) : 0,
        }
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#475569', font: { size: 11 } },
        },
        title: {
          display: false,
        },
        tooltip: {
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxRotation: 45, minRotation: 0 },
          grid: { color: 'rgba(148, 163, 184, 0.28)' },
        },
        y: {
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(148, 163, 184, 0.28)' },
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
      'rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100',
      embedded ? 'mb-0' : 'mb-6',
    ]"
  >
    <p class="mb-3 text-[11px] leading-snug text-slate-500">
      <span class="font-medium text-slate-800">{{ config.title }}</span>
      · tipo inferido:
      <span class="text-indigo-700">
        {{
          config.chartKind === 'area'
            ? 'área preenchida (eixo temporal / períodos)'
            : config.chartKind === 'line'
              ? 'linhas (eixo temporal / períodos)'
              : 'barras'
        }}
      </span>
    </p>
    <div class="relative h-72 w-full max-w-3xl">
      <canvas ref="canvasRef" />
    </div>
  </div>
</template>
