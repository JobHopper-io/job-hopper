<template>
  <div class="space-y-3.5">
    <div
      v-for="row in rows"
      :key="row.label"
      class="group"
    >
      <div class="flex items-baseline justify-between gap-3 mb-1">
        <span class="text-sm text-neutral-body truncate">{{ row.label }}</span>
        <span class="text-sm font-medium text-brand-charcoal tabular-nums shrink-0">
          {{ formattedValue(row.value) }}
          <span
            v-if="row.subtext"
            class="font-normal text-neutral-muted"
          >{{ row.subtext }}</span>
        </span>
      </div>
      <div
        class="h-[10px] w-full"
        role="img"
        :aria-label="`${row.label}: ${formattedValue(row.value)}`"
      >
        <div
          class="h-full transition-[filter] duration-150 group-hover:brightness-95 rounded-r-[4px]"
          :style="{ width: `${pct(row.value)}%`, backgroundColor: row.colorHex }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    rows: { label: string; value: number; colorHex: string; subtext?: string }[]
    maxValue?: number
    valueFormatter?: (value: number) => string
  }>(),
  { maxValue: undefined, valueFormatter: undefined },
)

function pct(value: number): number {
  const max = props.maxValue ?? Math.max(...props.rows.map((r) => r.value), 1)
  if (max <= 0) return 0
  return Math.max((value / max) * 100, value > 0 ? 1.5 : 0)
}

function formattedValue(value: number): string {
  return props.valueFormatter ? props.valueFormatter(value) : value.toLocaleString()
}
</script>
