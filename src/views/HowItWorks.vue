<script setup lang="ts">
const steps = [
  {
    title: 'Build your profile',
    aside: '60 seconds',
    points: [
      'Your current role and experience level.',
      'The kinds of jobs you’re targeting.',
      'Your pay range and preferred locations.',
      'Your resume, so we understand your background.',
    ],
  },
  {
    title: 'The Hopper collects and curates',
    lead: 'We continuously pull new postings from LinkedIn, Indeed, and company career pages, then:',
    points: [
      'Filter out stale, low-quality, and resume-collecting posts.',
      'Enrich each role with company size, industry, and background.',
      'Map roles to experience levels.',
      'Analyze posting metadata to estimate sponsorship likelihood.',
    ],
  },
  {
    title: 'We match and send',
    lead: 'Every new job is checked against your profile for:',
    points: [
      'Role alignment and experience level.',
      'Location and relocation settings.',
      'Salary or wage expectation.',
      'Sponsorship likelihood, when you use that filter.',
    ],
    footer:
      'Good fits land in your feed and — depending on your settings — trigger an email or notification.',
  },
  {
    title: 'You apply and follow up',
    points: [
      'A short AI-generated job briefing.',
      'A direct link to apply on the company’s platform.',
    ],
    premium: 'verified hiring contact info',
  },
]

const controls = [
  'Widen or narrow your job types',
  'Expand or tighten location boundaries',
  'Add or remove industries',
  'Pause certain types of roles',
  'Toggle sponsorship-likelihood filtering',
]

const privacy = [
  'We use your profile only to match you with jobs and improve recommendations.',
  'We never sell your personal data to third-party advertisers.',
  'You can delete your account at any time.',
]
</script>

<template>
  <div class="min-h-screen bg-white py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-3xl mx-auto">
      <!-- Intro -->
      <section class="mb-16 text-center">
        <h1 class="text-brand-charcoal mb-6">
          How Job-Hopper finds the right jobs for you
        </h1>
        <p class="text-lg text-neutral-body mb-4">
          Job-Hopper is the AI layer that runs your U.S. job search — so you're not refreshing five
          sites every night.
        </p>
        <p class="text-neutral-body">
          We scan job boards and company postings, vet each role for freshness and real hiring
          activity, then match what's left against your profile, preferences, and career level. You
          see company size and background on every posting, so you're never applying blind.
        </p>
      </section>

      <!-- Steps -->
      <section class="mb-16">
        <h2 class="text-brand-charcoal mb-12 text-center">The process, step by step</h2>
        <ol class="space-y-10">
          <li v-for="(step, i) in steps" :key="step.title" class="flex flex-col md:flex-row gap-6">
            <div
              class="w-12 h-12 shrink-0 bg-brand-primary rounded-full flex items-center justify-center"
              aria-hidden="true"
            >
              <span class="text-white text-xl font-bold">{{ i + 1 }}</span>
            </div>
            <div class="flex-1">
              <h3 class="text-xl font-heading font-semibold mb-3">
                {{ step.title }}
                <span v-if="step.aside" class="font-normal text-neutral-body">({{ step.aside }})</span>
              </h3>
              <p v-if="step.lead" class="text-neutral-body mb-3">{{ step.lead }}</p>
              <ul class="space-y-2 text-neutral-body">
                <li v-for="point in step.points" :key="point" class="flex items-start">
                  <font-awesome-icon
                    :icon="['fas', 'check']"
                    class="w-4 h-4 text-brand-success mr-2 mt-1 shrink-0"
                  />
                  <span>{{ point }}</span>
                </li>
                <li v-if="step.premium" class="flex items-start">
                  <font-awesome-icon
                    :icon="['fas', 'check']"
                    class="w-4 h-4 text-brand-success mr-2 mt-1 shrink-0"
                  />
                  <span>
                    On Premium (rolling out —
                    <router-link to="/pricing" class="text-brand-primary hover:underline">
                      join the waitlist</router-link>): {{ step.premium }}.
                  </span>
                </li>
              </ul>
              <p v-if="step.footer" class="text-neutral-body mt-3">{{ step.footer }}</p>
            </div>
          </li>
        </ol>
      </section>

      <!-- Matching philosophy -->
      <section class="mb-8 card p-8">
        <h2 class="text-brand-charcoal mb-4">Not too tight, not too loose</h2>
        <p class="text-neutral-body mb-4">
          Too tight and you miss opportunities; too loose and you're back in job-board chaos. We
          start with a sensible range, then hand you the controls:
        </p>
        <ul class="space-y-2 text-neutral-body">
          <li v-for="control in controls" :key="control" class="flex items-start">
            <font-awesome-icon
              :icon="['fas', 'check']"
              class="w-4 h-4 text-brand-success mr-2 mt-1 shrink-0"
            />
            <span>{{ control }}</span>
          </li>
        </ul>
      </section>

      <!-- Sponsorship note -->
      <section class="mb-8 card p-8">
        <h2 class="text-brand-charcoal mb-4">About the sponsorship signal</h2>
        <p class="text-neutral-body">
          When visa sponsorship is part of your situation, our sponsorship-likelihood signal helps
          you spend less time on postings that are unlikely to line up. It is a practical filter and
          estimate — not a promise that a given employer will sponsor.
        </p>
      </section>

      <!-- Data & privacy -->
      <section class="card p-8">
        <h2 class="text-brand-charcoal mb-4">Your data, your control</h2>
        <ul class="space-y-2 text-neutral-body">
          <li v-for="item in privacy" :key="item" class="flex items-start">
            <font-awesome-icon
              :icon="['fas', 'check']"
              class="w-4 h-4 text-brand-success mr-2 mt-1 shrink-0"
            />
            <span>{{ item }}</span>
          </li>
        </ul>
      </section>

      <!-- CTA -->
      <div class="text-center mt-12">
        <router-link to="/register" class="btn-primary inline-block">
          Start your free trial
        </router-link>
      </div>
    </div>
  </div>
</template>
