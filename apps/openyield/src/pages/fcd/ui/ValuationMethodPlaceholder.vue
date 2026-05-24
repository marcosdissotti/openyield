<script setup lang="ts">
import { valuationMethodLabel, type ValuationMethodId } from '#features/valuation-methods/model/valuationMethodCatalog'

defineProps<{
  methodId: ValuationMethodId
}>()
</script>

<template>
  <div class="flex min-h-[320px] flex-1 items-center justify-center p-8">
    <div class="max-w-sm text-center">
      <p class="text-lg font-semibold text-slate-950">{{ valuationMethodLabel(methodId) }}</p>
      <p class="mt-2 text-sm leading-relaxed text-slate-500">
        Formulário em construção. Este método ficará disponível em breve.
      </p>
    </div>
  </div>
</template>
