<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg' | 'xl'
    theme?: 'light' | 'dark'
  }>(),
  {
    size: 'md',
    theme: 'light',
  },
)

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'text-[13px]'
  if (props.size === 'lg') return 'text-xl'
  if (props.size === 'xl') return 'text-2xl'
  return 'text-lg'
})

const openClass = computed(() =>
  props.theme === 'dark' ? 'text-[#E8F5EE]' : 'text-[#06211A]',
)

const yieldClass = computed(() => 'text-[#1ED760]')
</script>

<template>
  <span
    class="inline-flex items-baseline font-bold leading-none tracking-tight"
    :class="sizeClass"
    aria-label="OpenYield"
  >
    <span :class="openClass">Open</span><span :class="yieldClass">Yield</span>
  </span>
</template>
