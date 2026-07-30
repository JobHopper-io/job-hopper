<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import SponsorWatchManagementCard from '@/components/SponsorWatchManagementCard.vue'

const userStore = useUserStore()
const { baseTier } = storeToRefs(userStore)

const isPremium = computed(() => baseTier.value === 'premium')
</script>

<template>
  <div class="app-warm-bg min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header: centered hero block (icon on top) instead of Applications' left-aligned row -
           this is a single focused settings page, not a data list, so the whole column reads
           as one centered unit. -->
      <div class="mb-8 flex flex-col items-center text-center">
        <span class="mb-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
          <font-awesome-icon :icon="['fas', 'crown']" aria-hidden="true" />
        </span>
        <h1 class="text-3xl font-heading font-bold text-brand-charcoal">Sponsor Watch</h1>
        <p class="mt-1 text-neutral-body">
          Alerts when a watched employer's H-1B filing volume changes, built on real DOL/USCIS filing data.
        </p>
        <p class="mt-2 text-xs text-neutral-body/70">
          Government filing data updates quarterly, not daily, so watch checks and alerts run on that same
          schedule — usually every few months.
        </p>
      </div>

      <template v-if="isPremium">
        <SponsorWatchManagementCard />
      </template>

      <!-- Free/Core: upgrade CTA, same "Upgrade to unlock" pattern as FeatureTeaserCard's
      blurred-field lock. -->
      <template v-else>
        <div class="card p-6 text-center">
          <div class="mb-4 flex flex-col items-center gap-2">
            <font-awesome-icon :icon="['fas', 'lock']" class="text-brand-primary" aria-hidden="true" />
            <h3 class="font-heading font-semibold text-brand-charcoal">Sponsor Watch is a Premium feature</h3>
          </div>
          <p class="text-sm text-neutral-body mb-4">
            Premium unlocks Sponsor Watch — alerts when an employer's H-1B filing volume
            changes, built on real DOL/USCIS data (checked quarterly, not real-time).
          </p>
          <router-link :to="{ name: 'billing-purchase' }" class="btn-primary inline-block">
            Upgrade to Premium
          </router-link>
        </div>
      </template>
    </div>
  </div>
</template>
