<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import { useNotebookStore } from '#entities/notebook'
import { useGrahamSnapshotStore } from '#entities/graham-snapshot/model/grahamSnapshotStore'
import {
  computeGrahamModel,
  grahamStatusLabel,
  grahamStatusTone,
} from '#features/graham-calc/lib/computeGrahamModel'
import type { GrahamModelInputs } from '#features/graham-calc/model/grahamTypes'
import { formatFairPrice, formatFcdPercent, parseLocaleNumber } from '#features/fcd-calc/lib/formatFcdNumber'

const notebook = useNotebookStore()
const grahamStore = useGrahamSnapshotStore()

const inputs = ref<GrahamModelInputs>(
  grahamStore.inputsForNotebook(notebook.activeNotebookId, notebook.activeNotebook?.ticker),
)

let saveTimer: ReturnType<typeof setTimeout> | null = null

const model = computed(() => computeGrahamModel(inputs.value))

watch(
  () => notebook.activeNotebookId,
  (id) => {
    if (!id) return
    inputs.value = grahamStore.inputsForNotebook(id, notebook.activeNotebook?.ticker)
  },
)

watch(
  inputs,
  () => {
    const nbId = notebook.activeNotebookId
    if (!nbId) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      grahamStore.persist(nbId, notebook.activeNotebook?.ticker ?? inputs.value.ticker, inputs.value)
    }, 600)
  },
  { deep: true },
)

function onNumberInput(key: keyof GrahamModelInputs, raw: string) {
  ;(inputs.value as Record<string, unknown>)[key] = parseLocaleNumber(raw)
}

function inputString(key: keyof GrahamModelInputs): string {
  const value = inputs.value[key]
  if (typeof value === 'number') return String(value)
  return String(value ?? '')
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5 pb-10">
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700">Graham — fórmula básica</p>
          <h2 class="text-2xl font-semibold">{{ inputs.ticker || '—' }}</h2>
          <p class="mt-1 text-xs text-slate-500">V = LPA × (8,5 + 2g) · conforme Investing.com Academy</p>
        </div>
        <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
          LPA + crescimento
        </span>
      </div>

      <p class="mb-4 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-xs leading-relaxed text-sky-950">
        Fórmula básica documentada na
        <a
          href="https://br.investing.com/academy/analysis/formula-benjamin-graham/"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold underline hover:text-sky-700"
        >Investing.com Academy</a>.
        Para preço justo com <span class="font-semibold">LPA + VPA</span>, use
        <span class="font-semibold">Graham Number — preço justo</span> na sidebar.
      </p>

      <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700">Valor intrínseco (Graham básico)</p>
        <p class="mt-1 font-mono text-3xl font-bold tabular-nums text-emerald-950">
          {{ model.intrinsicValue != null ? formatFairPrice(model.intrinsicValue) : '—' }}
        </p>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="mb-1 text-sm font-semibold">Inputs</h3>
      <p class="mb-4 text-xs text-slate-500">LPA e crescimento — não confundir com calculadoras que pedem VPA.</p>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-700">LPA / EPS (R$)</span>
          <span class="text-[10px] text-slate-400">Lucro por ação — deve ser &gt; 0</span>
          <InputText
            :model-value="inputString('earningsPerShare')"
            class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            @update:model-value="onNumberInput('earningsPerShare', $event ?? '0')"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-700">Preço atual (R$)</span>
          <span class="text-[10px] text-slate-400">Cotação da ação hoje</span>
          <InputText
            :model-value="inputString('currentPrice')"
            class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            @update:model-value="onNumberInput('currentPrice', $event ?? '0')"
          />
        </label>
      </div>

      <div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="mb-3 text-xs font-semibold uppercase text-slate-500">Taxa de crescimento (%)</p>
        <div class="mb-3 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            class="rounded-full px-3 py-1 font-semibold"
            :class="inputs.growthSource === 'manual' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'"
            @click="inputs.growthSource = 'manual'"
          >
            Manual
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1 font-semibold"
            :class="inputs.growthSource === 'historicalCagr5y' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'"
            @click="inputs.growthSource = 'historicalCagr5y'"
          >
            CAGR 5 anos
          </button>
        </div>

        <label v-if="inputs.growthSource === 'manual'" class="flex max-w-sm flex-col gap-1">
          <span class="text-xs font-medium">Crescimento esperado (%)</span>
          <InputText
            :model-value="inputString('expectedGrowthRate')"
            class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            @update:model-value="onNumberInput('expectedGrowthRate', $event ?? '0')"
          />
        </label>

        <label v-else class="flex max-w-sm flex-col gap-1">
          <span class="text-xs font-medium">CAGR histórico 5 anos (%)</span>
          <InputText
            :model-value="inputString('historicalCagr5y')"
            class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            @update:model-value="onNumberInput('historicalCagr5y', $event ?? '0')"
          />
        </label>

        <p class="mt-2 text-[10px] text-slate-400">
          Recomendado limitar entre 15% e 20% para evitar distorções.
        </p>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="mb-4 text-sm font-semibold">Resultados</h3>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <div>
            <p class="text-xs font-medium text-slate-700">Valor intrínseco (Graham — crescimento)</p>
            <p class="text-[10px] text-slate-400">LPA × (8,5 + 2 × {{ model.effectiveGrowthRate }}%)</p>
          </div>
          <span class="font-mono text-sm font-semibold text-slate-900">
            {{ model.intrinsicValue != null ? formatFairPrice(model.intrinsicValue) : '—' }}
          </span>
        </div>

        <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <p class="text-xs font-medium text-slate-700">Preço atual</p>
          <span class="font-mono text-sm font-semibold text-slate-900">
            {{ inputs.currentPrice > 0 ? formatFairPrice(inputs.currentPrice) : '—' }}
          </span>
        </div>

        <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <div>
            <p class="text-xs font-medium text-slate-700">Upside</p>
            <p class="text-[10px] text-slate-400">(Valor − Preço) / Preço</p>
          </div>
          <span class="font-mono text-sm font-semibold text-slate-900">
            {{ model.upside != null ? formatFcdPercent(model.upside, 2) : '—' }}
          </span>
        </div>

        <div
          class="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
          :class="grahamStatusTone(model.status)"
        >
          <div>
            <p class="text-xs font-medium">Status</p>
            <p class="text-[10px] opacity-80">Comparação preço vs valor Graham</p>
          </div>
          <span class="text-sm font-semibold">{{ grahamStatusLabel(model.status) }}</span>
        </div>
      </div>

      <ul v-if="model.warnings.length" class="mt-4 space-y-1 text-xs text-amber-700">
        <li v-for="warning in model.warnings" :key="warning">• {{ warning }}</li>
      </ul>

      <ul v-if="model.errors.length" class="mt-4 space-y-1 text-xs text-rose-700">
        <li v-for="error in model.errors" :key="error">• {{ error }}</li>
      </ul>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="mb-2 text-sm font-semibold">Interpretação</h3>
      <ul class="space-y-2 text-xs leading-relaxed text-slate-600">
        <li><span class="font-semibold text-emerald-800">Preço &lt; Valor Graham</span> → potencialmente descontada.</li>
        <li><span class="font-semibold text-amber-800">Preço ≈ Valor Graham</span> → preço justo (±5%).</li>
        <li><span class="font-semibold text-rose-800">Preço &gt; Valor Graham</span> → potencialmente cara.</li>
      </ul>
    </section>
  </div>
</template>
