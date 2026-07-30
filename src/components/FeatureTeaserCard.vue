<script setup lang="ts">
/**
 * Feature summary card, shared by Free and Core.
 * - Free passes `blurredFields`: the extra rows render blurred under a lock +
 *   "Upgrade to unlock" CTA.
 * - Core omits `blurredFields` (defaults to `[]`): the card renders fully
 *   unblurred with no lock/CTA — every row shown as real content.
 * Presentational only — the real per-job data lives in PremiumInsightsModal /
 * ResumeAdviceModal, reached from the job cards.
 */
withDefaults(
  defineProps<{
    title: string
    icon: [string, string]
    realFields: string[]
    blurredFields?: string[]
  }>(),
  { blurredFields: () => [] },
)
</script>

<template>
  <div class="rounded-[16px] border border-[#D3E3F9] bg-[#EAF1FC] p-5">
    <div class="mb-3 flex items-center gap-2.5">
      <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-primary">
        <font-awesome-icon :icon="icon" class="text-sm" aria-hidden="true" />
      </span>
      <p class="font-heading text-base font-semibold text-brand-charcoal">{{ title }}</p>
    </div>

    <div class="space-y-1.5">
      <p v-for="field in realFields" :key="field" class="text-sm leading-relaxed text-neutral-body">
        {{ field }}
      </p>
    </div>

    <div v-if="blurredFields.length" class="relative mt-1.5">
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
