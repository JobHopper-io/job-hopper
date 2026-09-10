<script setup lang="ts">
// TEMP (Free tier removed): plan picker that onboarded, non-subscribed users are routed
// to by the router guard. Core/Premium only, each starting a 14-day trial that collects
// a card (create-checkout-session applies STANDARD_TRIAL_DAYS for base plans).
// Delete this file + the /choose-plan route + the guard block to restore the Free tier.
// Styling mirrors Pricing.vue (warm bg, .card tiers, "Most popular" pill, check lists).
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { subscriptionAPI, getProductPrice } from '@/lib/subscription'
import { authAPI } from '@/lib/auth'
import type { Product } from '@/types/database'

const router = useRouter()

const basePlanProducts = ref<Product[]>([])
const isLoading = ref(true)
const redirectingId = ref<string | null>(null)
const error = ref('')

const isCorePlan = (product: Product) => product.key === 'core'

// Feature bullets mirror Pricing.vue. Premium renders as "Everything in Core, plus:".
const PLAN_FEATURES: Record<string, string[]> = {
  core: [
    'Unlimited, automated daily job search + email digest',
    'Full sponsorship badge (heuristic)',
    'Full Hiring Intel',
    'Full Resume Advice',
    'Application tracker included',
  ],
  premium: [
    'Real Sponsorship Score',
    'Sponsor Watch',
    'Apply Intelligence',
    'Hiring manager contact',
  ],
}
function featuresFor(product: Product): string[] {
  return PLAN_FEATURES[product.key ?? ''] ?? (product.description ? [product.description] : [])
}

onMounted(async () => {
  const { data, error: loadError } = await subscriptionAPI.getBasePlanProducts()
  if (loadError || !data) {
    error.value = 'Unable to load plans right now. Please refresh and try again.'
  } else {
    basePlanProducts.value = [...data].sort((a, b) => a.price_cents - b.price_cents)
  }
  isLoading.value = false
})

async function proceedToCheckout(productId: string) {
  if (redirectingId.value) return
  redirectingId.value = productId
  error.value = ''
  const { data, error: checkoutError } = await subscriptionAPI.createCheckoutSession(
    [productId],
    `${window.location.origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    `${window.location.origin}/choose-plan`,
  )
  if (checkoutError || !data?.url) {
    error.value = 'Unable to start checkout. Please try again.'
    console.error('ChoosePlan checkout error:', checkoutError)
    redirectingId.value = null
    return
  }
  window.location.href = data.url
}

async function signOut() {
  await authAPI.signOut()
  await router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-[#fff7ed] py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <!-- Intro -->
      <section class="mb-14 text-center">
        <h1 class="text-brand-charcoal mb-4">Choose your plan</h1>
        <p class="text-xl text-neutral-body max-w-2xl mx-auto">
          The Free tier has been retired. Pick Core or Premium to keep going.
        </p>
        <p class="text-neutral-body max-w-2xl mx-auto mt-3">
          Both start with a <span class="font-semibold text-brand-charcoal">14-day free trial</span>.
          Add a card now — you're not charged until the trial ends, and you can cancel anytime before then.
        </p>
      </section>

      <!-- Loading -->
      <div v-if="isLoading" class="py-16 text-center">
        <font-awesome-icon :icon="['fas', 'spinner']" spin class="h-8 w-8 text-brand-primary" aria-hidden="true" />
      </div>

      <!-- Tiers -->
      <section v-else class="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch max-w-3xl mx-auto">
        <div
          v-for="product in basePlanProducts"
          :key="product.id"
          :class="[
            'card p-8 text-left flex flex-col',
            isCorePlan(product) ? 'border-2 border-brand-primary' : '',
          ]"
        >
          <div
            v-if="isCorePlan(product)"
            class="inline-block self-start bg-brand-primary text-white text-xs font-semibold px-3 py-1 rounded-full mb-4"
          >
            Most popular
          </div>
          <h3 class="text-xl font-heading font-semibold mb-2">{{ product.display_name }}</h3>
          <p class="mb-1 flex items-baseline gap-1">
            <span class="text-3xl font-bold text-brand-primary">
              ${{ getProductPrice(product) }}<span class="text-lg font-normal text-neutral-body">/month</span>
            </span>
          </p>
          <p class="text-sm text-neutral-body mb-6">14-day free trial, then billed monthly</p>

          <p v-if="!isCorePlan(product)" class="text-sm font-semibold text-brand-charcoal mb-2">
            Everything in Core, plus:
          </p>
          <ul class="space-y-2 text-sm text-neutral-body mb-8 flex-1">
            <li v-for="f in featuresFor(product)" :key="f" class="flex items-start">
              <font-awesome-icon
                :icon="['fas', 'check']"
                class="mr-2 mt-1 flex-shrink-0 text-brand-success"
                aria-hidden="true"
              />
              <span>{{ f }}</span>
            </li>
          </ul>

          <button
            type="button"
            class="btn-primary w-full text-center inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!!redirectingId"
            @click="proceedToCheckout(product.id)"
          >
            <font-awesome-icon
              v-if="redirectingId === product.id"
              :icon="['fas', 'spinner']"
              spin
              aria-hidden="true"
            />
            {{ redirectingId === product.id ? 'Redirecting…' : `Start ${product.display_name} trial` }}
          </button>
        </div>
      </section>

      <p
        v-if="error"
        class="mt-8 max-w-3xl mx-auto rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 text-center"
      >
        {{ error }}
      </p>

      <p class="mt-10 text-center">
        <button
          type="button"
          class="text-sm text-neutral-body hover:text-brand-charcoal underline"
          @click="signOut"
        >
          Sign out
        </button>
      </p>
    </div>
  </div>
</template>
