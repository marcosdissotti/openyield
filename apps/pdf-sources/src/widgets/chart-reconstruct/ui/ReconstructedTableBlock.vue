<script setup lang="ts">
import type { InferredHtmlTable } from '../model/pagePreviewVisual'

defineProps<{
  tables: InferredHtmlTable[]
  note?: string
}>()
</script>

<template>
  <div class="reconstructed-tables space-y-5">
    <p v-if="note" class="text-[10px] leading-relaxed text-slate-500">{{ note }}</p>
    <div v-for="(t, i) in tables" :key="i" class="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 ring-1 ring-slate-100">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{{ t.title }}</p>
      <table class="w-full min-w-[16rem] border-collapse text-left text-xs text-slate-700">
        <thead>
          <tr>
            <th
              v-for="(h, j) in t.headers"
              :key="j"
              scope="col"
              class="border border-slate-200 bg-slate-100 px-2 py-1.5 font-medium text-slate-800"
            >
              {{ h }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in t.rows" :key="ri" class="odd:bg-slate-50">
            <td v-for="(cell, ci) in row" :key="ci" class="border border-slate-200 px-2 py-1.5 text-slate-700">
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
