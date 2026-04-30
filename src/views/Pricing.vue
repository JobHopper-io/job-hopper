<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { subscriptionAPI, getProductPrice } from '@/lib/subscription'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import type { Product } from '@/types/database'

const faqOpen = ref<number | null>(null)
const basePlanProducts = ref<Product[]>([])
const resumeUpgradeProduct = ref<Product | null>(null)
const resumeTailoringProduct = ref<Product | null>(null)

/** Base plans in display order (by price from DB; no hardcoded tier keys). */
const orderedBasePlans = computed(() =>
  [...basePlanProducts.value].sort((a, b) => a.price_cents - b.price_cents)
)

onMounted(async () => {
  const [baseRes, addonRes, adviceRes] = await Promise.all([
    subscriptionAPI.getBasePlanProducts(),
    subscriptionAPI.getAddonProducts(),
    resumeProductsAPI.getResumeAdviceProduct(),
  ])
  if (baseRes.data) basePlanProducts.value = baseRes.data
  if (addonRes.data) {
    resumeUpgradeProduct.value =
      addonRes.data.find((p) => p.key === 'resume_upgrade') ?? null
  }
  if (!adviceRes.error) {
    resumeTailoringProduct.value = adviceRes.data
  }
})

const toggleFaq = (index: number) => {
  faqOpen.value = faqOpen.value === index ? null : index
}

const pricingFaq = [
  {
    q: "Why are there different base prices?",
    a: "Pricing is based on the level of roles you're targeting. Executive-level searches typically involve higher compensation ranges and narrower, more specialized opportunities, so they're priced differently than entry and mid-level searches."
  },
  {
    q: "Do higher-priced tiers come with different features?",
    a: "All three tiers include the same core Job-Hopper experience. The main difference is the level of roles we're matching you with. Optional resume services—such as a one-time resume upgrade and per-job resume tailoring—are available as separate add-ons when you want them."
  },
  {
    q: "Can I change tiers later?",
    a: "Yes. If your career level or target roles change, you can upgrade or downgrade your base plan from your dashboard at any time."
  },
  {
    q: "Do I have to buy add-ons to get value?",
    a: "No. The base plans are designed to stand on their own. Resume add-ons are there if you want help refreshing your resume or tailoring it for a specific role."
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Every base plan begins with a free trial so you can see the quality and relevance of your matches before you commit."
  },
  {
    q: "How do billing and cancellation work?",
    a: "Plans are billed monthly. You can cancel at any time in just a couple of clicks from your account settings. Resume add-ons are one-time purchases billed at checkout, not recurring subscription charges."
  }
]
</script>

<template>
  <div class="min-h-screen bg-white py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-6xl mx-auto">
      <!-- Intro -->
      <section class="mb-16 text-center">
        <h1 class="text-brand-charcoal mb-6">
          Simple plans based on where you are in your career.
        </h1>
        <p class="text-xl text-neutral-body mb-4">
          Pick the level that matches the roles you're targeting. Add resume services only if you want them.
        </p>
        <p class="text-neutral-body max-w-3xl mx-auto">
          Job-Hopper is priced by career stage and job type, not just by features. Every plan starts with the same core service: curated, high-quality job matches delivered to your inbox and dashboard, powered by AI and human vetting.
        </p>
        <p class="text-neutral-body max-w-3xl mx-auto mt-4">
          The only difference between tiers is the type and level of roles you're using Job-Hopper to pursue - whether that's entry and mid-level positions, senior and management roles, or Director, VP, and C-level opportunities.
        </p>
      </section>

      <!-- Base Plans -->
      <section class="mb-16">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <template v-for="(product, index) in orderedBasePlans" :key="product.id">
            <div
              :class="[
                'card p-8 text-left',
                index === 1 ? 'border-2 border-brand-primary' : ''
              ]"
            >
              <div v-if="index === 1" class="inline-block bg-brand-primary text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">Most popular</div>
              <h3 class="text-xl font-heading font-semibold mb-2">{{ product.display_name }}</h3>
              <p class="text-3xl font-bold text-brand-primary mb-1">From ${{ getProductPrice(product) }}<span class="text-lg font-normal text-neutral-body">/month</span></p>
              <p class="text-sm text-neutral-body mb-6">{{ product.description || '' }}</p>
              <div class="border-t border-neutral-border pt-6 mb-6">
                <p class="text-sm font-semibold text-brand-charcoal mb-4">What's included:</p>
                <ul class="space-y-2 text-sm text-neutral-body">
                  <li class="flex items-start">
                    <svg class="w-4 h-4 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>Curated job matches aligned with your experience level</span>
                  </li>
                  <li class="flex items-start">
                    <svg class="w-4 h-4 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>Matching by role type, pay range, and location</span>
                  </li>
                  <li class="flex items-start">
                    <svg class="w-4 h-4 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>Active, vetted postings filtered for recency</span>
                  </li>
                  <li class="flex items-start">
                    <svg class="w-4 h-4 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>AI-assisted job briefings</span>
                  </li>
                  <li class="flex items-start">
                    <svg class="w-4 h-4 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>Personal job feed in dashboard</span>
                  </li>
                  <li class="flex items-start">
                    <svg class="w-4 h-4 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>Email delivery of new matches</span>
                  </li>
                </ul>
              </div>
              <router-link to="/register" class="btn-primary w-full text-center block">
                Start free trial
              </router-link>
            </div>
          </template>
        </div>
      </section>

      <!-- Resume add-ons -->
      <section class="mb-16">
        <h2 class="text-brand-charcoal mb-4 text-center">
          Optional resume services you can add to any plan.
        </h2>
        <p class="text-neutral-body mb-8 text-center">
          Keep it simple with the base service, or add a one-time resume upgrade or per-job tailoring when you need it.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div class="card p-6">
            <h3 class="text-lg font-heading font-semibold mb-2">
              {{ resumeUpgradeProduct?.display_name ?? 'Resume upgrade' }}
            </h3>
            <p class="text-xl font-bold text-brand-primary mb-4">
              <template v-if="resumeUpgradeProduct">
                ${{ getProductPrice(resumeUpgradeProduct).toFixed(2) }}<span class="text-sm font-normal text-neutral-body"> one-time</span>
              </template>
              <template v-else>—</template>
            </p>
            <p class="text-sm text-neutral-body mb-4">
              {{ resumeUpgradeProduct?.description ?? 'Have your resume professionally refreshed and aligned to the types of roles you are targeting through Job-Hopper.' }}
            </p>
            <p class="text-sm text-neutral-body">One-time purchase at checkout—no ongoing charges.</p>
          </div>
          <div class="card p-6">
            <h3 class="text-lg font-heading font-semibold mb-2">
              {{ resumeTailoringProduct?.display_name ?? 'Per-job resume advice' }}
            </h3>
            <p class="text-xl font-bold text-brand-primary mb-4">
              <template v-if="resumeTailoringProduct">
                ${{ getProductPrice(resumeTailoringProduct).toFixed(2) }}<span class="text-sm font-normal text-neutral-body"> per job</span>
              </template>
              <template v-else>—</template>
            </p>
            <p class="text-sm text-neutral-body mb-4">
              {{ resumeTailoringProduct?.description ?? 'Purchase advice for a specific matched role from your dashboard or job detail view.' }}
            </p>
            <p class="text-sm text-neutral-body">Billed per job when you choose to tailor—great for roles you are seriously pursuing.</p>
          </div>
        </div>
      </section>

      <!-- Reassurance Strip -->
      <section class="mb-16 card p-8 bg-neutral-bg">
        <h2 class="text-brand-charcoal mb-6 text-center">
          Every plan starts with the same core advantage.
        </h2>
        <p class="text-neutral-body mb-6 text-center">
          No matter which tier you choose, Job-Hopper gives you:
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span class="text-neutral-body">Curated, vetted job matches instead of endless scrolling</span>
          </div>
          <div class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span class="text-neutral-body">Matching powered by automation engine plus human review</span>
          </div>
          <div class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span class="text-neutral-body">A personal job feed in your dashboard</span>
          </div>
          <div class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span class="text-neutral-body">Email delivery of new opportunities</span>
          </div>
        </div>
      </section>

      <!-- Pricing FAQ -->
      <section class="mb-16">
        <h2 class="text-brand-charcoal mb-8 text-center">
          Questions about pricing?
        </h2>
        <div class="max-w-3xl mx-auto space-y-4">
          <div v-for="(item, index) in pricingFaq" :key="index" class="card">
            <button
              @click="toggleFaq(index)"
              class="w-full text-left p-6 flex justify-between items-center hover:bg-neutral-bg transition-colors"
            >
              <span class="font-semibold text-brand-charcoal">{{ item.q }}</span>
              <svg
                :class="['w-5 h-5 text-neutral-body transition-transform', faqOpen === index ? 'rotate-180' : '']"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
            <div v-if="faqOpen === index" class="px-6 pb-6">
              <p class="text-neutral-body">{{ item.a }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Final CTA -->
      <section class="text-center">
        <h2 class="text-brand-charcoal mb-4">
          Pick your level. We'll handle the search.
        </h2>
        <p class="text-neutral-body mb-8 max-w-2xl mx-auto">
          Choose the plan that matches your next step, set up your profile in about a minute, and start receiving curated job matches. Add premium tools only if and when you need them.
        </p>
        <router-link to="/register" class="btn-primary inline-block mb-4">
          Start your free trial
        </router-link>
        <p class="text-sm text-neutral-body">
          <router-link to="/how-it-works" class="text-brand-primary hover:underline">Still deciding? Visit How It Works.</router-link>
        </p>
      </section>
    </div>
  </div>
</template>

