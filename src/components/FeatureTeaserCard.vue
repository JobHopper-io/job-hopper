<script setup lang="ts">
/**
 * Free-tier teaser card: shows 2-3 real fields, then blurs the rest under a
 * lock + "Upgrade to unlock" CTA. Presentational only — the real data lives in
 * PremiumInsightsModal / ResumeAdviceModal for paid tiers. Used on the Free dashboard.
 */
defineProps<{
  title: string
  realFields: string[]
  blurredFields: string[]
}>()
</script>

<template>
  <div class="card p-5">
    <p class="mb-3 text-sm font-semibold text-brand-charcoal">{{ title }}</p>

    <div class="space-y-1.5">
      <p v-for="field in realFields" :key="field" class="text-sm leading-relaxed text-neutral-body">
        {{ field }}
      </p>
    </div>

    <div class="relative mt-1.5">
      <div class="select-none space-y-1.5 blur-[4px]" aria-hidden="true">
        <p v-for="field in blurredFields" :key="field" class="text-sm leading-relaxed text-neutral-body">
          {{ field }}
        </p>
      </div>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        <font-awesome-icon :icon="['fas', 'lock']" class="text-brand-primary" aria-hidden="true" />
        <router-link
          :to="{ name: 'billing-purchase' }"
          class="text-sm font-semibold text-brand-primary hover:underline"
        >
          Upgrade to unlock
        </router-link>
      </div>
    </div>
  </div>
</template>
