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
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="flex items-center gap-3 text-3xl font-heading font-bold text-brand-charcoal mb-2">
          <font-awesome-icon :icon="['fas', 'crown']" class="text-brand-primary" aria-hidden="true" />
          Premium Tools
        </h1>
        <p class="text-neutral-body">
          Deeper sponsorship intelligence for your job search, built on real DOL/USCIS filing data.
        </p>
      </div>

      <template v-if="isPremium">
        <SponsorWatchManagementCard />
      </template>

      <!-- Free/Core: Premium isn't purchasable yet, so this is a waitlist capture, not an upsell CTA. -->
      <template v-else>
        <div class="card max-w-xl p-6">
          <div class="mb-4 flex items-center gap-2.5">
            <font-awesome-icon :icon="['fas', 'lock']" class="text-brand-primary" aria-hidden="true" />
            <h3 class="font-heading font-semibold text-brand-charcoal">Premium Tools are coming soon</h3>
          </div>
          <p class="text-sm text-neutral-body mb-4">
            Premium unlocks Sponsor Watch — real-time alerts when an employer's H-1B filing
            volume changes — plus more sponsorship intelligence tools built on real DOL/USCIS
            data. Premium isn't purchasable yet; leave your email and we'll notify you the moment
            it launches.
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
