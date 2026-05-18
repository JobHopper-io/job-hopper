<template>
  <div class="min-h-screen bg-white py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <!-- Intro Section -->
      <section class="mb-16">
        <h1 class="text-brand-charcoal mb-6 text-center">
          How Job-Hopper finds the right jobs for you
        </h1>
        <div class="prose prose-lg max-w-none text-neutral-body">
          <p class="text-lg mb-4">
            Job-Hopper is the AI layer that runs your U.S. job search for you—so you are not stuck refreshing five sites every night.
          </p>
          <p class="mb-4">
            We continuously scan job boards and direct company postings, then actively vet each role for freshness, legitimacy, and real hiring activity. Our system filters out stale listings, passive resume-collecting posts, and low-activity roles before they ever reach you.
          </p>
          <p class="mb-4">
            From there, our team and proprietary matching engine combine your profile, preferences, and career level with enriched company data and behind-the-scenes hiring insights to deliver only the most relevant opportunities, in real time.
          </p>
          <p class="mb-4">
            On higher tiers, Job-Hopper goes further - providing company intelligence, role context, hiring contact insights, and interview-prep guidance so you're not just applying blindly, but approaching opportunities with clarity and confidence.
          </p>
          <p class="mb-4">
            For every role that passes through the Hopper, we also run deep metadata analysis. One outcome of that pipeline is a sponsorship-likelihood signal: when visa sponsorship is part of your situation, you can use it to spend less time on postings that are unlikely to line up—without Job-Hopper becoming a sponsorship-only product. The signal is a practical filter and estimate, not a promise that a given employer will sponsor.
          </p>
          <p class="mb-4">
            The result? Fewer distractions. Better timing. Smarter matches.
          </p>
          <p class="font-medium">
            Job-Hopper turns a chaotic job search into a focused, AI-driven advantage—the kind of upgrade people will expect from job search from here on out.
          </p>
        </div>
      </section>

      <!-- Step Breakdown -->
      <section class="mb-16">
        <h2 class="text-brand-charcoal mb-12 text-center">
          The process, step by step
        </h2>
        <div class="space-y-12">
          <!-- Step 1 -->
          <div class="flex flex-col md:flex-row gap-8 items-start">
            <div class="flex-shrink-0">
              <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center">
                <span class="text-white text-2xl font-bold">1</span>
              </div>
            </div>
            <div class="flex-1">
              <h3 class="text-2xl font-heading font-semibold mb-4">Build your profile (60 seconds)</h3>
              <ul class="space-y-2 text-neutral-body">
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Share your current role and experience level.</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Tell us what kinds of jobs you're targeting.</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Set your desired wage or salary range and preferred locations.</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Upload your resume so we can better understand your background.</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="flex flex-col md:flex-row gap-8 items-start">
            <div class="flex-shrink-0">
              <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center">
                <span class="text-white text-2xl font-bold">2</span>
              </div>
            </div>
            <div class="flex-1">
              <h3 class="text-2xl font-heading font-semibold mb-4">Our 'Hopper' collects & curates jobs</h3>
              <p class="text-neutral-body mb-4">
                Our system continuously pulls in new postings from sources like LinkedIn, Indeed, and direct company career pages.
              </p>
              <p class="text-neutral-body mb-4">From there, we:</p>
              <ul class="space-y-2 text-neutral-body">
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Filter out stale or low-quality postings.</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Enrich each match with company size, industry, and background.</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Map roles to experience levels so you don't see jobs that waste your time.</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Analyze posting metadata so you can optionally filter or sort by sponsorship likelihood when H-1B or other employer sponsorship is relevant to you.</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="flex flex-col md:flex-row gap-8 items-start">
            <div class="flex-shrink-0">
              <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center">
                <span class="text-white text-2xl font-bold">3</span>
              </div>
            </div>
            <div class="flex-1">
              <h3 class="text-2xl font-heading font-semibold mb-4">We match and send opportunities</h3>
              <p class="text-neutral-body mb-4">
                For each new job that hits the Hopper, we check it against your profile:
              </p>
              <ul class="space-y-2 text-neutral-body mb-4">
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Role alignment</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Location + relocation settings</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Salary/wage expectation</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Experience level</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Your sponsorship needs and sponsorship-likelihood on each posting (when you use that filter)</span>
                </li>
              </ul>
              <p class="text-neutral-body">
                If it looks like a good fit, it goes into your personal feed and, depending on your settings, triggers an email and/or notification.
              </p>
            </div>
          </div>

          <!-- Step 4 -->
          <div class="flex flex-col md:flex-row gap-8 items-start">
            <div class="flex-shrink-0">
              <div class="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center">
                <span class="text-white text-2xl font-bold">4</span>
              </div>
            </div>
            <div class="flex-1">
              <h3 class="text-2xl font-heading font-semibold mb-4">You apply and follow up</h3>
              <p class="text-neutral-body mb-4">You get:</p>
              <ul class="space-y-2 text-neutral-body">
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>A short AI-generated job briefing</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>A direct link to apply on the company's chosen platform</span>
                </li>
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>On premium plans, suggested outreach messages and hiring contact info where available</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Matching Philosophy -->
      <section class="mb-16 card p-8">
        <h2 class="text-brand-charcoal mb-6">
          Not too tight, not too loose
        </h2>
        <p class="text-neutral-body mb-4">
          Good matching is a balance. If filters are too tight, you miss opportunities. Too loose, and you're back in job-board chaos.
        </p>
        <p class="text-neutral-body mb-4">
          We start with a sensible range, then give you control:
        </p>
        <ul class="space-y-2 text-neutral-body">
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Adjust how broad or narrow your job types are</span>
          </li>
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Expand or tighten location boundaries</span>
          </li>
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Add or remove industries</span>
          </li>
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Pause certain types of roles</span>
          </li>
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Turn sponsorship-likelihood filtering on or off depending on whether visa sponsorship is part of your search right now</span>
          </li>
        </ul>
      </section>

      <!-- Data & Privacy -->
      <section class="card p-8">
        <h2 class="text-brand-charcoal mb-6">
          Your data, your control
        </h2>
        <ul class="space-y-3 text-neutral-body">
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>We use your profile only to match you with jobs and improve recommendations.</span>
          </li>
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>We never sell your personal data to third-party advertisers.</span>
          </li>
          <li class="flex items-start">
            <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>You can delete your account at any time.</span>
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

