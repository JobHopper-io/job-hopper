<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWindowScroll } from '@vueuse/core'
import jobHopperLogo from '@/assets/job-hopper-logo.png'

withDefaults(
  defineProps<{
    /** Omit all three (e.g. transitional pages like Confirm Email) to drop the marketing
     * column entirely and center the card - same gradient/nav/footer, no hero pitch. */
    headline?: string
    sub?: string
    stats?: { value: string; label: string }[]
    /** Suppress the redundant nav link/CTA for whichever auth page is currently showing. */
    hideLoginLink?: boolean
    hideRegisterLink?: boolean
  }>(),
  { headline: undefined, sub: undefined, stats: () => [], hideLoginLink: false, hideRegisterLink: false },
)

const NAV_LINKS = [
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Get the app', to: '/install-app' },
  { label: 'FAQ', to: '/faq' },
]

const mobileOpen = ref(false)

// Same solidify-on-scroll behavior as Home.vue's nav (nav-top -> nav-scrolled). Setting the
// background directly on the header itself (rather than a separate absolutely-positioned
// overlay div) avoids the stacking bug the overlay approach had, where the overlay painted
// above the nav text regardless of DOM order.
const { y: scrollY } = useWindowScroll()
const scrolled = computed(() => scrollY.value > 8)
</script>

<template>
  <div class="auth-hero relative flex min-h-screen w-full flex-col overflow-hidden">
    <header class="fixed inset-x-0 top-0 z-50 auth-nav" :class="scrolled ? 'auth-nav-scrolled' : 'auth-nav-top'">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <router-link to="/" class="flex shrink-0 items-center whitespace-nowrap">
          <img :src="jobHopperLogo" alt="Job-Hopper" class="h-[30px] w-auto object-contain" />
        </router-link>

        <nav class="hidden md:flex items-center gap-6">
          <router-link
            v-for="l in NAV_LINKS"
            :key="l.label"
            :to="l.to"
            class="auth-nav-link text-sm font-medium text-brand-charcoal"
          >
            {{ l.label }}
          </router-link>
        </nav>

        <div class="hidden md:flex shrink-0 items-center gap-3">
          <router-link
            v-if="!hideLoginLink"
            to="/login"
            class="auth-nav-link whitespace-nowrap text-sm font-medium text-brand-charcoal"
          >
            Login
          </router-link>
          <router-link
            v-if="!hideRegisterLink"
            to="/register"
            class="btn-primary shrink-0 whitespace-nowrap !px-5 !py-2.5 text-sm"
          >
            Get Started
          </router-link>
        </div>

        <button
          class="shrink-0 p-2 text-brand-charcoal md:hidden"
          aria-label="Toggle menu"
          @click="mobileOpen = !mobileOpen"
        >
          <font-awesome-icon :icon="['fas', mobileOpen ? 'xmark' : 'bars']" class="text-xl" aria-hidden="true" />
        </button>
      </div>

      <div v-if="mobileOpen" class="relative z-10 flex flex-col gap-4 border-t border-neutral-border bg-white px-5 py-4 md:hidden">
        <router-link
          v-for="l in NAV_LINKS"
          :key="l.label"
          :to="l.to"
          class="text-sm font-medium text-brand-charcoal"
          @click="mobileOpen = false"
        >
          {{ l.label }}
        </router-link>
        <div class="flex flex-col gap-3 border-t border-neutral-border pt-3">
          <router-link
            v-if="!hideLoginLink"
            to="/login"
            class="text-sm font-medium text-brand-charcoal"
            @click="mobileOpen = false"
          >
            Login
          </router-link>
          <router-link
            v-if="!hideRegisterLink"
            to="/register"
            class="btn-primary justify-center text-sm"
            @click="mobileOpen = false"
          >
            Get Started
          </router-link>
        </div>
      </div>
    </header>

    <!-- min-h-screen (above) lets the gradient itself fill at least one viewport and the
         footer butt straight against it with zero gap; centering content within that box
         (rather than top-aligning with padding) is what keeps this from reading as an
         oversized block when the content is short. -->
    <div class="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-5 pb-16 pt-28 md:flex-row md:items-center md:gap-12 md:pb-24 md:pt-36">
      <div v-if="headline" class="flex flex-1 flex-col gap-8 md:max-w-[520px]">
        <div>
          <div class="auth-accent-bar mb-5 h-1 w-10 rounded-full" aria-hidden="true" />
          <h1 class="text-[32px] font-heading font-bold leading-tight text-brand-charcoal md:text-[38px]" style="text-wrap: balance">
            {{ headline }}
          </h1>
          <p v-if="sub" class="mt-4 max-w-[420px] text-base leading-relaxed text-neutral-body">
            {{ sub }}
          </p>
        </div>

        <div v-if="stats && stats.length" class="flex flex-wrap gap-3">
          <div
            v-for="s in stats"
            :key="s.label"
            class="flex flex-col gap-0.5 rounded-2xl border border-neutral-border bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm"
          >
            <span class="text-[15px] font-heading font-bold text-brand-charcoal">{{ s.value }}</span>
            <span class="text-[11px] font-semibold text-neutral-body">{{ s.label }}</span>
          </div>
        </div>
      </div>

      <div class="flex flex-1 justify-center" :class="headline ? 'md:justify-end' : ''">
        <div class="w-full max-w-[430px] rounded-[28px] bg-white p-8 shadow-xl">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Base is Home.vue's .section-warm color (same #fff7ed used on its "How It Works"/"Pricing"
   sections), with the same bottom-right glow anchored on top for a bit of depth - so the
   whole page family (landing sections + these auth pages) now shares one warm base instead
   of alternating between cool gray and warm cream. */
.auth-hero {
  background:
    radial-gradient(140% 110% at 100% 100%, #fdf0dc 0%, rgba(253, 240, 220, 0.4) 35%, rgba(253, 240, 220, 0) 75%),
    #fff7ed;
}

/* Home.vue's signature small accent motif (`.amber-grad`, used as an underline bar before
   headings) - the one deliberate gold touch, not a background. */
.auth-accent-bar {
  background: linear-gradient(135deg, #ffd75a 0%, #ff8a34 100%);
}

/* Same values as Home.vue's .nav-shell/.nav-top/.nav-scrolled, with nav-top's tint matched
   to the warm base above (same fix as Home.vue's own nav-top). */
.auth-nav {
  backdrop-filter: blur(12px);
  transition: background 0.25s, border-color 0.25s;
  border-bottom: 1px solid transparent;
}
.auth-nav-top {
  background: rgba(255, 247, 237, 0.85);
}
.auth-nav-scrolled {
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid #e5e7eb;
}
.auth-nav-link {
  transition: opacity 0.18s;
}
.auth-nav-link:hover {
  opacity: 0.6;
}
</style>
