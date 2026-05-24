<script setup lang="ts">
import { ref } from 'vue'
import {
  VALUATION_METHOD_CATEGORIES,
  valuationMethodMeta,
  type ValuationMethodId,
} from '#features/valuation-methods/model/valuationMethodCatalog'

defineProps<{
  activeMethod: ValuationMethodId
}>()

const emit = defineEmits<{
  select: [id: ValuationMethodId]
}>()

const hoveredMethodId = ref<ValuationMethodId | null>(null)
const tooltipPosition = ref<{ top: number; left: number } | null>(null)

function showMethodTooltip(methodId: ValuationMethodId, event: MouseEvent) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return

  const rect = target.getBoundingClientRect()
  hoveredMethodId.value = methodId
  tooltipPosition.value = {
    top: rect.top + rect.height / 2,
    left: rect.right + 8,
  }
}

function hideMethodTooltip() {
  hoveredMethodId.value = null
  tooltipPosition.value = null
}
</script>

<template>
  <nav
    class="relative flex w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white"
    aria-label="Métodos de valoração"
  >
    <p class="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      Métodos
    </p>

    <div class="flex flex-col gap-4 px-2 py-3 pb-4">
      <section v-for="category in VALUATION_METHOD_CATEGORIES" :key="category.id">
        <h3 class="mb-1.5 px-2 text-[11px] font-semibold leading-snug text-slate-500">
          {{ category.label }}
        </h3>

        <ul class="flex flex-col gap-0.5">
          <li v-for="methodId in category.methodIds" :key="methodId">
            <button
              type="button"
              class="group/item relative flex w-full items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium leading-snug transition"
              :class="
                activeMethod === methodId
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
              "
              @click="emit('select', methodId)"
            >
              <span class="min-w-0 flex-1">
                {{ valuationMethodMeta(methodId).label }}
              </span>

              <span
                class="relative inline-flex shrink-0"
                @click.stop
                @mouseenter="showMethodTooltip(methodId, $event)"
                @mouseleave="hideMethodTooltip"
              >
                <span
                  class="inline-grid h-[14px] w-[14px] place-items-center rounded-full border text-[9px] font-semibold leading-none"
                  :class="
                    activeMethod === methodId
                      ? 'border-white/35 bg-white/10 text-white'
                      : 'border-slate-300 bg-white text-slate-400 group-hover/item:border-slate-400 group-hover/item:text-slate-600'
                  "
                  :aria-label="`Saiba mais sobre ${valuationMethodMeta(methodId).label}`"
                >
                  <span class="block translate-y-px leading-none">?</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="hoveredMethodId && tooltipPosition"
        class="pointer-events-none fixed z-[9999] w-72 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 text-left font-normal text-slate-600 shadow-xl"
        role="tooltip"
        :style="{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
        }"
      >
        <span class="block text-sm font-semibold text-slate-950">
          {{ valuationMethodMeta(hoveredMethodId).label }}
        </span>
        <span class="mt-2 block text-xs leading-relaxed">
          {{ valuationMethodMeta(hoveredMethodId).summary }}
        </span>
        <span class="mt-3 block space-y-2 text-[11px] leading-relaxed text-slate-500">
          <span class="block">
            <span class="font-semibold text-slate-700">Objetivo:</span>
            {{ valuationMethodMeta(hoveredMethodId).objective }}
          </span>
          <span class="block">
            <span class="font-semibold text-slate-700">Quando usar:</span>
            {{ valuationMethodMeta(hoveredMethodId).whenToUse }}
          </span>
          <span class="block">
            <span class="font-semibold text-slate-700">Interpretação:</span>
            {{ valuationMethodMeta(hoveredMethodId).interpretation }}
          </span>
        </span>
        <span class="mt-3 flex flex-wrap gap-1">
          <span
            v-for="tag in valuationMethodMeta(hoveredMethodId).tags"
            :key="tag"
            class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
          >
            {{ tag }}
          </span>
        </span>
      </div>
    </Teleport>
  </nav>
</template>
