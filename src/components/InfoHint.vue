<script setup lang="ts">
/**
 * Small info icon that reveals a short tooltip on hover or keyboard focus.
 * Generic/presentational — used for admin tuning hints and per-job feature
 * explainers. Keep tooltip copy to one or two short lines.
 */
defineProps<{
  tooltip: string
}>()
</script>

<template>
  <span
    tabindex="0"
    class="inline-flex relative align-middle group/hint shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-charcoal/30"
    @click.stop
  >
    <font-awesome-icon
      :icon="['fas', 'circle-info']"
      class="text-neutral-body/60 text-xs cursor-default"
      aria-hidden="true"
    />
    <span
      role="tooltip"
      class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)] z-[100] w-max max-w-[16rem] rounded-md bg-brand-charcoal px-2 py-1.5 text-[11px] leading-snug text-white text-center shadow-lg opacity-0 invisible transition-opacity duration-150 group-hover/hint:visible group-hover/hint:opacity-100 group-focus-within/hint:visible group-focus-within/hint:opacity-100"
    >
      {{ tooltip }}
    </span>
  </span>
</template>
