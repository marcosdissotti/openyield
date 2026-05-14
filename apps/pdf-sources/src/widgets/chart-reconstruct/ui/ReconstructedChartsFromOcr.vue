<script setup lang="ts">
import { computed } from 'vue'
import { tryBuildAllChartReconstructions } from '../lib/tryBuildAllOcrChartReconstructions'
import OcrReconstructedChartCard from './OcrReconstructedChartCard.vue'

const props = defineProps<{
  markdown: string
}>()

const configs = computed(() => tryBuildAllChartReconstructions(props.markdown))
</script>

<template>
  <section
    v-if="configs.length"
    class="ocr-recharts mt-8 shrink-0 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-5 sm:px-5"
    data-cy="ocr-reconstructed-charts"
  >
    <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Gráficos reconstruídos</h3>
    <p class="mb-4 max-w-3xl text-[11px] leading-relaxed text-slate-500">
      Chart.js a partir de tabelas em OCR ou em “layout (tabela aproximada)”, e de séries no texto/OCR (âncoras
      Mês/AA + percentuais, inclusive inteiros e várias séries quando a soma ≈ 100%). A extração do PDF passa a
      incluir OCR em todas as páginas para captar gráficos vectoriais. Valide com o PDF.
    </p>
    <OcrReconstructedChartCard
      v-for="(c, i) in configs"
      :key="`ocr-chart-${c.pageNum}-${i}`"
      :config="c"
    />
  </section>
</template>
