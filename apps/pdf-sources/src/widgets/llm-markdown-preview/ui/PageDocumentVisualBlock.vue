<script setup lang="ts">
import { computed } from 'vue'
import {
  OcrReconstructedChartCard,
  ReconstructedTableBlock,
  type PagePreviewVisual,
} from '#widgets/chart-reconstruct'

const props = defineProps<{
  pageNum: number
  pageVisual: PagePreviewVisual | undefined
}>()

const chartVisual = computed(() => (props.pageVisual?.mode === 'chart' ? props.pageVisual : null))

const companionTables = computed(() => chartVisual.value?.companionTables)

const tableOnly = computed(() => (props.pageVisual?.mode === 'table' ? props.pageVisual : null))

const showStrip = computed(() => !!chartVisual.value || !!tableOnly.value)
</script>

<template>
  <section
    v-if="showStrip"
    class="page-doc-visual mt-5 space-y-5 rounded-xl border border-slate-700/80 bg-slate-950/45 p-4 ring-1 ring-slate-900/60"
    :data-cy="`page-${pageNum}-ocr-derived-visuals`"
  >
    <p class="text-[10px] leading-relaxed text-slate-500">
      <strong class="font-medium text-slate-400">Sem IA</strong> — inferências a partir do texto e grelhas já extraídos
      (Chart.js ou tabelas HTML).
    </p>

    <div v-if="chartVisual" class="space-y-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-emerald-500/90">
        Gráfico · OCR / layout
      </p>
      <OcrReconstructedChartCard :config="chartVisual.chart" embedded />
    </div>

    <div v-if="companionTables?.length" class="space-y-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-sky-500/90">
        Tabela(s) · layout tabular
      </p>
      <p class="text-[10px] leading-relaxed text-slate-500">
        Na mesma folha que o gráfico. Para o modelo de visão é enviado um
        <strong class="font-medium text-slate-400">recorte da zona superior</strong>
        da página (heurística para isolar o gráfico).
      </p>
      <ReconstructedTableBlock :tables="companionTables" />
    </div>

    <div v-if="tableOnly" class="space-y-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-sky-500/90">
        Tabela(s) · layout tabular
      </p>
      <ReconstructedTableBlock :tables="tableOnly.tables" :note="tableOnly.note" />
    </div>
  </section>
</template>
