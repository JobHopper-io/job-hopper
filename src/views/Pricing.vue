<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { subscriptionAPI, getProductPrice } from '@/lib/subscription'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { authAPI } from '@/lib/auth'
import type { Product } from '@/types/database'

const faqOpen = ref<number | null>(null)
const resumeUpgradeProduct = ref<Product | null>(null)
const resumeTailoringProduct = ref<Product | null>(null)

// Premium is not sellable yet. This modal captures interest (email + profile id if
// signed in, resolved server-side) via the premium-waitlist edge function.
const waitlistOpen = ref(false)
const waitlistEmail = ref('')
const waitlistSubmitted = ref(false)
const waitlistLoading = ref(false)
const waitlistError = ref('')
const currentUserId = ref<string | null>(null)

const openWaitlist = () => {
  waitlistSubmitted.value = false
  waitlistError.value = ''
  waitlistOpen.value = true
}
const closeWaitlist = () => {
  waitlistOpen.value = false
}
const submitWaitlist = async () => {
  if (!waitlistEmail.value.trim()) return
  waitlistLoading.value = true
  waitlistError.value = ''
  const { error } = await subscriptionAPI.joinPremiumWaitlist(waitlistEmail.value.trim())
  waitlistLoading.value = false
  if (error) {
    waitlistError.value = 'Could not join the waitlist. Please try again.'
    return
  }
  waitlistSubmitted.value = true
}

onMounted(async () => {
  const [addonRes, adviceRes, userRes] = await Promise.all([
    subscriptionAPI.getAddonProducts(),
    resumeProductsAPI.getResumeAdviceProduct(),
    authAPI.getCurrentUser(),
  ])
  if (addonRes.data) {
    resumeUpgradeProduct.value = addonRes.data.find((p) => p.key === 'resume_upgrade') ?? null
  }
  if (!adviceRes.error) {
    resumeTailoringProduct.value = adviceRes.data
  }
  const user = userRes?.user
  if (user) {
    currentUserId.value = user.id
    if (user.email) waitlistEmail.value = user.email
  }
})

const toggleFaq = (index: number) => {
  faqOpen.value = faqOpen.value === index ? null : index
}

// ── Sellable tiers (Free / Core). Premium is rendered separately as a locked card. ──
const sellableTiers = [
  {
    name: 'Free',
    price: '$0',
    note: 'No card required',
    popular: false,
    cta: 'Get started free',
    features: [
      { label: 'Manual job search (capped)', included: true },
      { label: 'Sponsorship badge — teaser view only', included: true },
      { label: 'Premium Insights — a few fields visible, rest blurred', included: true },
      { label: 'Resume Advice — teaser', included: true },
      { label: 'Application tracker', included: false },
      { label: 'Automated matching & email digest', included: false },
    ],
  },
  {
    name: 'Core',
    price: '$29',
    note: 'Billed monthly',
    popular: true,
    cta: 'Start with Core',
    features: [
      { label: 'Unlimited, automated daily job search + email digest', included: true },
      { label: 'Full sponsorship badge (heuristic)', included: true },
      { label: 'Full Premium Insights', included: true },
      { label: 'Full Resume Advice', included: true },
      { label: 'Application tracker included', included: true },
    ],
  },
]

const premiumFeatures = [
  'Real Sponsorship Score',
  'Sponsor Watch',
  'Apply Intelligence',
  'Hiring manager contact',
  'Ghost Listing Detector',
]

// ── Feature comparison. Cell values: true = included, false = not included, string = label. ──
const comparisonColumns = ['Free', 'Core', 'Premium']
const comparisonRows: { feature: string; cells: (boolean | string)[] }[] = [
  { feature: 'Manual job search', cells: ['Capped', 'Unlimited', 'Unlimited'] },
  { feature: 'Automated matching + email digest', cells: [false, true, true] },
  { feature: 'Sponsorship badge', cells: ['Teaser', 'Full (heuristic)', 'Full'] },
  { feature: 'Premium Insights', cells: ['Limited', 'Full', 'Full'] },
  { feature: 'Resume Advice', cells: ['Teaser', 'Full', 'Full'] },
  { feature: 'Application tracker', cells: [false, true, true] },
  { feature: 'Real Sponsorship Score', cells: [false, false, 'Coming soon'] },
  { feature: 'Sponsor Watch', cells: [false, false, 'Coming soon'] },
  { feature: 'Apply Intelligence', cells: [false, false, 'Coming soon'] },
  { feature: 'Hiring manager contact', cells: [false, false, 'Coming soon'] },
  { feature: 'Ghost Listing Detector', cells: [false, false, 'Coming soon'] },
]

const pricingFaq = [
  {
    q: 'Why are there different prices?',
    a: "Because the plans differ in how much Job-Hopper automates for you — not by seniority or job type. Free lets you search manually with capped access and teaser insights. Core adds unlimited automated matching, email digests, full insights, full resume advice, and an application tracker. Premium (coming soon) layers on a deeper sponsorship intelligence set.",
  },
  {
    q: 'Do higher tiers come with different features?',
    a: "Yes — that's the whole point. Core unlocks automated daily matching, the full sponsorship badge, full Premium Insights, full Resume Advice, and the application tracker. Premium (coming soon) adds the real sponsorship intelligence layer: Real Sponsorship Score, Sponsor Watch, Apply Intelligence, hiring manager contact, and the Ghost Listing Detector.",
  },
  {
    q: 'Can I change tiers later?',
    a: 'Yes. You can upgrade or downgrade your plan from your dashboard at any time as your needs change.',
  },
  {
    q: 'Do I have to buy add-ons to get value?',
    a: "No. Core stands on its own. The resume add-ons — a one-time resume upgrade and per-job resume tailoring — are there only if you want extra help, and they're unaffected by your plan tier.",
  },
  {
    q: 'Is there a free trial?',
    a: "Yes — Core starts with a free trial, so you can see the quality and relevance of your matches before you commit. Premium isn't purchasable yet, so there's no trial for it; join the waitlist and we'll notify you the moment it launches.",
  },
  {
    q: 'How do billing and cancellation work?',
    a: 'Core is billed monthly and you can cancel at any time in a couple of clicks from your account settings. Resume add-ons are one-time purchases billed at checkout, not recurring subscription charges.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-white py-20 px-4 sm:px-6 lg:px-8">
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

      <!-- Tiers -->
      <section class="mb-16">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          <!-- Free / Core -->
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
            <p class="text-3xl font-bold text-brand-primary mb-1">
              {{ tier.price }}<span class="text-lg font-normal text-neutral-body">/month</span>
            </p>
            <p class="text-sm text-neutral-body mb-6">{{ tier.note }}</p>
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

          <!-- Premium (locked / not yet buyable) -->
          <div class="card p-8 text-left flex flex-col border-2 border-dashed border-neutral-border bg-neutral-bg">
            <div class="inline-flex items-center gap-1.5 self-start bg-neutral-border text-brand-charcoal text-xs font-semibold px-3 py-1 rounded-full mb-4">
              <font-awesome-icon :icon="['fas', 'lock']" /> Coming soon
            </div>
            <h3 class="text-xl font-heading font-semibold mb-2">Premium</h3>
            <p class="text-lg font-semibold text-neutral-body mb-1">$49/mo at launch</p>
            <p class="text-sm text-neutral-body mb-6">Not purchasable yet — join the waitlist for early access.</p>
            <p class="text-sm font-semibold text-brand-charcoal mb-2">Everything in Core, plus:</p>
            <ul class="space-y-2 text-sm text-neutral-body mb-6 flex-1">
              <li v-for="f in premiumFeatures" :key="f" class="flex items-start">
                <font-awesome-icon :icon="['fas', 'lock']" class="mr-2 mt-1 flex-shrink-0 text-neutral-body/40" />
                <span>{{ f }}</span>
              </li>
            </ul>
            <p class="text-xs text-neutral-body mb-4">
              These features are in active development. Join the waitlist to get early access and be notified the moment they launch.
            </p>
            <button
              type="button"
              class="btn-secondary w-full flex items-center justify-center gap-2"
              @click="openWaitlist"
            >
              <font-awesome-icon :icon="['fas', 'envelope']" /> Join the waitlist
            </button>
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
                  <span v-if="col === 'Premium'" class="block text-xs font-normal text-neutral-body">Coming soon</span>
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
                  <span
                    v-else
                    :class="cell === 'Coming soon' ? 'text-xs font-medium text-brand-primary' : 'text-neutral-body'"
                  >
                    {{ cell }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Resume add-ons (unchanged — unaffected by the tier restructure) -->
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
        <p class="text-sm text-neutral-body mb-6 text-center max-w-2xl mx-auto">
          The same curated matching, dashboard feed, and optional tools such as sponsorship-likelihood signals when they are relevant to your search—still fundamentally an AI that runs your job search, not a niche sponsorship-only service.
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
          Choose Free or Core, set up your profile in about a minute, and start receiving curated job matches. Premium's deeper sponsorship tools are coming soon—join the waitlist to get early access.
        </p>
        <router-link to="/register" class="btn-primary inline-block mb-4">
          Start your free trial
        </router-link>
        <p class="text-sm text-neutral-body">
          <router-link to="/how-it-works" class="text-brand-primary hover:underline">Still deciding? Visit How It Works.</router-link>
        </p>
      </section>
    </div>

    <!-- Premium waitlist modal -->
    <div
      v-if="waitlistOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Join the Premium waitlist"
      @click.self="closeWaitlist"
    >
      <div class="bg-white rounded-[12px] shadow-lg max-w-md w-full p-6">
        <div class="flex items-start justify-between mb-4">
          <h3 class="text-lg font-heading font-semibold text-brand-charcoal">Join the Premium waitlist</h3>
          <button type="button" aria-label="Close" @click="closeWaitlist">
            <font-awesome-icon :icon="['fas', 'xmark']" class="text-neutral-body" />
          </button>
        </div>
        <template v-if="!waitlistSubmitted">
          <p class="text-sm text-neutral-body mb-4">
            Premium's deeper sponsorship intelligence is in active development. Leave your email and we'll notify you the moment it launches.
          </p>
          <form @submit.prevent="submitWaitlist">
            <input
              v-model="waitlistEmail"
              type="email"
              required
              placeholder="you@example.com"
              class="input mb-4"
            >
            <p v-if="waitlistError" class="text-sm text-red-600 mb-4">{{ waitlistError }}</p>
            <button type="submit" class="btn-primary w-full" :disabled="waitlistLoading">
              {{ waitlistLoading ? 'Joining…' : 'Notify me' }}
            </button>
          </form>
        </template>
        <template v-else>
          <p class="text-sm text-neutral-body">
            Thanks—you're on the list. We'll email you at
            <span class="font-semibold text-brand-charcoal">{{ waitlistEmail }}</span>
            when Premium launches.
          </p>
          <button type="button" class="btn-primary w-full mt-4" @click="closeWaitlist">Done</button>
        </template>
      </div>
    </div>
  </div>
</template>
