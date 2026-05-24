<script setup lang="ts">
import type { ModelCapabilities } from '#features/llama-runtime/lib/inferModelCapabilities'
import {
  capabilityShortLabelPt,
  capabilityTooltipPt,
} from '#features/llama-runtime/lib/inferModelCapabilities'

const props = withDefaults(
  defineProps<{
    caps: ModelCapabilities
    /** `icons`: só pictogramas + tooltip; `labels`: texto curto PT (painel detalhe). */
    mode?: 'icons' | 'labels'
  }>(),
  { mode: 'icons' },
)

function wrapCls(state: boolean | 'unknown', on: string, off: string, unk: string) {
  if (state === true) return on
  if (state === false) return off
  return unk
}
</script>

<template>
  <div
    class="inline-flex items-center gap-1"
    role="group"
    aria-label="Capacidades inferidas (heurística; confirme no Hub)"
  >
    <span
      class="inline-flex items-center gap-0.5 rounded border px-1 py-0.5 tabular-nums leading-none"
      :class="
        wrapCls(
          caps.vision,
          'border-amber-500/65 bg-amber-950/45 text-amber-100/95',
          'border-slate-600/50 bg-slate-900/50 text-slate-500',
          'border-slate-600/40 border-dashed bg-slate-900/35 text-slate-500',
        )
      "
      :title="capabilityTooltipPt('vision', caps.vision)"
    >
      <svg
        class="h-3 w-3 shrink-0 opacity-95"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span v-if="mode === 'labels'" class="max-w-[5.5rem] truncate text-[9px] font-semibold">{{
        capabilityShortLabelPt('vision', caps.vision)
      }}</span>
    </span>
    <span
      class="inline-flex items-center gap-0.5 rounded border px-1 py-0.5 leading-none"
      :class="
        wrapCls(
          caps.tools,
          'border-sky-500/65 bg-sky-950/45 text-sky-100/95',
          'border-slate-600/50 bg-slate-900/50 text-slate-500',
          'border-slate-600/40 border-dashed bg-slate-900/35 text-slate-500',
        )
      "
      :title="capabilityTooltipPt('tools', caps.tools)"
    >
      <svg
        class="h-3 w-3 shrink-0 opacity-95"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        />
      </svg>
      <span v-if="mode === 'labels'" class="max-w-[5.5rem] truncate text-[9px] font-semibold">{{
        capabilityShortLabelPt('tools', caps.tools)
      }}</span>
    </span>
    <span
      class="inline-flex items-center gap-0.5 rounded border px-1 py-0.5 leading-none"
      :class="
        wrapCls(
          caps.reasoning,
          'border-emerald-500/65 bg-emerald-950/45 text-emerald-100/95',
          'border-slate-600/50 bg-slate-900/50 text-slate-500',
          'border-slate-600/40 border-dashed bg-slate-900/35 text-slate-500',
        )
      "
      :title="capabilityTooltipPt('reasoning', caps.reasoning)"
    >
      <svg
        class="h-3 w-3 shrink-0 opacity-95"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09zM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456z"
        />
      </svg>
      <span v-if="mode === 'labels'" class="max-w-[5.5rem] truncate text-[9px] font-semibold">{{
        capabilityShortLabelPt('reasoning', caps.reasoning)
      }}</span>
    </span>
  </div>
</template>
