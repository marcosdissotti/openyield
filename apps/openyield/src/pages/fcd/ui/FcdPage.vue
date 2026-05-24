<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useNotebookStore } from '#entities/notebook'
import { useFcdSnapshotStore } from '#entities/fcd-snapshot'
import { computeFcdModel } from '#features/fcd-calc/lib/computeFcdModel'
import type { FcdFormulaFieldId } from '#features/fcd-calc/lib/fcdFormulas'
import { FCD_STEP_RESULTS } from '#features/fcd-calc/lib/fcdFormulas'
import type { FcdComputedValue, FcdModelInputs } from '#features/fcd-calc/model/fcdTypes'
import {
  formatFairPrice,
  formatFcdNumber,
  formatFcdPercent,
  formatFcdPercentFromDecimal,
  parseLocaleNumber,
} from '#features/fcd-calc/lib/formatFcdNumber'
import {
  FCD_MIL_INPUT_KEYS,
  normalizeToThousands,
} from '#features/fcd-calc/lib/normalizeFcdInputs'
import { NotebookTabsBar } from '#widgets/notebook-tabs'
import {
  DEFAULT_VALUATION_METHOD,
  type ValuationMethodId,
} from '#features/valuation-methods/model/valuationMethodCatalog'
import ValuationMethodsNav from './ValuationMethodsNav.vue'
import ValuationMethodPlaceholder from './ValuationMethodPlaceholder.vue'
import GrahamValuationPanel from './GrahamValuationPanel.vue'
import GrahamNumberValuationPanel from './GrahamNumberValuationPanel.vue'

const notebook = useNotebookStore()
const fcdStore = useFcdSnapshotStore()

const inputs = ref<FcdModelInputs>(
  fcdStore.stateForNotebook(notebook.activeNotebookId, notebook.activeNotebook?.ticker).inputs,
)
const formulaOverrides = ref<Partial<Record<FcdFormulaFieldId, string>>>(
  fcdStore.stateForNotebook(notebook.activeNotebookId, notebook.activeNotebook?.ticker).formulaOverrides,
)
let saveTimer: ReturnType<typeof setTimeout> | null = null

const formulaEditOpen = ref(false)
const formulaEditField = ref<FcdComputedValue | null>(null)
const formulaDraft = ref('')
const activeValuationMethod = ref<ValuationMethodId>(DEFAULT_VALUATION_METHOD)

const model = computed(() => computeFcdModel(inputs.value, formulaOverrides.value))
const fairPrice = computed(() => model.value.values.fairPricePerShare)

watch(
  () => notebook.activeNotebookId,
  (id) => {
    if (!id) return
    const state = fcdStore.stateForNotebook(id, notebook.activeNotebook?.ticker)
    inputs.value = state.inputs
    formulaOverrides.value = state.formulaOverrides
  },
)

watch(
  [inputs, formulaOverrides],
  () => {
    const nbId = notebook.activeNotebookId
    if (!nbId) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void fcdStore.persist(nbId, notebook.activeNotebook?.ticker ?? inputs.value.ticker, {
        inputs: inputs.value,
        formulaOverrides: formulaOverrides.value,
      })
    }, 600)
  },
  { deep: true },
)

function displayComputed(field: FcdComputedValue): string {
  if (field.id === 'wacc') return formatFcdPercentFromDecimal(field.value, 2)
  if (field.id === 'we' || field.id === 'wd') return formatFcdPercentFromDecimal(field.value, 2)
  if (field.id === 'ke' || field.id === 'kd') return formatFcdPercent(field.value, 2)
  if (field.id === 'enterpriseValue') return formatFcdNumber(field.value, { currency: true, decimals: 2 })
  return formatFcdNumber(field.value, { decimals: Math.abs(field.value) >= 1000 ? 0 : 2 })
}

function openFormulaEditor(field: FcdComputedValue) {
  formulaEditField.value = field
  formulaDraft.value = field.formula
  formulaEditOpen.value = true
}

function saveFormulaEdit() {
  const field = formulaEditField.value
  if (!field) return
  const trimmed = formulaDraft.value.trim()
  if (!trimmed || trimmed === field.defaultFormula) {
    const next = { ...formulaOverrides.value }
    delete next[field.id as FcdFormulaFieldId]
    formulaOverrides.value = next
  } else {
    formulaOverrides.value = { ...formulaOverrides.value, [field.id as FcdFormulaFieldId]: trimmed }
  }
  formulaEditOpen.value = false
}

function resetFormulaEdit() {
  const field = formulaEditField.value
  if (!field) return
  formulaDraft.value = field.defaultFormula
}

function cancelFormulaEdit() {
  formulaEditOpen.value = false
}

const formulaDialogPt = {
  mask: {
    class:
      'fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm',
  },
  root: {
    class:
      'relative z-[1001] flex max-h-[min(90vh,640px)] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl',
  },
  header: {
    class:
      'flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4',
  },
  title: {
    class: 'text-base font-semibold leading-snug text-slate-900',
  },
  content: {
    class: 'overflow-y-auto bg-white px-5 py-4',
  },
  pcCloseButton: {
    root: {
      class:
        'ml-2 inline-flex shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800',
    },
  },
}

type InputDef = {
  key: keyof FcdModelInputs
  label: string
  hint: string
  source?: { label: string; url: string }
  kind: 'number' | 'percent_decimal' | 'percent' | 'text' | 'mode'
}

const fclInputs: InputDef[] = [
  { key: 'ebit', label: 'EBIT (mil)', hint: 'B6 — cole do Status Invest sem os 3 últimos zeros', source: { label: 'Status Invest', url: 'https://statusinvest.com.br/' }, kind: 'number' },
  { key: 'irRate', label: 'IR (decimal)', hint: 'B7 — ex.: 0,34 = 34%', source: { label: 'Status Invest', url: 'https://statusinvest.com.br/' }, kind: 'percent_decimal' },
  { key: 'depreciation', label: 'Depreciação e amortização (mil)', hint: 'D9 — sinal conforme planilha (CSMG3: negativa)', source: { label: 'Status Invest', url: 'https://statusinvest.com.br/' }, kind: 'number' },
  { key: 'capex', label: 'Capex (mil)', hint: 'D11 — sinal conforme Fundamentei / planilha', source: { label: 'Fundamentei', url: 'https://fundamentei.com.br/' }, kind: 'number' },
]

const waccInputs: InputDef[] = [
  { key: 'equity', label: 'Patrimônio líquido (mil)', hint: 'D19 — sem os 3 últimos zeros', source: { label: 'Status Invest', url: 'https://statusinvest.com.br/' }, kind: 'number' },
  { key: 'totalLiabilities', label: 'Passivo total (mil)', hint: 'D20 — sem os 3 últimos zeros', source: { label: 'Status Invest', url: 'https://statusinvest.com.br/' }, kind: 'number' },
  { key: 'riskFreeRate', label: 'Taxa livre de risco (%)', hint: 'D23 — Selic', kind: 'percent' },
  { key: 'marketPremium', label: 'Prêmio de mercado (%)', hint: 'D25', source: { label: 'Damodaran', url: 'https://pages.stern.nyu.edu/~adamodar/' }, kind: 'percent' },
  { key: 'beta', label: 'Beta', hint: 'D27', source: { label: 'Investing', url: 'https://www.investing.com/' }, kind: 'number' },
  { key: 'costOfDebt', label: 'KD base (%)', hint: 'D32 — debêntures', source: { label: 'Debêntures.com', url: 'https://www.debentures.com.br/' }, kind: 'percent' },
  { key: 'debtPremiumAdd', label: 'Acréscimo KD (%)', hint: 'D35', kind: 'percent' },
]

const growthInputs: InputDef[] = [
  { key: 'growthRate3y', label: 'Crescimento 3 anos (decimal)', hint: 'K4 — ex.: 0,0738', kind: 'percent_decimal' },
  { key: 'growthRateTerminal', label: 'Crescimento perenidade (decimal)', hint: 'K5 — ex.: 0,01', source: { label: 'IPEA', url: 'https://www.ipea.gov.br/' }, kind: 'percent_decimal' },
]

const sharesInputs: InputDef[] = [
  { key: 'sharesOutstanding', label: 'Número de ações', hint: 'K9 — valor completo do site', source: { label: 'Status Invest', url: 'https://statusinvest.com.br/' }, kind: 'number' },
]

const milInputKeys = new Set<string>(FCD_MIL_INPUT_KEYS)

function onInputChange(def: InputDef, raw: string) {
  if (def.kind === 'text') {
    ;(inputs.value as Record<string, unknown>)[def.key] = raw
    return
  }
  ;(inputs.value as Record<string, unknown>)[def.key] = parseLocaleNumber(raw)
}

function normalizeMilField(key: keyof FcdModelInputs) {
  if (!milInputKeys.has(key)) return
  const v = inputs.value[key]
  if (typeof v !== 'number') return
  ;(inputs.value as Record<string, unknown>)[key] = normalizeToThousands(v)
}

function inputStringValue(key: keyof FcdModelInputs): string {
  const v = inputs.value[key]
  if (typeof v === 'number') return String(v)
  return String(v ?? '')
}

function resultField(id: FcdFormulaFieldId): FcdComputedValue | undefined {
  return model.value.values[id]
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#edf1f7] text-slate-950">
    <header class="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
      <div class="min-w-0 shrink-0">
        <h1 class="text-lg font-semibold tracking-tight">Valuation</h1>
      </div>
      <NotebookTabsBar />
    </header>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <ValuationMethodsNav
        :active-method="activeValuationMethod"
        @select="activeValuationMethod = $event"
      />

      <main
        v-if="activeValuationMethod === 'graham'"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#edf1f7]"
      >
        <GrahamValuationPanel />
      </main>

      <main
        v-else-if="activeValuationMethod === 'graham-number'"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#edf1f7]"
      >
        <GrahamNumberValuationPanel />
      </main>

      <main
        v-else-if="activeValuationMethod !== 'fcd'"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#edf1f7]"
      >
        <ValuationMethodPlaceholder :method-id="activeValuationMethod" />
      </main>

      <main v-else class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5 pb-10">
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-indigo-600">Ticker</p>
            <h2 class="text-2xl font-semibold">{{ inputs.ticker || '—' }}</h2>
          </div>

          <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 px-5 py-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-indigo-700">Preço justo por ação</p>
                <p class="mt-1 font-mono text-3xl font-bold tabular-nums text-indigo-950">
                  {{ fairPrice ? formatFairPrice(fairPrice.value) : '—' }}
                </p>
                <p class="mt-1 text-[11px] text-indigo-700/80">Célula K20</p>
              </div>
              <button
                v-if="fairPrice"
                type="button"
                class="rounded-lg p-2 text-indigo-600 hover:bg-white/80"
                title="Editar fórmula do preço justo"
                @click="openFormulaEditor(fairPrice)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                  <path d="m2.695 14.762-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="mb-1 text-sm font-semibold">1º Passo — FCL</h3>
          <p class="mb-4 text-xs text-slate-500">FCL = NoPat + Depreciação + Capex + Var. capital de giro</p>
          <div class="grid gap-4 md:grid-cols-2">
            <label v-for="def in fclInputs" :key="def.key" class="flex flex-col gap-1">
              <span class="text-xs font-medium text-slate-700">{{ def.label }}</span>
              <span class="text-[10px] text-slate-400">{{ def.hint }}</span>
              <InputText
                :model-value="inputStringValue(def.key)"
                class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                @update:model-value="onInputChange(def, $event ?? '')"
                @blur="normalizeMilField(def.key)"
              />
              <a
                v-if="def.source"
                :href="def.source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[10px] text-indigo-600 hover:underline"
              >{{ def.source.label }}</a>
            </label>
          </div>

          <div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="mb-3 text-xs font-semibold uppercase text-slate-500">Variação de capital de giro</p>
            <div class="mb-3 flex gap-2 text-xs">
              <button
                type="button"
                class="rounded-full px-3 py-1 font-semibold"
                :class="inputs.workingCapitalMode === 'balance_sheet' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'"
                @click="inputs.workingCapitalMode = 'balance_sheet'"
              >
                Balanço (A/B)
              </button>
              <button
                type="button"
                class="rounded-full px-3 py-1 font-semibold"
                :class="inputs.workingCapitalMode === 'direct' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'"
                @click="inputs.workingCapitalMode = 'direct'"
              >
                Valor directo (D13)
              </button>
            </div>
            <div v-if="inputs.workingCapitalMode === 'direct'" class="max-w-sm">
              <label class="flex flex-col gap-1">
                <span class="text-xs font-medium">Var. CG (mil)</span>
                <InputText
                  :model-value="String(inputs.workingCapitalChange)"
                  class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  @update:model-value="inputs.workingCapitalChange = parseLocaleNumber($event ?? '0')"
                  @blur="normalizeMilField('workingCapitalChange')"
                />
              </label>
            </div>
            <div v-else class="grid gap-3 md:grid-cols-2">
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="mb-2 text-[11px] font-semibold text-slate-500">Ano anterior</p>
                <label class="mb-2 block text-xs">Ativo circulante (A39)
                  <InputText
                    :model-value="String(inputs.currentAssetsPrior)"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
                    @update:model-value="inputs.currentAssetsPrior = parseLocaleNumber($event ?? '0')"
                    @blur="normalizeMilField('currentAssetsPrior')"
                  />
                </label>
                <label class="block text-xs">Passivo circulante (B39)
                  <InputText
                    :model-value="String(inputs.currentLiabilitiesPrior)"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
                    @update:model-value="inputs.currentLiabilitiesPrior = parseLocaleNumber($event ?? '0')"
                    @blur="normalizeMilField('currentLiabilitiesPrior')"
                  />
                </label>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="mb-2 text-[11px] font-semibold text-slate-500">Ano corrente</p>
                <label class="mb-2 block text-xs">Ativo circulante (A42)
                  <InputText
                    :model-value="String(inputs.currentAssetsCurrent)"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
                    @update:model-value="inputs.currentAssetsCurrent = parseLocaleNumber($event ?? '0')"
                    @blur="normalizeMilField('currentAssetsCurrent')"
                  />
                </label>
                <label class="block text-xs">Passivo circulante (B42)
                  <InputText
                    :model-value="String(inputs.currentLiabilitiesCurrent)"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
                    @update:model-value="inputs.currentLiabilitiesCurrent = parseLocaleNumber($event ?? '0')"
                    @blur="normalizeMilField('currentLiabilitiesCurrent')"
                  />
                </label>
              </div>
            </div>
          </div>

          <div class="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <div
              v-for="fieldId in FCD_STEP_RESULTS.fcl"
              :key="fieldId"
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="text-xs font-medium text-slate-700">{{ resultField(fieldId)?.label }}</p>
                <p class="text-[10px] text-slate-400">{{ resultField(fieldId)?.excelRef }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span class="font-mono text-sm font-semibold text-slate-900">
                  {{ resultField(fieldId) ? displayComputed(resultField(fieldId)!) : '—' }}
                </span>
                <button
                  v-if="resultField(fieldId)"
                  type="button"
                  class="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-700"
                  title="Editar fórmula"
                  @click="openFormulaEditor(resultField(fieldId)!)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                    <path d="m2.695 14.762-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="mb-1 text-sm font-semibold">2º Passo — WACC</h3>
          <p class="mb-4 text-xs text-slate-500">WACC = WE × KE + WD × KD</p>
          <div class="grid gap-4 md:grid-cols-2">
            <label v-for="def in waccInputs" :key="def.key" class="flex flex-col gap-1">
              <span class="text-xs font-medium text-slate-700">{{ def.label }}</span>
              <span class="text-[10px] text-slate-400">{{ def.hint }}</span>
              <InputText
                :model-value="inputStringValue(def.key)"
                class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                @update:model-value="onInputChange(def, $event ?? '')"
                @blur="normalizeMilField(def.key)"
              />
              <a
                v-if="def.source"
                :href="def.source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[10px] text-indigo-600 hover:underline"
              >{{ def.source.label }}</a>
            </label>
          </div>

          <div class="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <div
              v-for="fieldId in FCD_STEP_RESULTS.wacc"
              :key="fieldId"
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="text-xs font-medium text-slate-700">{{ resultField(fieldId)?.label }}</p>
                <p class="text-[10px] text-slate-400">{{ resultField(fieldId)?.excelRef }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span class="font-mono text-sm font-semibold text-slate-900">
                  {{ resultField(fieldId) ? displayComputed(resultField(fieldId)!) : '—' }}
                </span>
                <button
                  v-if="resultField(fieldId)"
                  type="button"
                  class="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-700"
                  title="Editar fórmula"
                  @click="openFormulaEditor(resultField(fieldId)!)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                    <path d="m2.695 14.762-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="mb-1 text-sm font-semibold">3º Passo — Taxa de crescimento</h3>
          <p class="mb-4 text-xs text-slate-500">Taxa para 3 anos (K4) e taxa na perenidade (K5)</p>
          <div class="grid gap-4 md:grid-cols-2">
            <label v-for="def in growthInputs" :key="def.key" class="flex flex-col gap-1">
              <span class="text-xs font-medium text-slate-700">{{ def.label }}</span>
              <span class="text-[10px] text-slate-400">{{ def.hint }}</span>
              <InputText
                :model-value="inputStringValue(def.key)"
                class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                @update:model-value="onInputChange(def, $event ?? '0')"
              />
              <a
                v-if="def.source"
                :href="def.source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[10px] text-indigo-600 hover:underline"
              >{{ def.source.label }}</a>
            </label>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="mb-1 text-sm font-semibold">4º Passo — Número de ações</h3>
          <p class="mb-4 text-xs text-slate-500">Quantidade de papéis emitidos (K9)</p>
          <div class="grid gap-4 md:max-w-sm">
            <label v-for="def in sharesInputs" :key="def.key" class="flex flex-col gap-1">
              <span class="text-xs font-medium text-slate-700">{{ def.label }}</span>
              <span class="text-[10px] text-slate-400">{{ def.hint }}</span>
              <InputText
                :model-value="inputStringValue(def.key)"
                class="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                @update:model-value="onInputChange(def, $event ?? '0')"
              />
              <a
                v-if="def.source"
                :href="def.source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[10px] text-indigo-600 hover:underline"
              >{{ def.source.label }}</a>
            </label>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="mb-1 text-sm font-semibold">5º Passo — FCD</h3>
          <p class="mb-4 text-xs text-slate-500">Fluxo de caixa descontado — anos 1 a 3 + perpetuidade</p>
          <div class="space-y-2">
            <div
              v-for="fieldId in FCD_STEP_RESULTS.fcd"
              :key="fieldId"
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="text-xs font-medium text-slate-700">{{ resultField(fieldId)?.label }}</p>
                <p class="text-[10px] text-slate-400">{{ resultField(fieldId)?.excelRef }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span class="font-mono text-sm font-semibold text-slate-900">
                  {{ resultField(fieldId) ? displayComputed(resultField(fieldId)!) : '—' }}
                </span>
                <button
                  v-if="resultField(fieldId)"
                  type="button"
                  class="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-700"
                  title="Editar fórmula"
                  @click="openFormulaEditor(resultField(fieldId)!)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                    <path d="m2.695 14.762-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
      </main>
    </div>

    <Dialog
      v-model:visible="formulaEditOpen"
      modal
      block-scroll
      :draggable="false"
      :header="formulaEditField ? formulaEditField.label : 'Editar fórmula'"
      :pt="formulaDialogPt"
      @hide="formulaEditField = null"
    >
      <div v-if="formulaEditField" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800">
            {{ formulaEditField.excelRef }}
          </span>
          <span class="text-xs text-slate-500">Expressão JavaScript</span>
        </div>

        <p class="text-sm leading-relaxed text-slate-600">
          Use inputs (<code class="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-800">ebit</code>,
          <code class="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-800">irRate</code>, …)
          e resultados anteriores (<code class="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-800">noPat</code>,
          <code class="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-800">fcl</code>, …).
        </p>

        <label class="flex flex-col gap-2">
          <span class="text-xs font-medium text-slate-700">Fórmula</span>
          <textarea
            v-model="formulaDraft"
            rows="5"
            spellcheck="false"
            class="w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-sm leading-relaxed text-slate-900 outline-none ring-indigo-500 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2"
          />
        </label>

        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Default</p>
          <p class="break-all font-mono text-xs leading-relaxed text-slate-700">{{ formulaEditField.defaultFormula }}</p>
        </div>

        <div class="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span class="text-sm font-medium text-emerald-900">Resultado actual</span>
          <span class="font-mono text-lg font-semibold tabular-nums text-emerald-950">
            {{ displayComputed(formulaEditField) }}
          </span>
        </div>

        <p v-if="formulaEditField.hint" class="text-xs leading-relaxed text-slate-500">{{ formulaEditField.hint }}</p>

        <div class="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            @click="resetFormulaEdit"
          >
            Reset
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            @click="cancelFormulaEdit"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            @click="saveFormulaEdit"
          >
            Guardar
          </button>
        </div>
      </div>
    </Dialog>
  </div>
</template>