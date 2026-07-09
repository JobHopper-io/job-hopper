<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWindowScroll } from '@vueuse/core'
import jobHopperLogo from '@/assets/job-hopper-logo.png'

// ── Scroll-reveal directive ───────────────────────────────────────────────────
// Fade-up-on-scroll approximation of the design's framer-motion `FadeUp`.
// The element starts hidden and transitions in once it enters the viewport.
// An optional numeric binding value adds a stagger delay (seconds).
const vReveal = {
  mounted(el: HTMLElement, binding: { value?: number }) {
    el.classList.add('reveal')
    if (typeof binding.value === 'number' && binding.value > 0) {
      el.style.transitionDelay = `${binding.value}s`
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('reveal-in')
            io.unobserve(el)
          }
        }
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.05 },
    )
    io.observe(el)
  },
}

// ── Nav state ─────────────────────────────────────────────────────────────────
const { y: scrollY } = useWindowScroll()
const scrolled = computed(() => scrollY.value > 8)
const mobileOpen = ref(false)

const navLinks = [
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Get the App', to: '/install-app' },
  { label: 'FAQ', to: '/faq' },
]

// ── Hero ──────────────────────────────────────────────────────────────────────
const heroChecks = [
  'AI-matched to your role, pay, and location',
  'Only active, high-quality postings',
  'Hiring-contact insights and interview prep on premium plans',
  'Sponsorship-likelihood signal (estimate only, not a guarantee)',
]

// ── Hero graphic bars ─────────────────────────────────────────────────────────
const funnelBars = [
  { w: 160, o: 0.3 },
  { w: 112, o: 0.4 },
  { w: 64, o: 0.6 },
]
const ghostCards = [
  { role: 'UX Lead', co: 'Stripe' },
  { role: 'Product Designer', co: 'Linear' },
]

// ── Problem ───────────────────────────────────────────────────────────────────
const problemCards = [
  { icon: 'paper-plane', text: 'Apply to hundreds, hear back from none' },
  { icon: 'sliders', text: 'Keyword filters that miss the point' },
  { icon: 'clock', text: 'Stale listings buried in fresh searches' },
  { icon: 'crosshairs', text: 'Shotgun applications that go nowhere' },
]

// ── How It Works ──────────────────────────────────────────────────────────────
const steps = [
  { title: "Tell us what you're looking for", body: 'Role, pay range, location — in under a minute.' },
  { title: 'We curate and match in real time', body: 'Active postings only, enriched with sponsorship signal when relevant.' },
  { title: 'You get quality matches, not noise', body: 'Delivered to your dashboard and inbox, ready to apply.' },
]

// ── Who It's For ──────────────────────────────────────────────────────────────
const tiers = [
  { label: '01', title: 'Entry & Mid Level', body: 'Early-career and hourly roles, matched to your experience and pay.' },
  { label: '02', title: 'Senior & Management', body: 'Leadership roles matched to scope, comp, and responsibility.' },
  { label: '03', title: 'Director, VP & C-Level', body: 'Executive opportunities matched to strategic fit.' },
]

// ── Pricing ───────────────────────────────────────────────────────────────────
const plans = [
  { name: 'Free', price: '$0', period: '/month', note: 'No card required', desc: 'Try it out: capped searches, teaser insights.', cta: 'Get started free', primary: false, badge: null as string | null },
  { name: 'Core', price: '$29', period: '/month', note: null as string | null, desc: 'Automated matching, tracker, full insights.', cta: 'Start with Core', primary: false, badge: null as string | null },
  { name: 'Premium', price: '$49', period: '/month', note: null as string | null, desc: 'Everything in Core, plus sponsorship intelligence as it rolls out.', cta: 'Start with Premium', primary: true, badge: 'Most popular' },
]

// ── Testimonials ──────────────────────────────────────────────────────────────
const testimonials = [
  { name: 'Jordan M.', role: 'Software Engineer', quote: "I got two interviews in my first week on Job-Hopper. The matches were actually relevant — something I'd never say about Indeed." },
  { name: 'Megan T.', role: 'Marketing Manager', quote: "The sponsorship signal alone is worth it. I stopped wasting applications on companies that can't hire me." },
  { name: 'Priya S.', role: 'Product Designer', quote: 'Every match fit my salary range and location. No more filtering through 200 listings to find three worth applying to.' },
]

// ── Footer ────────────────────────────────────────────────────────────────────
const footerColumns = [
  {
    label: 'Product',
    items: [
      { label: 'How It Works', to: '/how-it-works' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Get the App', to: '/install-app' },
      { label: 'Job Tracker', to: null },
      { label: 'Match Score', to: null },
    ],
  },
  {
    label: 'Company',
    items: [
      { label: 'About', to: '/about' },
      { label: 'Blog', to: null },
      { label: 'Careers', to: null },
      { label: 'Contact', to: '/support' },
      { label: 'Press', to: null },
    ],
  },
  {
    label: 'Legal',
    items: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Cookie Policy', to: null },
    ],
  },
]
</script>

<template>
  <div class="landing font-sans">
    <!-- ── Nav ─────────────────────────────────────────────────────────────── -->
    <header
      class="fixed top-0 left-0 right-0 z-50 nav-shell"
      :class="scrolled ? 'nav-scrolled' : 'nav-top'"
    >
      <div class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <router-link to="/" class="flex items-center shrink-0">
          <img :src="jobHopperLogo" alt="Job-Hopper" class="h-[34px] w-auto" >
        </router-link>

        <nav class="hidden md:flex items-center gap-6">
          <router-link
            v-for="l in navLinks"
            :key="l.label"
            :to="l.to"
            class="text-sm font-medium text-neutral-body nav-link"
          >
            {{ l.label }}
          </router-link>
        </nav>

        <div class="hidden md:flex items-center gap-3">
          <router-link to="/login" class="text-sm font-medium text-neutral-body nav-link">
            Login
          </router-link>
          <router-link to="/register" class="btn-hop-primary">
            Get Started
          </router-link>
        </div>

        <button class="md:hidden p-2 text-brand-charcoal" aria-label="Toggle menu" @click="mobileOpen = !mobileOpen">
          <font-awesome-icon :icon="['fas', mobileOpen ? 'xmark' : 'bars']" class="text-xl" />
        </button>
      </div>

      <div
        v-if="mobileOpen"
        class="md:hidden bg-white border-t border-neutral-border px-5 py-4 flex flex-col gap-4"
      >
        <router-link
          v-for="l in navLinks"
          :key="l.label"
          :to="l.to"
          class="text-sm font-medium py-1 text-neutral-body"
          @click="mobileOpen = false"
        >
          {{ l.label }}
        </router-link>
        <div class="flex flex-col gap-3 pt-2 border-t border-neutral-border">
          <router-link to="/login" class="text-sm font-medium text-neutral-body" @click="mobileOpen = false">
            Login
          </router-link>
          <router-link to="/register" class="btn-hop-primary justify-center" @click="mobileOpen = false">
            Get Started
          </router-link>
        </div>
      </div>
    </header>

    <main>
      <!-- ── Hero ──────────────────────────────────────────────────────────── -->
      <section class="min-h-screen flex items-center pt-24 pb-16 px-5 bg-neutral-bg">
        <div class="max-w-6xl mx-auto w-full grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div v-reveal class="w-10 h-1 rounded-full mb-5 amber-grad" />
            <h1 v-reveal="0.08" class="mb-4 leading-tight font-heading font-bold text-brand-charcoal hero-title">
              The AI that does your job search for you.
            </h1>
            <p v-reveal="0.16" class="mb-6 text-base leading-relaxed text-neutral-body" style="max-width: 460px">
              We scan the market, cut the junk, and send you curated matches. Stop applying into the void.
            </p>
            <ul v-reveal="0.24" class="flex flex-col gap-3 mb-8">
              <li v-for="c in heroChecks" :key="c" class="flex items-start gap-3">
                <span class="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center check-chip">
                  <font-awesome-icon :icon="['fas', 'check']" class="text-brand-success text-[11px]" />
                </span>
                <span class="text-sm leading-snug text-neutral-body">{{ c }}</span>
              </li>
            </ul>
            <div v-reveal="0.32">
              <div class="flex flex-wrap gap-3 mb-4">
                <router-link to="/register" class="btn-hop-primary">Start your free trial</router-link>
                <router-link to="/how-it-works" class="btn-hop-secondary">See how it works</router-link>
              </div>
              <p class="text-xs text-gray-400">No spam. No random jobs. Cancel anytime.</p>
            </div>
          </div>

          <!-- Hero graphic -->
          <div v-reveal="0.1" class="relative flex items-center justify-center" style="min-height: 380px">
            <div class="absolute inset-0 rounded-3xl blur-3xl hop-glow hero-blob" />

            <div class="relative flex flex-col items-center gap-3 w-full max-w-sm">
              <!-- Many-in indicator -->
              <div class="flex items-center gap-1.5 mb-1">
                <div
                  v-for="i in 5"
                  :key="i"
                  class="rounded-full"
                  :style="{
                    width: `${20 + (i - 1) * 8}px`,
                    height: '6px',
                    background: (i - 1) % 2 === 0 ? '#2F6ECC' : '#CBD5E1',
                    opacity: 0.4,
                  }"
                />
                <span class="text-xs font-medium ml-1 text-gray-400">1,000s of postings</span>
              </div>

              <!-- Funnel lines -->
              <div class="flex flex-col items-center gap-0.5">
                <div
                  v-for="(line, i) in funnelBars"
                  :key="i"
                  class="rounded-full"
                  :style="{ width: `${line.w}px`, height: '4px', background: '#2F6ECC', opacity: line.o }"
                />
                <div class="rounded-full" style="width: 2px; height: 24px; background: #2f6ecc" />
              </div>

              <!-- Primary match card -->
              <div class="w-full rounded-xl p-4 shadow-xl border border-neutral-border bg-white relative z-10 hop-float">
                <div class="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl amber-grad" />
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <p class="text-xs font-medium mb-0.5 text-gray-400">Good morning, Jordan</p>
                    <p class="font-semibold text-sm font-heading text-brand-charcoal">Senior Product Designer</p>
                    <p class="text-xs mt-0.5 text-neutral-body">Figma · Remote · $160–190k</p>
                  </div>
                  <div class="flex flex-col items-end gap-1.5 shrink-0">
                    <div class="px-2 py-0.5 rounded-full text-xs font-semibold match-badge">97% match</div>
                    <div class="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 sponsor-badge">
                      🛂 Sponsor: likely<span class="text-[10px] opacity-60"> (est.)</span>
                    </div>
                  </div>
                </div>
                <button class="w-full py-2 rounded-lg text-xs font-semibold text-white bg-brand-primary hover:opacity-90 transition-opacity">
                  View details
                </button>
              </div>

              <!-- Ghost cards -->
              <div class="flex gap-2 w-full justify-center">
                <div
                  v-for="c in ghostCards"
                  :key="c.co"
                  class="flex-1 rounded-xl p-3 border border-neutral-border bg-white"
                  style="opacity: 0.5"
                >
                  <p class="text-xs font-semibold font-heading text-brand-charcoal">{{ c.role }}</p>
                  <p class="text-[11px] text-gray-400">{{ c.co }}</p>
                </div>
              </div>

              <p class="text-[11px] text-center mt-1 text-gray-400">One great match. Not a flood.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Problem ───────────────────────────────────────────────────────── -->
      <section class="py-20 px-5 bg-white">
        <div class="max-w-5xl mx-auto">
          <div v-reveal class="text-center mb-12">
            <h2 class="font-heading font-semibold text-brand-charcoal section-title">
              Job boards are crowded. Your time shouldn't be.
            </h2>
            <p class="mt-3 text-sm text-neutral-body mx-auto" style="max-width: 440px">
              The old way wastes hours on applications that go nowhere. There's a better model.
            </p>
          </div>

          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <div v-for="(c, i) in problemCards" :key="c.text" v-reveal="i * 0.08">
              <div class="rounded-xl p-5 border border-neutral-border bg-neutral-bg h-full hop-card">
                <div class="mb-3 text-gray-500 text-[18px]">
                  <font-awesome-icon :icon="['fas', c.icon]" />
                </div>
                <p class="text-sm font-medium leading-snug text-neutral-body">{{ c.text }}</p>
              </div>
            </div>
          </div>

          <p v-reveal class="text-center text-sm font-medium text-neutral-body">
            Job-Hopper flips that experience.
            <span style="color: #ff8a34">Fewer, better opportunities, curated for you.</span>
          </p>
        </div>
      </section>

      <!-- ── How It Works ──────────────────────────────────────────────────── -->
      <section class="py-20 px-5 bg-neutral-bg">
        <div class="max-w-5xl mx-auto">
          <div v-reveal class="mb-12 text-center">
            <h2 class="font-heading font-semibold text-brand-charcoal section-title">How Job-Hopper works for you.</h2>
          </div>

          <div class="grid md:grid-cols-3 gap-6 mb-10">
            <div v-for="(s, i) in steps" :key="s.title" v-reveal="i * 0.08">
              <div class="rounded-xl p-6 border border-neutral-border bg-white h-full relative overflow-hidden hop-card">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-sm font-bold amber-grad text-brand-charcoal">
                  {{ i + 1 }}
                </div>
                <h3 class="mb-2 leading-snug font-heading font-semibold text-brand-charcoal card-title">{{ s.title }}</h3>
                <p class="text-sm leading-relaxed text-neutral-body">{{ s.body }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Who It's For ──────────────────────────────────────────────────── -->
      <section class="py-20 px-5 bg-white">
        <div class="max-w-5xl mx-auto">
          <div v-reveal class="text-center mb-12">
            <h2 class="font-heading font-semibold text-brand-charcoal section-title">
              A smarter job search for everyone in the U.S.
            </h2>
            <p class="mt-3 text-sm leading-relaxed text-neutral-body mx-auto" style="max-width: 520px">
              Job-Hopper isn't built for one industry — it's built for anyone who works for a living. From entry-level to
              executive, across tech, healthcare, operations, and the trades, we apply the same curation everywhere.
            </p>
          </div>

          <div class="grid md:grid-cols-3 gap-5">
            <div v-for="(t, i) in tiers" :key="t.label" v-reveal="i * 0.08">
              <div class="rounded-xl p-6 border border-neutral-border bg-neutral-bg h-full hop-card">
                <p class="text-xs font-bold mb-4 tracking-widest amber-grad-text">{{ t.label }}</p>
                <h3 class="mb-2 font-heading font-semibold text-brand-charcoal card-title">{{ t.title }}</h3>
                <p class="text-sm leading-relaxed text-neutral-body">{{ t.body }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Pricing ───────────────────────────────────────────────────────── -->
      <section class="py-20 px-5 bg-neutral-bg">
        <div class="max-w-4xl mx-auto">
          <div v-reveal class="mb-12 text-center">
            <h2 class="font-heading font-semibold text-brand-charcoal section-title">Simple plans, real support.</h2>
          </div>

          <div class="grid md:grid-cols-3 gap-5 mb-8">
            <div v-for="(p, i) in plans" :key="p.name" v-reveal="i * 0.08">
              <div
                class="rounded-xl border h-full flex flex-col relative overflow-hidden"
                :class="p.primary ? 'plan-primary hop-scale' : 'border-neutral-border bg-white hop-card'"
              >
                <div
                  v-if="p.badge"
                  class="absolute top-0 right-0 text-xs font-semibold px-3 py-1 rounded-bl-xl amber-grad text-brand-charcoal"
                >
                  {{ p.badge }}
                </div>
                <div class="p-6 flex flex-col flex-1">
                  <p
                    class="text-xs font-semibold uppercase tracking-wider mb-3"
                    :class="p.primary ? 'text-white/70' : 'text-gray-400'"
                  >
                    {{ p.name }}
                  </p>
                  <div class="flex items-end gap-1 mb-1">
                    <span class="text-3xl font-bold font-heading" :class="p.primary ? 'text-white' : 'text-brand-charcoal'">{{ p.price }}</span>
                    <span class="text-sm mb-1" :class="p.primary ? 'text-white/70' : 'text-gray-400'">{{ p.period }}</span>
                  </div>
                  <p v-if="p.note" class="text-xs mb-3" :class="p.primary ? 'text-white/60' : 'text-gray-400'">{{ p.note }}</p>
                  <p class="text-sm mb-6 flex-1 leading-relaxed" :class="p.primary ? 'text-white/90' : 'text-neutral-body'">{{ p.desc }}</p>
                  <router-link
                    to="/register"
                    class="w-full py-2.5 rounded-xl text-sm font-semibold text-center hover:opacity-90 transition-opacity"
                    :class="p.primary ? 'bg-white text-brand-primary' : 'bg-brand-primary text-white'"
                  >
                    {{ p.cta }}
                  </router-link>
                </div>
              </div>
            </div>
          </div>

          <div v-reveal class="text-center">
            <router-link to="/pricing" class="ghost-link">
              See full pricing <font-awesome-icon :icon="['fas', 'arrow-right']" class="text-[13px]" />
            </router-link>
          </div>
        </div>
      </section>

      <!-- ── Testimonials ──────────────────────────────────────────────────── -->
      <section class="py-20 px-5 bg-white">
        <div class="max-w-5xl mx-auto">
          <div v-reveal class="mb-12 text-center">
            <h2 class="font-heading font-semibold text-brand-charcoal section-title">Hear from job seekers using Job-Hopper.</h2>
          </div>

          <div class="grid md:grid-cols-3 gap-5">
            <div v-for="(t, i) in testimonials" :key="t.name" v-reveal="i * 0.08">
              <div class="rounded-xl p-6 border border-neutral-border bg-neutral-bg h-full flex flex-col hop-card">
                <div class="flex gap-0.5 mb-4">
                  <font-awesome-icon v-for="j in 5" :key="j" :icon="['fas', 'star']" class="text-[14px]" style="color: #ffd75a" />
                </div>
                <p class="text-sm leading-relaxed flex-1 mb-5 italic text-neutral-body">"{{ t.quote }}"</p>
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 amber-grad text-brand-charcoal">
                    {{ t.name[0] }}
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-brand-charcoal">{{ t.name }}</p>
                    <p class="text-xs text-gray-400">{{ t.role }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Final CTA ─────────────────────────────────────────────────────── -->
      <section class="py-24 px-5 relative overflow-hidden cta-light">
        <div class="absolute inset-0 cta-noise" />
        <div v-reveal class="max-w-2xl mx-auto text-center relative z-10">
          <div class="flex justify-center mb-6">
            <img :src="jobHopperLogo" alt="Job-Hopper" class="h-14 w-auto" >
          </div>
          <h2 class="mb-4 font-heading font-bold text-brand-charcoal cta-title">
            Ready for the new standard in job search?
          </h2>
          <p class="mb-8 text-sm leading-relaxed" style="color: rgba(17, 24, 39, 0.7)">
            Create your profile and let Job-Hopper do the heavy lifting. Cancel anytime.
          </p>
          <div class="flex flex-wrap justify-center gap-3 mb-5">
            <router-link
              to="/register"
              class="px-7 py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style="background: #111827"
            >
              Start your free trial
            </router-link>
          </div>
          <router-link
            to="/faq"
            class="text-sm font-medium underline underline-offset-2 hover:opacity-60 transition-opacity"
            style="color: rgba(17, 24, 39, 0.65)"
          >
            Questions? Check our FAQ.
          </router-link>
        </div>
      </section>
    </main>

    <!-- ── Footer ──────────────────────────────────────────────────────────── -->
    <footer class="px-5 pt-14 pb-8 border-t footer-shell">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div class="col-span-2 md:col-span-1">
            <router-link to="/" class="flex items-center mb-3">
              <img :src="jobHopperLogo" alt="Job-Hopper" class="h-8 w-auto" >
            </router-link>
            <p class="text-xs leading-relaxed text-neutral-body">Smarter job search, curated for you.</p>
            <div class="w-8 h-0.5 rounded-full mt-3 amber-grad" />
          </div>

          <div v-for="col in footerColumns" :key="col.label">
            <p class="text-xs font-semibold uppercase tracking-wider mb-4 text-gray-500">{{ col.label }}</p>
            <ul class="flex flex-col gap-2.5">
              <li v-for="item in col.items" :key="item.label">
                <router-link v-if="item.to" :to="item.to" class="text-sm footer-link">{{ item.label }}</router-link>
                <a v-else href="#" class="text-sm footer-link">{{ item.label }}</a>
              </li>
            </ul>
          </div>
        </div>

        <div class="pt-6 border-t footer-divider flex flex-col sm:flex-row items-center justify-between gap-3">
          <p class="text-xs text-neutral-body">© 2025 Job-Hopper. All rights reserved.</p>
          <div class="flex items-center gap-3">
            <a
              href="https://www.tiktok.com/@jobhopperofficial"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Job-Hopper on TikTok"
              class="footer-social inline-flex h-8 w-8 items-center justify-center rounded-full border"
            >
              <font-awesome-icon :icon="['fab', 'tiktok']" class="text-sm" aria-hidden="true" />
            </a>
            <a
              href="https://www.instagram.com/jobhopperofficial"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Job-Hopper on Instagram"
              class="footer-social inline-flex h-8 w-8 items-center justify-center rounded-full border"
            >
              <font-awesome-icon :icon="['fab', 'instagram']" class="text-sm" aria-hidden="true" />
            </a>
          </div>
          <p class="text-xs italic text-neutral-body">Job search, the way it should work.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Fluid type matching the design's clamp() values */
.hero-title {
  font-size: clamp(26px, 4vw, 40px);
}
.section-title {
  font-size: clamp(24px, 3vw, 32px);
}
.card-title {
  font-size: clamp(17px, 2vw, 19px);
}
.cta-title {
  font-size: clamp(24px, 3.5vw, 36px);
}

/* ── Nav ──────────────────────────────────────────────────────────────────── */
.nav-shell {
  backdrop-filter: blur(12px);
  transition: background 0.25s, border-color 0.25s;
  border-bottom: 1px solid transparent;
}
.nav-top {
  background: rgba(249, 250, 251, 0.85);
}
.nav-scrolled {
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid #e5e7eb;
}
.nav-link {
  transition: opacity 0.18s;
}
.nav-link:hover {
  opacity: 0.6;
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */
.btn-hop-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  background: #2f6ecc;
  transition: transform 0.18s, opacity 0.18s;
}
.btn-hop-primary:hover {
  opacity: 0.92;
  transform: scale(1.03);
}
.btn-hop-primary:active {
  transform: scale(0.97);
}
.btn-hop-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 600;
  font-size: 0.875rem;
  background: #fff;
  color: #2f6ecc;
  border: 2px solid #2f6ecc;
  transition: background 0.18s, color 0.18s, transform 0.18s;
}
.btn-hop-secondary:hover {
  background: #2f6ecc;
  color: #fff;
  transform: scale(1.03);
}
.btn-hop-secondary:active {
  transform: scale(0.97);
}

.ghost-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #2f6ecc;
  transition: transform 0.18s;
}
.ghost-link:hover {
  transform: translateX(3px);
}

/* ── Accent fills ─────────────────────────────────────────────────────────── */
.amber-grad {
  background: linear-gradient(135deg, #ffd75a 0%, #ff8a34 100%);
}
.amber-grad-text {
  background: linear-gradient(135deg, #ffd75a 0%, #ff8a34 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.check-chip {
  background: #dcfce7;
}
.match-badge {
  background: #eff4fc;
  color: #2f6ecc;
}
.sponsor-badge {
  background: #fff7ed;
  color: #ea580c;
}
.hero-blob {
  background: linear-gradient(135deg, #ffd75a 0%, #ff8a34 40%, #2f6ecc 100%);
}

/* ── Pricing primary tier ─────────────────────────────────────────────────── */
.plan-primary {
  background: #2f6ecc;
  border-color: #2f6ecc;
  box-shadow: 0 8px 30px rgba(47, 110, 204, 0.22);
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.footer-shell {
  background: #fff;
  border-color: #e5e7eb;
}
.footer-divider {
  border-color: #e5e7eb;
}
.footer-link {
  color: #374151;
  display: inline-block;
  transition: transform 0.18s, color 0.18s;
}
.footer-link:hover {
  color: #2f6ecc;
  transform: translateX(3px);
}
/* Social icon buttons: same palette as footer links, but flex-centered and
   without the text-link hover nudge. */
.footer-social {
  color: #374151;
  border-color: #e5e7eb;
  transition: color 0.18s, border-color 0.18s;
}
.footer-social:hover {
  color: #2f6ecc;
  border-color: #2f6ecc;
}

/* ── Final CTA ────────────────────────────────────────────────────────────── */
/* Subtle warm amber wash (not the full-strength gradient) so the brand logo
   and copy stay clearly legible. */
.cta-light {
  background: linear-gradient(135deg, #fff7ed 0%, #ffe9c7 100%);
}
.cta-noise {
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M0 0h1v1H0zm2 2h1v1H2zm2 0h1v1H4zm2-2h1v1H6zm2 2h1v1H8zm2-2h1v1h-1zm2 2h1v1h-1zm2-2h1v1h-1z'/%3E%3C/g%3E%3C/svg%3E");
}

/* ── Scroll reveal ────────────────────────────────────────────────────────── */
.reveal {
  opacity: 0;
  transform: translateY(22px);
  transition:
    opacity 0.52s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.52s cubic-bezier(0.22, 1, 0.36, 1);
}
.reveal-in {
  opacity: 1;
  transform: none;
}

/* ── Hover lift / scale ───────────────────────────────────────────────────── */
.hop-card {
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.hop-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
}
.hop-scale {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.hop-scale:hover {
  transform: scale(1.02);
}

/* ── Hero graphic motion ──────────────────────────────────────────────────── */
@keyframes hopFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
.hop-float {
  animation: hopFloat 3.8s ease-in-out infinite;
}
@keyframes hopGlow {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.2;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.28;
  }
}
.hop-glow {
  animation: hopGlow 5s ease-in-out infinite;
}

/* main.css ships a global `prefers-reduced-motion: reduce` guard that forces every
   transition/animation in the app to ~0ms. That silently disables this marketing
   page's intentional hover, float, glow, and reveal motion. Re-enable it for the
   landing's own elements only — the rest of the app still honors the preference. */
@media (prefers-reduced-motion: reduce) {
  .reveal {
    transition-duration: 0.52s !important;
  }
  .hop-card,
  .hop-scale,
  .btn-hop-primary,
  .btn-hop-secondary,
  .ghost-link,
  .footer-link,
  .nav-link {
    transition-duration: 0.3s !important;
  }
  .hop-float {
    animation-duration: 3.8s !important;
    animation-iteration-count: infinite !important;
  }
  .hop-glow {
    animation-duration: 5s !important;
    animation-iteration-count: infinite !important;
  }
}
</style>
