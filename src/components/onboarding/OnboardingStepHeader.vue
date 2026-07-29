<script setup lang="ts">
defineProps<{
  icon: [string, string]
  title: string
  sub: string
}>()
</script>

<template>
  <div class="flex items-start gap-4">
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
      <font-awesome-icon :icon="icon" aria-hidden="true" />
    </span>
    <div>
      <h3 class="text-lg font-heading font-bold text-brand-charcoal">{{ title }}</h3>
      <p class="mt-0.5 text-sm text-neutral-body">{{ sub }}</p>
    </div>
  </div>
</template>
