<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { subscriptionAPI } from '@/lib/subscription'
import SponsorWatchManagementCard from '@/components/SponsorWatchManagementCard.vue'

const userStore = useUserStore()
const { profile, baseTier } = storeToRefs(userStore)

const isPremium = computed(() => baseTier.value === 'premium')

// Premium is not sellable yet (products.premium.available_for_purchase = false): Free/Core
// see the same "join the waitlist" capture used on /pricing and onboarding, not a redirect -
// same in-place-teaser philosophy as the rest of the app (FeatureTeaserCard, Dashboard's Free
// branch) rather than bouncing the user away from a route they navigated to on purpose.
const waitlistEmail = ref(profile.value?.email ?? '')
const waitlistState = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const waitlistError = ref('')

async function joinWaitlist() {
  if (!waitlistEmail.value.trim()) return
  waitlistState.value = 'loading'
  waitlistError.value = ''
  const { error } = await subscriptionAPI.joinPremiumWaitlist(waitlistEmail.value.trim())
  if (error) {
    waitlistState.value = 'error'
    waitlistError.value = 'Could not join the waitlist. Please try again.'
    return
  }
  waitlistState.value = 'done'
}
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
          Real-time alerts when a watched employer's H-1B filing volume changes, built on real DOL/USCIS filing data.
        </p>
      </div>

      <template v-if="isPremium">
        <SponsorWatchManagementCard />
      </template>

      <!-- Free/Core: Premium isn't purchasable yet, so this is a waitlist capture, not an upsell CTA. -->
      <template v-else>
        <div class="card p-6 text-center">
          <div class="mb-4 flex flex-col items-center gap-2">
            <font-awesome-icon :icon="['fas', 'lock']" class="text-brand-primary" aria-hidden="true" />
            <h3 class="font-heading font-semibold text-brand-charcoal">Sponsor Watch is coming soon</h3>
          </div>
          <p class="text-sm text-neutral-body mb-4">
            Premium unlocks Sponsor Watch — real-time alerts when an employer's H-1B filing
            volume changes, built on real DOL/USCIS data. Premium isn't purchasable yet; leave
            your email and we'll notify you the moment it launches.
          </p>

          <template v-if="waitlistState !== 'done'">
            <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="joinWaitlist">
              <input
                v-model="waitlistEmail"
                type="email"
                required
                placeholder="you@example.com"
                class="input flex-1"
              >
              <button type="submit" class="btn-primary shrink-0" :disabled="waitlistState === 'loading'">
                {{ waitlistState === 'loading' ? 'Joining…' : 'Join the waitlist' }}
              </button>
            </form>
            <p v-if="waitlistState === 'error'" class="mt-2 text-sm text-red-600">{{ waitlistError }}</p>
          </template>
          <p v-else class="text-sm text-neutral-body">
            <font-awesome-icon :icon="['fas', 'circle-check']" class="text-green-700" aria-hidden="true" />
            You're on the waitlist — we'll email you at
            <span class="font-semibold text-brand-charcoal">{{ waitlistEmail }}</span>
            when Premium launches.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
