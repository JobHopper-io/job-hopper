<script setup lang="ts">
import { ref, computed } from 'vue'

const faqOpen = ref<number | null>(null)

const toggleFaq = (index: number) => {
  faqOpen.value = faqOpen.value === index ? null : index
}

// ── Billing cycle toggle. Display-only for now: discounted prices are computed
// client-side off the existing monthly price_cents — quarterly/yearly aren't real
// Stripe billing intervals yet (create-checkout-session only ever creates monthly
// recurring prices). Wire this up for real (new Stripe prices + checkout support)
// once the pricing itself is signed off.
type BillingCycle = 'monthly' | 'quarterly' | 'yearly'
const billingCycle = ref<BillingCycle>('monthly')
const cycleOptions: { value: BillingCycle; label: string; discountPct: number }[] = [
  { value: 'monthly', label: 'Monthly', discountPct: 0 },
  { value: 'quarterly', label: 'Quarterly', discountPct: 10 },
  { value: 'yearly', label: 'Yearly', discountPct: 20 },
]
const cycleMonths: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, yearly: 12 }
const currentDiscountPct = computed(
  () => cycleOptions.find((c) => c.value === billingCycle.value)?.discountPct ?? 0,
)

function discountedMonthlyPrice(basePrice: number): number {
  return basePrice * (1 - currentDiscountPct.value / 100)
}
function showStrikethrough(basePrice: number): boolean {
  return basePrice > 0 && currentDiscountPct.value > 0
}
function periodTotal(basePrice: number): number {
  return discountedMonthlyPrice(basePrice) * cycleMonths[billingCycle.value]
}
function billingNote(basePrice: number): string {
  if (basePrice === 0) return 'No card required'
  if (billingCycle.value === 'monthly') return 'Billed monthly'
  const total = periodTotal(basePrice).toFixed(2)
  return billingCycle.value === 'quarterly'
    ? `Billed quarterly ($${total} every 3 months)`
    : `Billed yearly ($${total}/year)`
}

// ── Sellable tiers (Core). Premium is rendered separately below. Both start with a
// 14-day free trial (card required). There is no Free tier. ──
const sellableTiers = [
  {
    name: 'Core',
    basePrice: 29.99,
    popular: true,
    cta: 'Start with Core',
    features: [
      { label: 'Unlimited, automated daily job search + email digest', included: true },
      { label: 'Full sponsorship badge (heuristic)', included: true },
      { label: 'Full Hiring Intel', included: true },
      { label: 'Full Resume Advice', included: true },
      { label: 'Application tracker included', included: true },
      { label: 'Hiring manager contact', included: true },
    ],
  },
]

const premiumBasePrice = 49.99

const premiumFeatures = [
  'Real Sponsorship Score',
  'Sponsor Watch',
  'Apply Intelligence',
  'Ghost Listing Detector',
]

// ── Feature comparison. Cell values: true = included, false = not included, string = label. ──
const comparisonColumns = ['Core', 'Premium']
const comparisonRows: { feature: string; cells: (boolean | string)[] }[] = [
  { feature: 'Manual job search', cells: ['Unlimited', 'Unlimited'] },
  { feature: 'Automated matching + email digest', cells: [true, true] },
  { feature: 'Sponsorship badge', cells: ['Full (heuristic)', 'Full'] },
  { feature: 'Hiring Intel', cells: ['Full', 'Full'] },
  { feature: 'Resume Advice', cells: ['Full', 'Full'] },
  { feature: 'Application tracker', cells: [true, true] },
  { feature: 'Hiring manager contact', cells: [true, true] },
  { feature: 'Real Sponsorship Score', cells: [false, true] },
  { feature: 'Sponsor Watch', cells: [false, true] },
  { feature: 'Apply Intelligence', cells: [false, true] },
  { feature: 'Ghost Listing Detector', cells: [false, true] },
]

const pricingFaq = [
  {
    q: 'Why are there different prices?',
    a: "Because the plans differ in how much Job-Hopper automates for you — not by seniority or job type. Core gives you unlimited automated matching, email digests, full insights, full resume advice, and an application tracker. Premium layers on a deeper sponsorship intelligence set.",
  },
  {
    q: 'Do higher tiers come with different features?',
    a: "Yes — that's the whole point. Core unlocks automated daily matching, the full sponsorship badge, full Hiring Intel, full Resume Advice, the application tracker, and hiring manager contact. Premium adds the real sponsorship intelligence layer: Real Sponsorship Score, Sponsor Watch, Apply Intelligence, and the Ghost Listing Detector.",
  },
  {
    q: 'Can I change tiers later?',
    a: 'Yes. You can upgrade or downgrade your plan from your dashboard at any time as your needs change.',
  },
  {
    q: 'Is there a free trial?',
    a: "Yes — Core and Premium both start with a 14-day free trial. You add a card up front and aren't charged until the trial ends, so you can see the quality and relevance of your matches before you commit. Cancel anytime before it ends and you won't pay.",
  },
  {
    q: 'How do billing and cancellation work?',
    a: 'Core and Premium can be billed monthly, quarterly (10% off), or yearly (20% off), and you can cancel at any time in a couple of clicks from your account settings.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-[#fff7ed] py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-6xl mx-auto">
      <!-- Intro -->
      <section class="mb-16 text-center">
        <h1 class="text-brand-charcoal mb-6">
          Simple plans, priced by depth — not seniority.
        </h1>
        <p class="text-xl text-neutral-body mb-4 max-w-3xl mx-auto">
          Job-Hopper gives every user the same core service: curated, high-quality job matches delivered to your inbox and dashboard, powered by AI and human vetting.
        </p>
        <p class="text-neutral-body max-w-3xl mx-auto">
          Pick the tier that matches how much you want automated for you.
        </p>
      </section>

      <!-- Billing cycle toggle -->
      <section class="mb-10 flex justify-center">
        <div class="inline-flex items-center bg-white border border-neutral-border rounded-full p-1 gap-1">
          <button
            v-for="option in cycleOptions"
            :key="option.value"
            type="button"
            :class="[
              'px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2',
              billingCycle === option.value
                ? 'bg-brand-primary text-white'
                : 'text-neutral-body hover:text-brand-charcoal',
            ]"
            @click="billingCycle = option.value"
          >
            {{ option.label }}
            <span
              v-if="option.discountPct > 0"
              :class="[
                'text-xs font-bold px-2 py-0.5 rounded-full',
                billingCycle === option.value ? 'bg-white/20' : 'bg-brand-success/10 text-brand-success',
              ]"
            >
              Save {{ option.discountPct }}%
            </span>
          </button>
        </div>
      </section>

      <!-- Tiers -->
      <section class="mb-16">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch max-w-4xl mx-auto">
          <!-- Core -->
          <div
            v-for="tier in sellableTiers"
            :key="tier.name"
            :class="[
              'card p-8 text-left flex flex-col',
              tier.popular ? 'border-2 border-brand-primary' : '',
            ]"
          >
            <div
              v-if="tier.popular"
              class="inline-block self-start bg-brand-primary text-white text-xs font-semibold px-3 py-1 rounded-full mb-4"
            >
              Most popular
            </div>
            <h3 class="text-xl font-heading font-semibold mb-2">{{ tier.name }}</h3>
            <p class="mb-1 flex items-baseline gap-2 flex-wrap">
              <span
                v-if="showStrikethrough(tier.basePrice)"
                class="text-lg font-normal text-neutral-body/50 line-through"
              >
                ${{ tier.basePrice.toFixed(2) }}
              </span>
              <span class="text-3xl font-bold text-brand-primary">
                ${{ discountedMonthlyPrice(tier.basePrice).toFixed(tier.basePrice === 0 ? 0 : 2) }}<span class="text-lg font-normal text-neutral-body">/month</span>
              </span>
            </p>
            <p class="text-sm text-neutral-body mb-6">{{ billingNote(tier.basePrice) }}</p>
            <ul class="space-y-2 text-sm text-neutral-body mb-6 flex-1">
              <li v-for="f in tier.features" :key="f.label" class="flex items-start">
                <font-awesome-icon
                  :icon="['fas', f.included ? 'check' : 'xmark']"
                  :class="['mr-2 mt-1 flex-shrink-0', f.included ? 'text-brand-success' : 'text-neutral-body/40']"
                />
                <span :class="f.included ? '' : 'text-neutral-body/60'">{{ f.label }}</span>
              </li>
            </ul>
            <router-link to="/register" class="btn-primary w-full text-center block">
              {{ tier.cta }}
            </router-link>
          </div>

          <!-- Premium -->
          <div class="card p-8 text-left flex flex-col border-2 border-brand-primary">
            <h3 class="text-xl font-heading font-semibold mb-2">Premium</h3>
            <p class="mb-1 flex items-baseline gap-2 flex-wrap">
              <span
                v-if="showStrikethrough(premiumBasePrice)"
                class="text-lg font-normal text-neutral-body/50 line-through"
              >
                ${{ premiumBasePrice.toFixed(2) }}
              </span>
              <span class="text-3xl font-bold text-brand-primary">
                ${{ discountedMonthlyPrice(premiumBasePrice).toFixed(2) }}<span class="text-lg font-normal text-neutral-body">/month</span>
              </span>
            </p>
            <p class="text-sm text-neutral-body mb-6">{{ billingNote(premiumBasePrice) }}</p>
            <p class="text-sm font-semibold text-brand-charcoal mb-2">Everything in Core, plus:</p>
            <ul class="space-y-2 text-sm text-neutral-body mb-6 flex-1">
              <li v-for="f in premiumFeatures" :key="f" class="flex items-start">
                <font-awesome-icon :icon="['fas', 'check']" class="mr-2 mt-1 flex-shrink-0 text-brand-success" />
                <span>{{ f }}</span>
              </li>
            </ul>
            <router-link to="/register" class="btn-primary w-full text-center block">
              Start with Premium
            </router-link>
          </div>
        </div>
      </section>

      <!-- Feature comparison -->
      <section class="mb-16">
        <h2 class="text-brand-charcoal mb-8 text-center">Compare features across plans.</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr class="border-b border-neutral-border">
                <th class="text-left font-semibold text-brand-charcoal py-3 pr-4">Feature</th>
                <th
                  v-for="col in comparisonColumns"
                  :key="col"
                  class="text-center font-semibold text-brand-charcoal py-3 px-4"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparisonRows" :key="row.feature" class="border-b border-neutral-border">
                <td class="text-left text-neutral-body py-3 pr-4">{{ row.feature }}</td>
                <td v-for="(cell, ci) in row.cells" :key="ci" class="text-center py-3 px-4">
                  <font-awesome-icon
                    v-if="cell === true"
                    :icon="['fas', 'check']"
                    class="text-brand-success"
                  />
                  <span v-else-if="cell === false" class="text-neutral-body/30">—</span>
                  <span v-else class="text-neutral-body">{{ cell }}</span>
                </td>
              </tr>
            </tbody>
          </table>
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
        <p class="text-sm text-neutral-body mb-6 text-center max-w-2xl mx-auto">
          The same curated matching, dashboard feed, and optional tools such as sponsorship-likelihood signals when they are relevant to your search—still fundamentally an AI that runs your job search, not a niche sponsorship only service.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div class="flex items-start">
            <font-awesome-icon :icon="['fas', 'check']" class="text-brand-success mr-3 mt-1 flex-shrink-0" />
            <span class="text-neutral-body">Curated, vetted job matches instead of endless scrolling</span>
          </div>
          <div class="flex items-start">
            <font-awesome-icon :icon="['fas', 'check']" class="text-brand-success mr-3 mt-1 flex-shrink-0" />
            <span class="text-neutral-body">Matching powered by automation engine plus human review</span>
          </div>
          <div class="flex items-start">
            <font-awesome-icon :icon="['fas', 'check']" class="text-brand-success mr-3 mt-1 flex-shrink-0" />
            <span class="text-neutral-body">A personal job feed in your dashboard</span>
          </div>
          <div class="flex items-start">
            <font-awesome-icon :icon="['fas', 'check']" class="text-brand-success mr-3 mt-1 flex-shrink-0" />
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
              class="w-full text-left p-6 flex justify-between items-center hover:bg-neutral-bg transition-colors"
              @click="toggleFaq(index)"
            >
              <span class="font-semibold text-brand-charcoal">{{ item.q }}</span>
              <font-awesome-icon
                :icon="['fas', 'chevron-down']"
                :class="['text-neutral-body transition-transform', faqOpen === index ? 'rotate-180' : '']"
              />
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
          Pick your plan. We'll handle the search.
        </h2>
        <p class="text-neutral-body mb-8 max-w-2xl mx-auto">
          Choose Core or Premium, set up your profile in about a minute, and start receiving curated job matches. Both start with a 14-day free trial.
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
