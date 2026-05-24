<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import { useNotebookStore } from '#entities/notebook'
import { useGrahamNumberSnapshotStore } from '#entities/graham-number-snapshot/model/grahamNumberSnapshotStore'
import {
  computeGrahamNumberModel,
  grahamStatusLabel,
  grahamStatusTone,
} from '#features/graham-calc/lib/computeGrahamNumberModel'
import type { GrahamNumberModelInputs } from '#features/graham-calc/model/grahamNumberTypes'
import { GRAHAM_NUMBER_MULTIPLIER } from '#features/graham-calc/model/grahamNumberTypes'
import { formatFairPrice, formatFcdPercent, parseLocaleNumber } from '#features/fcd-calc/lib/formatFcdNumber'

const notebook = useNotebookStore()
const grahamNumberStore = useGrahamNumberSnapshotStore()

const inputs = ref<GrahamNumberModelInputs>(
  grahamNumberStore.inputsForNotebook(notebook.activeNotebookId, notebook.activeNotebook?.ticker),
)

let saveTimer: ReturnType<typeof setTimeout> | null = null

const model = computed(() => computeGrahamNumberModel(inputs.value))

watch(
  () => notebook.activeNotebookId,
  (id) => {
    if (!id) return
    inputs.value = grahamNumberStore.inputsForNotebook(id, notebook.activeNotebook?.ticker)
  },
)

watch(
  inputs,
  () => {
    const nbId = notebook.activeNotebookId
    if (!nbId) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      grahamNumberStore.persist(nbId, notebook.activeNotebook?.ticker ?? inputs.value.ticker, inputs.value)
    }, 600)
  },
  { deep: true },
)

function onNumberInput(key: keyof GrahamNumberModelInputs, raw: string) {
  ;(inputs.value as Record<string, unknown>)[key] = parseLocaleNumber(raw)
}

function inputString(key: keyof GrahamNumberModelInputs): string {
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
          <p class="text-xs font-semibold uppercase tracking-wide text-violet-700">Graham Number — preço justo</p>
          <h2 class="text-2xl font-semibold">{{ inputs.ticker || '—' }}</h2>
          <p class="mt-1 text-xs text-slate-500">√({{ GRAHAM_NUMBER_MULTIPLIER }} × LPA × VPA) · calculadoras BR</p>
        </div>
        <span class="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
          LPA + VPA
        </span>
      </div>

      <p class="mb-4 text-sm leading-relaxed text-slate-600">
        Método usado em calculadoras brasileiras de preço justo: combina lucro por ação e valor patrimonial por ação.
        Diferente da fórmula <span class="font-semibold">LPA + crescimento</span> (Investing.com) — veja o outro item na sidebar.
      </p>

      <div class="rounded-xl border border-violet-200 bg-violet-50/60 px-5 py-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-violet-700">Preço justo por ação</p>
        <p class="mt-1 font-mono text-3xl font-bold tabular-nums text-violet-950">
          {{ model.fairPrice != null ? formatFairPrice(model.fairPrice) : '—' }}
        </p>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="mb-1 text-sm font-semibold">Inputs</h3>
      <p class="mb-4 text-xs text-slate-500">LPA e VPA do último período — mesmos dados das calculadoras de preço justo.</p>

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
          <span class="text-xs font-medium text-slate-700">VPA (R$)</span>
          <span class="text-[10px] text-slate-400">Valor patrimonial por ação — deve ser &gt; 0</span>
          <InputText
            :model-value="inputString('bookValuePerShare')"
            class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            @update:model-value="onNumberInput('bookValuePerShare', $event ?? '0')"
          />
        </label>

        <label class="flex flex-col gap-1 md:col-span-2">
          <span class="text-xs font-medium text-slate-700">Preço atual (R$)</span>
          <span class="text-[10px] text-slate-400">Cotação da ação hoje</span>
          <InputText
            :model-value="inputString('currentPrice')"
            class="max-w-md rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            @update:model-value="onNumberInput('currentPrice', $event ?? '0')"
          />
        </label>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="mb-4 text-sm font-semibold">Resultados</h3>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <div>
            <p class="text-xs font-medium text-slate-700">Preço justo (Graham Number)</p>
            <p class="text-[10px] text-slate-400">√({{ GRAHAM_NUMBER_MULTIPLIER }} × LPA × VPA)</p>
          </div>
          <span class="font-mono text-sm font-semibold text-slate-900">
            {{ model.fairPrice != null ? formatFairPrice(model.fairPrice) : '—' }}
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
            <p class="text-[10px] text-slate-400">(Preço justo − Preço) / Preço</p>
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
            <p class="text-[10px] opacity-80">Comparação preço vs preço justo</p>
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
        <li><span class="font-semibold text-emerald-800">Preço &lt; Preço justo</span> → potencialmente descontada.</li>
        <li><span class="font-semibold text-amber-800">Preço ≈ Preço justo</span> → preço justo (±5%).</li>
        <li><span class="font-semibold text-rose-800">Preço &gt; Preço justo</span> → potencialmente cara.</li>
      </ul>
    </section>
  </div>
</template>
