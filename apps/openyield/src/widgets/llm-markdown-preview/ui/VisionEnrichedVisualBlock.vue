<script setup lang="ts">
import { OcrReconstructedChartCard, ReconstructedTableBlock } from '#widgets/chart-reconstruct'
import type { VisionPageVisual } from '../lib/visionJsonToPageVisual'

defineProps<{
  visual: VisionPageVisual
}>()
</script>

<template>
  <div
    class="vision-llm-visual mt-4 rounded-xl border border-violet-200 bg-violet-50/70 p-4 ring-1 ring-violet-100"
    data-cy="vision-llm-page-visual"
  >
    <p class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
      Gráfico ou tabela · modelo de visão (IA)
      <span class="font-normal normal-case text-slate-500">· tipo identificado: </span>
      <span class="font-mono text-[11px] text-violet-800">{{ visual.reportedChartType }}</span>
      <span class="font-normal normal-case text-slate-500"> · apresentação: </span>
      <span class="text-slate-600">{{ visual.kind === 'chart' ? 'Chart.js' : 'tabela' }}</span>
    </p>
    <OcrReconstructedChartCard v-if="visual.kind === 'chart'" :config="visual.config" embedded />
    <ReconstructedTableBlock v-else :tables="visual.tables" />
  </div>
</template>
