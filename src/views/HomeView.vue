<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const testimonials = [
  {
    text: "Job-Hopper didn't magically flood me with offers, but it did cut out all the junk. I went from scrolling for hours on job boards to checking a short list of roles a few times a week. Landed a maintenance tech job in 3 weeks after nothing for months.",
    author: "Carlos R.",
    location: "Toledo, OH"
  },
  {
    text: "Honestly I was skeptical about paying for anything while unemployed, but the free trial sold me. The matches weren't perfect every day, but two of the jobs I applied to turned into real interviews, and one into my new production supervisor role.",
    author: "Megan T.",
    location: "Kansas City, MO"
  },
  {
    text: "I work in healthcare administration, not manufacturing, so I wasn't sure this would fit. It still pulled in a steady trickle of roles that matched what I do. It's not a firehose of jobs, but the ones I get are actually worth applying to.",
    author: "Jasmine K.",
    location: "Atlanta, GA"
  }
]
</script>

<template>
  <div class="min-h-screen">
    <!-- Hero Section -->
    <section class="bg-white py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-7xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 class="text-brand-charcoal mb-6">
              Stop applying into the void.
            </h1>
            <p class="text-xl text-neutral-body mb-6">
              Job-Hopper sends you active, curated, high-quality jobs that actually fit your background—right to your inbox and dashboard.
            </p>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start">
                <svg class="w-6 h-6 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="text-neutral-body">Hand-picked openings vetted for recency and quality</span>
              </li>
              <li class="flex items-start">
                <svg class="w-6 h-6 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="text-neutral-body">Matched to your role, pay range, and location</span>
              </li>
              <li class="flex items-start">
                <svg class="w-6 h-6 text-brand-success mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="text-neutral-body">Optional access to hiring contact details and interview prep</span>
              </li>
            </ul>
            <div class="flex flex-col sm:flex-row gap-4 mb-4">
              <router-link to="/register" class="btn-primary text-center">
                Start your free trial
              </router-link>
              <router-link to="/how-it-works" class="btn-secondary text-center">
                See how it works
              </router-link>
            </div>
            <p class="text-sm text-neutral-body">
              No spam. No random jobs. Cancel anytime.
            </p>
          </div>
          <div class="hidden lg:block">
            <div class="bg-gradient-to-br from-brand-rabbit-start to-brand-rabbit-end rounded-[12px] p-8 h-96 flex items-center justify-center">
              <p class="text-white text-lg">Dashboard Preview</p>
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
          Most job platforms make it feel like a numbers game: hundreds of applications, endless screening questions, and almost no responses. Companies post roles they might need 'someday,' and you're left guessing which applications are actually worth your time.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="card p-6">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <p class="text-neutral-body">You apply to dozens—or hundreds—of jobs and never hear back.</p>
          </div>
          <div class="card p-6">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <p class="text-neutral-body">Postings stay up long after roles are filled.</p>
          </div>
          <div class="card p-6">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
            </div>
            <p class="text-neutral-body">Screening questions and assessments chew up your evenings.</p>
          </div>
          <div class="card p-6">
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
          <div class="text-center">
            <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-2xl font-bold">1</span>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">Tell us what you're looking for</h3>
            <p class="text-neutral-body">In 60 seconds, share your background, role targets, salary range, and where you're willing to work.</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-2xl font-bold">2</span>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">We curate and match jobs in real time</h3>
            <p class="text-neutral-body">Our team and cutting edge AI engine scan job boards and company postings, weed out the junk and pick only the most active jobs that fit YOU best, and verify them with company details and behind the scenes insights.</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4">
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
          Built for serious job seekers—starting with manufacturing
        </h2>
        <p class="text-lg text-neutral-body mb-12 text-center">
          Whether you're on the plant floor or leading operations, Job-Hopper helps you move faster toward your next role.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="card p-8">
            <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">Entry & Mid Level Roles</h3>
            <p class="text-neutral-body">Curated opportunities across hourly, administrative, and early-career salaried positions. Matched to your experience level, pay expectations, schedule preferences, and location.</p>
          </div>
          <div class="card p-8">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
            </div>
            <h3 class="text-xl font-heading font-semibold mb-3">Senior & Management Level Roles</h3>
            <p class="text-neutral-body">Targeted searches for experienced professionals and people leaders, including salaried, supervisory and management positions with greater responsibility, broader scope, and stronger compensation alignment.</p>
          </div>
          <div class="card p-8">
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div class="card p-8">
            <h3 class="text-xl font-heading font-semibold mb-2">Entry & Mid Level Roles</h3>
            <p class="text-3xl font-bold text-brand-primary mb-4">From $19<span class="text-lg font-normal text-neutral-body">/month</span></p>
            <p class="text-neutral-body mb-6">For hourly, administrative, and early-career salaried roles.</p>
            <router-link to="/register" class="btn-primary w-full text-center block">
              Start free trial
            </router-link>
          </div>
          <div class="card p-8 border-2 border-brand-primary">
            <div class="inline-block bg-brand-primary text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">Most popular</div>
            <h3 class="text-xl font-heading font-semibold mb-2">Senior & Management Level Roles</h3>
            <p class="text-3xl font-bold text-brand-primary mb-4">From $29<span class="text-lg font-normal text-neutral-body">/month</span></p>
            <p class="text-neutral-body mb-6">For experienced professionals, supervisors, and managers.</p>
            <router-link to="/register" class="btn-primary w-full text-center block">
              Start free trial
            </router-link>
          </div>
          <div class="card p-8">
            <h3 class="text-xl font-heading font-semibold mb-2">Director, VP & C-Level Roles</h3>
            <p class="text-3xl font-bold text-brand-primary mb-4">From $49<span class="text-lg font-normal text-neutral-body">/month</span></p>
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div v-for="(testimonial, index) in testimonials" :key="index" class="card p-6">
            <p class="text-neutral-body mb-4 italic">"{{ testimonial.text }}"</p>
            <p class="text-sm font-semibold text-brand-charcoal">– {{ testimonial.author }}, {{ testimonial.location }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="bg-gradient-to-r from-brand-primary to-blue-700 py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto text-center">
        <h2 class="text-white mb-6">
          Ready to stop hunting and hop to the next level?
        </h2>
        <p class="text-xl text-white/90 mb-8">
          Create your profile today and start receiving curated job matches. If it's not for you, cancel anytime in just a couple of clicks.
        </p>
        <router-link to="/register" class="btn-secondary bg-white text-brand-primary hover:bg-neutral-bg inline-block mb-4">
          Start your free trial
        </router-link>
        <p class="text-white/80 text-sm">
          <router-link to="/faq" class="underline hover:text-white">Questions? Check our FAQ.</router-link>
        </p>
      </div>
    </section>
  </div>
</template>

