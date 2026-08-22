<template>
  <div>
    <dt class="flex items-center gap-1.5 text-xs font-medium text-neutral-muted mb-1">
      <font-awesome-icon
        v-if="icon"
        :icon="icon"
        class="text-neutral-muted"
        aria-hidden="true"
      />
      {{ label }}
    </dt>
    <dd
      v-if="notTracked"
      class="text-lg font-heading font-semibold text-neutral-muted"
    >
      Not tracked
    </dd>
    <dd
      v-else
      class="text-2xl font-heading font-semibold text-brand-charcoal tabular-nums"
    >
      {{ value }}
    </dd>
    <p
      v-if="hint"
      class="text-[11px] text-neutral-muted mt-0.5"
    >
      {{ hint }}
    </p>
    <template v-if="meterPct !== undefined">
      <div class="h-[5px] w-full rounded-full mt-2" style="background-color: rgba(47, 110, 204, 0.15)">
        <div
          class="h-full rounded-full bg-brand-primary"
          :style="{ width: `${Math.min(Math.max(meterPct * 100, meterPct > 0 ? 2 : 0), 100)}%` }"
        />
      </div>
      <p
        v-if="meterCaption"
        class="text-[11px] text-neutral-muted mt-1"
      >
        {{ meterCaption }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value?: string | number
    hint?: string
    notTracked?: boolean
    /** e.g. ['fas', 'user'] - shown beside the label when there's no trend/sparkline to carry that space instead. */
    icon?: [string, string]
    /** Share of a real whole (0-1) - a proportion meter, never a fabricated trend. */
    meterPct?: number
    meterCaption?: string
  }>(),
  { value: undefined, hint: undefined, notTracked: false, icon: undefined, meterPct: undefined, meterCaption: undefined },
)
</script>
