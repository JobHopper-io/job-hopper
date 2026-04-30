<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useAnimations } from '@/composables/useAnimations'
import { useScrollReveal } from '@/composables/useScrollReveal'

gsap.registerPlugin(ScrollTrigger)

const { textReveal, fadeInUp, float, pulse, counterAnimation } = useAnimations()
const { revealOnScroll, staggerReveal, parallaxScroll } = useScrollReveal()

const heroRef = ref<HTMLElement>()
const heroTitleRef = ref<HTMLElement>()
const heroSubtitleRef = ref<HTMLElement>()
const heroListRef = ref<HTMLElement>()
const heroButtonsRef = ref<HTMLElement>()
const heroCardRef = ref<HTMLElement>()
const particlesRef = ref<HTMLElement>()
const scrollProgressRef = ref<HTMLElement>()

const currentTestimonial = ref(0)
const testimonialInterval = ref<ReturnType<typeof setTimeout> | null>(null)

const testimonials = [
  {
    text: "The ghost listings and noise disappeared. Job-Hopper narrowed everything to a short list I could act on. I had two Data Analyst interviews within a month and accepted an offer that was a real step up.",
    author: "Jordan M.",
    location: "Austin, TX"
  },
  {
    text: "I was skeptical about paying while between roles, but the trial won me over. The matches weren't perfect every day, but two applications turned into interviews—and one into my new Process Engineer job.",
    author: "Megan T.",
    location: "Kansas City, MO"
  },
  {
    text: "I'm in retail leadership, not software or a plant floor, so I wasn't sure an AI tool would get my profile. It did. Steady, relevant roles—not a firehose—and every week I actually had time to apply well.",
    author: "Priya S.",
    location: "Denver, CO"
  }
]

const createParticles = () => {
  if (!particlesRef.value) return
  
  const particleCount = 20
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div')
    particle.className = 'particle'
    particle.style.width = `${Math.random() * 4 + 2}px`
    particle.style.height = particle.style.width
    particle.style.left = `${Math.random() * 100}%`
    particle.style.top = `${Math.random() * 100}%`
    particle.style.background = `rgba(47, 110, 204, ${Math.random() * 0.5 + 0.2})`
    particle.style.animationDelay = `${Math.random() * 20}s`
    particle.style.animationDuration = `${15 + Math.random() * 10}s`
    particlesRef.value.appendChild(particle)
  }
}

const startTestimonialCarousel = () => {
  if (testimonialInterval.value) return
  
  testimonialInterval.value = setInterval(() => {
    currentTestimonial.value = (currentTestimonial.value + 1) % testimonials.length
  }, 5000)
}

const stopTestimonialCarousel = () => {
  if (testimonialInterval.value) {
    clearInterval(testimonialInterval.value)
    testimonialInterval.value = null
  }
}

onMounted(() => {
  // Hero animations
  if (heroTitleRef.value) {
    textReveal(heroTitleRef.value, 'words')
  }
  
  if (heroSubtitleRef.value) {
    fadeInUp(heroSubtitleRef.value, 0.3)
  }
  
  if (heroListRef.value) {
    const items = heroListRef.value.querySelectorAll('li')
    gsap.fromTo(items, 
      { opacity: 0, x: -30 },
      { 
        opacity: 1, 
        x: 0, 
        duration: 0.8, 
        stagger: 0.15, 
        delay: 0.6,
        ease: 'power3.out'
      }
    )
  }
  
  if (heroButtonsRef.value) {
    const buttons = heroButtonsRef.value.querySelectorAll('a')
    gsap.fromTo(buttons,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.1,
        delay: 1.2,
        ease: 'power3.out'
      }
    )
    
    // Floating effect on buttons
    buttons.forEach(btn => {
      float(btn, 5)
    })
  }
  
  if (heroCardRef.value) {
    gsap.fromTo(heroCardRef.value,
      { opacity: 0, scale: 0.9, rotationY: -15 },
      {
        opacity: 1,
        scale: 1,
        rotationY: 0,
        duration: 1.2,
        delay: 0.8,
        ease: 'power3.out',
        transformPerspective: 1000
      }
    )
    
    // Parallax effect on scroll
    parallaxScroll(heroCardRef.value, -0.3)
    
    // 3D tilt on mouse move
    if (heroCardRef.value) {
      heroCardRef.value.addEventListener('mousemove', (e: MouseEvent) => {
        const rect = heroCardRef.value!.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const centerX = rect.width / 2
        const centerY = rect.height / 2
        const rotateX = (y - centerY) / 20
        const rotateY = (centerX - x) / 20
        
        if (heroCardRef.value) {
          gsap.to(heroCardRef.value, {
            rotationX: rotateX,
            rotationY: rotateY,
            transformPerspective: 1000,
            duration: 0.3,
            ease: 'power2.out'
          })
        }
      })
      
      heroCardRef.value.addEventListener('mouseleave', () => {
        if (heroCardRef.value) {
          gsap.to(heroCardRef.value, {
            rotationX: 0,
            rotationY: 0,
            duration: 0.5,
            ease: 'power2.out'
          })
        }
      })
    }
  }
  
  // Problem section animations
  const problemCards = document.querySelectorAll('.problem-card')
  problemCards.forEach((card, index) => {
    const direction = index % 2 === 0 ? 'left' : 'right'
    revealOnScroll(card, {
      direction: direction as 'left' | 'right',
      distance: 100,
      delay: index * 0.1
    })
    
    // Icon animation
    const icon = card.querySelector('svg')
    if (icon) {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 80%',
        onEnter: () => {
          gsap.fromTo(icon,
            { rotation: -180, scale: 0 },
            { rotation: 0, scale: 1, duration: 0.8, ease: 'back.out(1.7)' }
          )
        }
      })
    }
  })
  
  // How It Works section
  const stepCards = document.querySelectorAll('.step-card')
  stepCards.forEach((card, index) => {
    revealOnScroll(card, {
      direction: 'up',
      distance: 80,
      delay: index * 0.15
    })
    
    const numberCircle = card.querySelector('.step-number')
    if (numberCircle) {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 80%',
        onEnter: () => {
          gsap.fromTo(numberCircle,
            { scale: 0, rotation: -180 },
            { scale: 1, rotation: 0, duration: 0.8, ease: 'back.out(1.7)' }
          )
        }
      })
    }
  })
  
  // Who It's For section
  const roleCards = document.querySelectorAll('.role-card')
  staggerReveal('.who-its-for-grid', '.role-card', {
    direction: 'up',
    distance: 60,
    stagger: 0.1
  })
  
  roleCards.forEach(card => {
    const icon = card.querySelector('svg')
    if (icon) {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 80%',
        onEnter: () => {
          gsap.fromTo(icon,
            { rotation: -90, scale: 0.5 },
            { rotation: 0, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }
          )
        }
      })
    }
    
    // 3D hover effect
    const cardElement = card as HTMLElement
    cardElement.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = cardElement.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const centerX = rect.width / 2
      const centerY = rect.height / 2
      const rotateX = (y - centerY) / 15
      const rotateY = (centerX - x) / 15
      
      gsap.to(cardElement, {
        rotationX: rotateX,
        rotationY: rotateY,
        z: 20,
        transformPerspective: 1000,
        duration: 0.3,
        ease: 'power2.out'
      })
    })
    
    cardElement.addEventListener('mouseleave', () => {
      gsap.to(cardElement, {
        rotationX: 0,
        rotationY: 0,
        z: 0,
        duration: 0.5,
        ease: 'power2.out'
      })
    })
  })
  
  // Pricing section
  const pricingCards = document.querySelectorAll('.pricing-card')
  staggerReveal('.pricing-grid', '.pricing-card', {
    direction: 'up',
    distance: 50,
    stagger: 0.1
  })
  
  pricingCards.forEach(card => {
    const priceElement = card.querySelector('.price-number')
    if (priceElement) {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 80%',
        onEnter: () => {
          const priceText = priceElement.textContent || '0'
          const price = parseInt(priceText.replace(/[^0-9]/g, ''))
          if (price > 0) {
            counterAnimation(priceElement as HTMLElement, price, 1.5)
          }
        }
      })
    }
    
    // Most popular badge pulse
    const badge = card.querySelector('.popular-badge')
    if (badge) {
      pulse(badge)
    }
    
    // Gradient border animation
    const gradientBorder = card.querySelector('.gradient-border')
    if (gradientBorder) {
      gsap.to(gradientBorder, {
        backgroundPosition: '200% 0',
        duration: 3,
        repeat: -1,
        ease: 'linear'
      })
    }
  })
  
  // Testimonials
  startTestimonialCarousel()
  staggerReveal('.testimonials-grid', '.testimonial-card', {
    direction: 'up',
    distance: 50,
    stagger: 0.15
  })
  
  // Final CTA
  const ctaSection = document.querySelector('.final-cta')
  if (ctaSection) {
    revealOnScroll(ctaSection, {
      direction: 'up',
      distance: 80
    })
    
    const ctaTitle = ctaSection.querySelector('h2')
    if (ctaTitle) {
      textReveal(ctaTitle, 'words')
    }
    
    const ctaButton = ctaSection.querySelector('.cta-button')
    if (ctaButton) {
      pulse(ctaButton)
    }
  }
  
  // Create particles
  createParticles()
  
  // Smooth scroll
  document.documentElement.style.scrollBehavior = 'smooth'
  
  // Scroll progress indicator
  if (scrollProgressRef.value) {
    ScrollTrigger.create({
      trigger: 'body',
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        if (scrollProgressRef.value) {
          gsap.to(scrollProgressRef.value, {
            width: `${self.progress * 100}%`,
            duration: 0.1,
            ease: 'none'
          })
        }
      }
    })
  }
})

onUnmounted(() => {
  stopTestimonialCarousel()
  ScrollTrigger.getAll().forEach(trigger => trigger.kill())
})
</script>

<template>
  <div class="min-h-screen overflow-x-clip">
    <!-- Scroll Progress Indicator -->
    <div ref="scrollProgressRef" class="fixed top-0 left-0 h-1 bg-brand-primary z-50" style="width: 0%;"></div>
    
    <!-- Hero Section -->
    <section ref="heroRef" class="relative bg-white py-16 lg:py-24 xl:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <!-- Animated gradient background -->
      <div class="absolute inset-0 gradient-mesh opacity-30"></div>
      
      <!-- Particles -->
      <div ref="particlesRef" class="absolute inset-0 pointer-events-none"></div>
      
      <div class="max-w-7xl mx-auto relative z-10">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 ref="heroTitleRef" class="text-brand-charcoal mb-6 will-change-opacity">
              The AI that does your job search for you.
            </h1>
            <p ref="heroSubtitleRef" class="text-xl text-neutral-body mb-6 will-change-opacity">
              Job-Hopper is a new kind of job search for people in the United States: we scan the market, cut the junk, and deliver curated matches that fit your background—straight to your inbox and dashboard. Stop applying into the void.
            </p>
            <ul ref="heroListRef" class="space-y-3 mb-8">
              <li class="flex items-start will-change-transform">
                <svg class="w-6 h-6 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="text-neutral-body">AI plus human judgment surfaces active, high-quality openings</span>
              </li>
              <li class="flex items-start will-change-transform">
                <svg class="w-6 h-6 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="text-neutral-body">Matched to your role, pay range, and location—not random feeds</span>
              </li>
              <li class="flex items-start will-change-transform">
                <svg class="w-6 h-6 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="text-neutral-body">Optional hiring-contact insights and interview prep on premium plans</span>
              </li>
            </ul>
            <div ref="heroButtonsRef" class="flex flex-col sm:flex-row gap-4 mb-4">
              <router-link to="/register" class="btn-primary text-center glow-effect will-change-transform">
                Start your free trial
              </router-link>
              <router-link to="/how-it-works" class="btn-secondary text-center will-change-transform">
                See how it works
              </router-link>
            </div>
            <p class="text-sm text-neutral-body">
              No spam. No random jobs. Cancel anytime.
            </p>
          </div>
          <div class="hidden lg:block perspective-1000">
            <div
              ref="heroCardRef"
              class="bg-gradient-to-br from-brand-rabbit-start to-brand-rabbit-end rounded-[12px] p-6 min-h-[20rem] flex items-center justify-center preserve-3d will-change-transform"
              style="transform-style: preserve-3d;"
            >
              <div class="w-full max-w-md bg-white/95 rounded-2xl shadow-lg p-4 text-left text-[0.8rem] leading-snug">
                <!-- Dashboard header -->
                <div class="mb-3">
                  <p class="text-xs font-semibold uppercase tracking-wide text-brand-primary">
                    Dashboard
                  </p>
                  <p class="text-lg font-heading font-bold text-brand-charcoal">
                    Good morning, Jordan
                  </p>
                  <p class="text-xs text-neutral-body">
                    Here are your latest job matches.
                  </p>
                </div>

                <!-- Summary cards row -->
                <div class="grid grid-cols-3 gap-2 mb-3">
                  <div class="rounded-xl border border-neutral-border bg-neutral-bg px-2 py-2">
                    <p class="text-[0.6rem] font-semibold text-neutral-body/80 uppercase tracking-wide">
                      Subscription
                    </p>
                    <p class="text-xs font-heading font-semibold text-brand-charcoal">
                      Senior &amp; Management
                    </p>
                    <p class="text-[0.6rem] text-neutral-body">
                      Active · Trial
                    </p>
                  </div>
                  <div class="rounded-xl border border-neutral-border bg-neutral-bg px-2 py-2">
                    <p class="text-[0.6rem] font-semibold text-neutral-body/80 uppercase tracking-wide">
                      Add‑ons
                    </p>
                    <p class="text-xs text-brand-charcoal">
                      Contact details
                    </p>
                    <p class="text-[0.6rem] text-neutral-body">
                      Interview prep
                    </p>
                  </div>
                  <div class="rounded-xl border border-neutral-border bg-neutral-bg px-2 py-2">
                    <p class="text-[0.6rem] font-semibold text-neutral-body/80 uppercase tracking-wide">
                      Profile
                    </p>
                    <div class="mt-1 flex items-center gap-1">
                      <div class="h-1.5 flex-1 rounded-full bg-neutral-bg overflow-hidden">
                        <div class="h-full w-4/5 rounded-full bg-brand-primary"></div>
                      </div>
                      <span class="text-[0.6rem] font-semibold text-brand-charcoal tabular-nums">
                        80%
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Filters strip -->
                <div class="mb-3 rounded-xl border border-neutral-border bg-neutral-bg/80 px-3 py-2">
                  <div class="mb-1 flex flex-wrap items-center gap-2">
                    <p class="text-[0.65rem] font-semibold text-brand-charcoal">
                      Filters
                    </p>
                    <span class="inline-flex items-center rounded-full bg-white px-2 py-[1px] text-[0.6rem] text-neutral-body">
                      Role type: Analytics, Engineering
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span class="inline-flex items-center rounded-full bg-white px-2 py-[1px] text-[0.6rem] text-neutral-body">
                      Location: Austin, TX · 35 mi
                    </span>
                    <span class="inline-flex items-center rounded-full bg-white px-2 py-[1px] text-[0.6rem] text-neutral-body">
                      Salary: $75k–$95k
                    </span>
                    <span class="inline-flex items-center rounded-full bg-white px-2 py-[1px] text-[0.6rem] text-neutral-body">
                      Saved only
                    </span>
                  </div>
                </div>

                <!-- Mini job feed -->
                <p class="mb-1 text-[0.7rem] font-semibold text-brand-charcoal">
                  Recent job matches
                </p>
                <div class="space-y-1.5">
                  <div
                    class="relative overflow-hidden rounded-xl border border-neutral-border bg-neutral-card px-3 py-2"
                    style="border-left: 3px solid var(--color-brand-primary);"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0 pr-6">
                        <p class="text-[0.8rem] font-heading font-semibold text-brand-charcoal leading-snug">
                          Data Analyst · Hybrid
                        </p>
                        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] text-neutral-body">
                          <span class="font-medium text-brand-primary">
                            Summit Metrics Co.
                          </span>
                          <span>
                            · Austin, TX
                          </span>
                          <span>
                            · $78k–$88k
                          </span>
                          <span class="inline-flex rounded-full bg-neutral-bg px-2 py-[1px] text-[0.6rem] font-semibold text-brand-charcoal">
                            92% match
                          </span>
                        </div>
                      </div>
                      <span class="absolute right-2 top-2 inline-flex items-center justify-center rounded-full bg-brand-primary px-2 py-[2px] text-[0.6rem] font-semibold text-white shadow-sm">
                        Saved
                      </span>
                    </div>
                    <div class="mt-2 flex gap-1.5 text-[0.6rem]">
                      <span class="inline-flex flex-1 items-center justify-center rounded-full bg-brand-primary text-white">
                        View details
                      </span>
                      <span class="inline-flex flex-1 items-center justify-center rounded-full border border-neutral-border bg-white text-neutral-body">
                        Apply
                      </span>
                    </div>
                  </div>

                  <div
                    class="relative overflow-hidden rounded-xl border border-neutral-border bg-neutral-card px-3 py-2"
                    style="border-left: 3px solid var(--color-brand-primary);"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0 pr-6">
                        <p class="text-[0.8rem] font-heading font-semibold text-brand-charcoal leading-snug">
                          Process Engineer · Days
                        </p>
                        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] text-neutral-body">
                          <span class="font-medium text-brand-primary">
                            Midwest Precision Components
                          </span>
                          <span>
                            · Columbus, OH
                          </span>
                          <span>
                            · $92k–$108k
                          </span>
                          <span class="inline-flex rounded-full bg-neutral-bg px-2 py-[1px] text-[0.6rem] font-semibold text-brand-charcoal">
                            88% match
                          </span>
                        </div>
                      </div>
                      <span class="absolute right-2 top-2 inline-flex items-center justify-center rounded-full bg-white px-2 py-[2px] text-[0.6rem] font-semibold text-brand-primary border border-brand-primary/40">
                        Save
                      </span>
                    </div>
                    <div class="mt-2 flex gap-1.5 text-[0.6rem]">
                      <span class="inline-flex flex-1 items-center justify-center rounded-full bg-brand-primary text-white">
                        View details
                      </span>
                      <span class="inline-flex flex-1 items-center justify-center rounded-full border border-neutral-border bg-white text-neutral-body">
                        Apply
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Problem Section -->
    <section class="bg-neutral-bg py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto">
        <h2 class="text-brand-charcoal mb-6 text-center">
          Job boards are crowded. Your time shouldn't be.
        </h2>
        <p class="text-lg text-neutral-body mb-8 text-center">
          Most job platforms make it feel like a numbers game: hundreds of applications, endless screening questions, and almost no responses. Companies post roles they might need someday, and you are left guessing which applications are actually worth your time.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="card p-6 problem-card card-3d will-change-transform">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <p class="text-neutral-body">You apply to dozens—or hundreds—of jobs and never hear back.</p>
          </div>
          <div class="card p-6 problem-card card-3d will-change-transform">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <p class="text-neutral-body">Postings stay up long after roles are filled.</p>
          </div>
          <div class="card p-6 problem-card card-3d will-change-transform">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
            </div>
            <p class="text-neutral-body">Screening questions and assessments chew up your evenings.</p>
          </div>
          <div class="card p-6 problem-card card-3d will-change-transform">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <p class="text-neutral-body">You rarely know who's actually hiring on the other end.</p>
          </div>
        </div>
        <p class="text-lg text-neutral-body text-center font-medium">
          Job-Hopper flips that experience. Fewer, better opportunities—curated for you.
        </p>
      </div>
    </section>

    <!-- How It Works Preview -->
    <section class="bg-white py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto">
        <h2 class="text-brand-charcoal mb-12 text-center">
          How Job-Hopper works for you
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="text-center step-card will-change-transform">
            <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 step-number will-change-transform">
              <span class="text-white text-2xl font-bold">1</span>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">Tell us what you're looking for</h3>
            <p class="text-neutral-body">In 60 seconds, share your background, role targets, salary range, and where you're willing to work.</p>
          </div>
          <div class="text-center step-card will-change-transform">
            <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 step-number will-change-transform">
              <span class="text-white text-2xl font-bold">2</span>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">We curate and match jobs in real time</h3>
            <p class="text-neutral-body">Our team and a cutting-edge AI engine scan job boards and company postings, strip out the junk, prioritize active roles that fit you, and enrich each match with company context and behind-the-scenes insight.</p>
          </div>
          <div class="text-center step-card will-change-transform">
            <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 step-number will-change-transform">
              <span class="text-white text-2xl font-bold">3</span>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">You get high-quality matches, not noise</h3>
            <p class="text-neutral-body">New matches land in your dashboard and inbox with links to apply directly—and on premium plans, hiring contact info and exclusive interview prep tips.</p>
          </div>
        </div>
        <div class="text-center mt-12">
          <router-link to="/how-it-works" class="text-brand-primary hover:underline font-medium">
            View sample job feed →
          </router-link>
        </div>
      </div>
    </section>

    <!-- Who It's For -->
    <section class="bg-neutral-bg py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-6xl mx-auto">
        <h2 class="text-brand-charcoal mb-6 text-center">
          A smarter job search for everyone in the U.S.
        </h2>
        <p class="text-lg text-neutral-body mb-6 text-center max-w-3xl mx-auto">
          Job-Hopper is not built for one industry—it is built for anyone who works for a living. The same AI-driven pipeline that saves analysts and engineers time also works for nurses, managers, tradespeople, and roles across the economy.
        </p>
        <p class="text-neutral-body mb-12 text-center max-w-3xl mx-auto">
          Today we are seeing exceptional traction alongside the titles our earliest subscribers hold: analytics and engineering in tech and manufacturing—think Data Analyst, Systems Analyst, Full Stack Developer, Mechanical Engineer, Process Engineer, Supply Chain Analyst, Manufacturing Systems Analyst, IT Support Specialist, and similar roles. If your work looks like that, you will see why people are calling this the biggest upgrade to job search in years.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 who-its-for-grid">
          <div class="card p-8 role-card card-3d preserve-3d will-change-transform">
            <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">Entry & Mid Level Roles</h3>
            <p class="text-neutral-body">Curated opportunities from hourly and support roles through early-career professional tracks. Matched to your experience, pay expectations, schedule, and location—whether you are growing in tech, manufacturing, services, or something else entirely.</p>
          </div>
          <div class="card p-8 role-card card-3d preserve-3d will-change-transform">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">Senior & Management Level Roles</h3>
            <p class="text-neutral-body">Targeted searches for experienced professionals and people leaders, including salaried, supervisory and management positions with greater responsibility, broader scope, and stronger compensation alignment.</p>
          </div>
          <div class="card p-8 role-card card-3d preserve-3d will-change-transform">
            <div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-6">
              <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">Director, VP & C-Level Roles</h3>
            <p class="text-neutral-body">Executive and leadership-level opportunities aligned with strategic responsibility, organizational impact, and compensation range - focused on relevance, seniority, and long-term fit.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Teaser -->
    <section class="bg-white py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-6xl mx-auto">
        <h2 class="text-brand-charcoal mb-6 text-center">
          Simple plans, real support
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12 pricing-grid">
          <div class="card p-8 pricing-card card-3d will-change-transform">
            <h3 class="text-xl font-heading font-semibold mb-2">Entry & Mid Level Roles</h3>
            <p class="text-3xl font-bold text-brand-primary mb-4">
              From $<span class="price-number">19</span><span class="text-lg font-normal text-neutral-body">/month</span>
            </p>
            <p class="text-neutral-body mb-6">For hourly, administrative, and early-career salaried roles.</p>
            <router-link to="/register" class="btn-primary w-full text-center block">
              Start free trial
            </router-link>
          </div>
          <div class="card p-8 pricing-card border-2 border-brand-primary relative overflow-hidden card-3d will-change-transform">
            <div class="absolute top-0 left-0 right-0 h-1 gradient-border" style="background: linear-gradient(90deg, #2F6ECC, #FFD75A, #FF8A34, #2F6ECC); background-size: 200% 100%;"></div>
            <div class="popular-badge inline-block bg-brand-primary text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">Most popular</div>
            <h3 class="text-xl font-heading font-semibold mb-2">Senior & Management Level Roles</h3>
            <p class="text-3xl font-bold text-brand-primary mb-4">
              From $<span class="price-number">29</span><span class="text-lg font-normal text-neutral-body">/month</span>
            </p>
            <p class="text-neutral-body mb-6">For experienced professionals, supervisors, and managers.</p>
            <router-link to="/register" class="btn-primary w-full text-center block">
              Start free trial
            </router-link>
          </div>
          <div class="card p-8 pricing-card card-3d will-change-transform">
            <h3 class="text-xl font-heading font-semibold mb-2">Director, VP & C-Level Roles</h3>
            <p class="text-3xl font-bold text-brand-primary mb-4">
              From $<span class="price-number">49</span><span class="text-lg font-normal text-neutral-body">/month</span>
            </p>
            <p class="text-neutral-body mb-6">For executives and senior leaders.</p>
            <router-link to="/register" class="btn-primary w-full text-center block">
              Start free trial
            </router-link>
          </div>
        </div>
        <div class="text-center">
          <router-link to="/pricing" class="text-brand-primary hover:underline font-medium">
            See full pricing & features →
          </router-link>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section class="bg-neutral-bg py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto">
        <h2 class="text-brand-charcoal mb-12 text-center">
          Hear from job seekers using Job-Hopper
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 testimonials-grid">
          <TransitionGroup name="testimonial" tag="div" class="contents">
            <div 
              v-for="(testimonial, index) in testimonials" 
              :key="index"
              :class="['card p-6 testimonial-card will-change-opacity', { 'opacity-100': index === currentTestimonial, 'opacity-60': index !== currentTestimonial }]"
              @mouseenter="currentTestimonial = index; stopTestimonialCarousel()"
              @mouseleave="startTestimonialCarousel()"
            >
              <p class="text-neutral-body mb-4 italic">"{{ testimonial.text }}"</p>
              <p class="text-sm font-semibold text-brand-charcoal">– {{ testimonial.author }}, {{ testimonial.location }}</p>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="final-cta relative bg-gradient-to-r from-brand-primary to-blue-700 py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <!-- Animated gradient waves -->
      <div class="absolute inset-0 animate-gradient" style="background: linear-gradient(135deg, rgba(47, 110, 204, 0.8) 0%, rgba(59, 130, 246, 0.8) 50%, rgba(47, 110, 204, 0.8) 100%); background-size: 200% 200%;"></div>
      
      <!-- Floating particles -->
      <div class="absolute inset-0">
        <div v-for="i in 15" :key="i" class="particle" :style="{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          width: `${Math.random() * 6 + 2}px`,
          height: `${Math.random() * 6 + 2}px`,
          background: `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.2})`,
          animationDelay: `${Math.random() * 5}s`,
          animationDuration: `${10 + Math.random() * 10}s`
        }"></div>
      </div>
      
      <div class="max-w-4xl mx-auto text-center relative z-10">
        <h2 class="text-white mb-6">
          Ready for the new standard in job search?
        </h2>
        <p class="text-xl text-white/90 mb-8">
          Create your profile and let Job-Hopper run the heavy lifting. Curated U.S. matches, your pace, your applications—cancel anytime in a couple of clicks if it is not for you.
        </p>
        <router-link to="/register" class="cta-button btn-secondary bg-white text-brand-primary hover:bg-neutral-bg inline-block mb-4">
          Start your free trial
        </router-link>
        <p class="text-white/80 text-sm">
          <router-link to="/faq" class="underline hover:text-white">Questions? Check our FAQ.</router-link>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.testimonial-enter-active,
.testimonial-leave-active {
  transition: opacity 0.5s ease;
}

.testimonial-enter-from,
.testimonial-leave-to {
  opacity: 0;
}

.gradient-border {
  background-size: 200% 100%;
}
</style>
