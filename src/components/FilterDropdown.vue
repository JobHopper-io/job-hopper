<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from 'vue'

defineProps<{
  label: string
  /** Tints the pill to indicate an active (non-default) filter, matching the saved-jobs toggle. */
  active?: boolean
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function onDocumentClick(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

defineExpose({ close })
</script>

<template>
  <div ref="rootEl" class="relative inline-flex">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
      :class="active
        ? 'bg-brand-primary text-white shadow-sm hover:opacity-90'
        : 'border border-neutral-border bg-neutral-bg text-neutral-body hover:border-neutral-body/40 hover:bg-neutral-border/30'"
      :aria-expanded="open"
      @click="toggle"
    >
      {{ label }}
      <font-awesome-icon :icon="['fas', 'chevron-down']" class="text-xs opacity-70" aria-hidden="true" />
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-full z-30 mt-1.5 min-w-[14rem] rounded-[12px] border border-neutral-border bg-white p-3 shadow-lg"
    >
      <slot :close="close" />
    </div>
  </div>
</template>
