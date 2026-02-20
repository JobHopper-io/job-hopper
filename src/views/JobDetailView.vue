<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { subscriptionAPI } from '@/lib/subscription'
import type { CurrentSubscription } from '@/types/database'
import { hasAddonByKey } from '@/lib/subscription'

interface JobHiringContact {
  name: string
  title: string
  location: string
  note: string
}

interface JobInterviewPrep {
  themes: string[]
  questions_they_might_ask: string[]
  questions_to_ask: string[]
}

interface JobDetail {
  id: string
  title: string
  company: string
  location: string
  salary_min?: number
  salary_max?: number
  overview?: string
  shift?: string
  company_size?: string
  employment_type?: string
  posted_date?: string
  match_reasons?: string[]
  hiring_contacts?: JobHiringContact[]
  interview_prep?: JobInterviewPrep
}

const route = useRoute()
const router = useRouter()

const jobId = route.params.id as string
const job = ref<JobDetail | null>(null)
const subscription = ref<CurrentSubscription | null>(null)
const isLoading = ref(true)

onMounted(async () => {
  try {
    // TODO: Fetch job details from API
    // For now, using placeholder data
    job.value = {
      id: jobId,
      title: 'Maintenance Technician',
      company: 'ABC Manufacturing',
      location: 'Toledo, OH',
      salary_min: 55000,
      salary_max: 65000,
      overview: 'This role is with a mid-sized food manufacturing plant (200–300 employees) looking for a hands-on maintenance professional to support production equipment, troubleshoot downtime, and coordinate with operations leadership.',
      shift: 'Day shift',
      company_size: '200-300 employees',
      employment_type: 'Full-time',
      posted_date: '2024-01-15',
      match_reasons: [
        'You\'ve worked in similar environments with high-volume production.',
        'Your maintenance experience lines up with the core responsibilities listed.',
        'The pay range and shift align with the preferences in your profile.'
      ],
      hiring_contacts: [
        {
          name: 'John Smith',
          title: 'Maintenance Manager',
          location: 'Toledo, OH',
          note: 'Likely department leader for this role'
        }
      ],
      interview_prep: {
        themes: ['Equipment troubleshooting experience', 'Preventive maintenance programs', 'Production line support'],
        questions_they_might_ask: [
          'Tell us about your experience with food manufacturing equipment.',
          'How do you prioritize maintenance tasks during production hours?'
        ],
        questions_to_ask: [
          'What does the typical day-to-day look like for this role?',
          'What are the biggest maintenance challenges facing the plant right now?'
        ]
      }
    }

    const { data: subscriptionData } = await subscriptionAPI.getCurrentSubscription()
    subscription.value = subscriptionData
  } catch (error) {
    console.error('Error loading job details:', error)
  } finally {
    isLoading.value = false
  }
})

const hasPremiumInsights = () => hasAddonByKey(subscription.value, 'premium_insights')

const hasInterviewPrep = () => hasAddonByKey(subscription.value, 'interview_prep')
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <!-- Back Button -->
      <button
        @click="router.push('/dashboard')"
        class="flex items-center text-brand-primary hover:underline mb-6"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
        Back to Feed
      </button>

      <div v-if="isLoading" class="text-center py-12">
        <svg class="animate-spin h-8 w-8 text-brand-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-neutral-body">Loading job details...</p>
      </div>

      <div v-else-if="job" class="space-y-6">
        <!-- Header -->
        <div class="card p-6">
          <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-2">{{ job.title }}</h1>
          <p class="text-xl text-brand-primary font-medium mb-1">{{ job.company }}</p>
          <p class="text-neutral-body">{{ job.location }}</p>
        </div>

        <!-- Overview -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Overview</h2>
          <p class="text-neutral-body leading-relaxed">{{ job.overview }}</p>
        </div>

        <!-- Key Details -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Key Details</h2>
          <ul class="space-y-2 text-neutral-body">
            <li><span class="font-semibold">Shift or schedule:</span> {{ job.shift }}</li>
            <li><span class="font-semibold">Estimated salary range:</span> ${{ job.salary_min?.toLocaleString() }} - ${{ job.salary_max?.toLocaleString() }}</li>
            <li><span class="font-semibold">Company size:</span> {{ job.company_size }}</li>
            <li><span class="font-semibold">Employment type:</span> {{ job.employment_type }}</li>
            <li><span class="font-semibold">Posted:</span> {{ job.posted_date }}</li>
          </ul>
        </div>

        <!-- Why This Fits -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Why this might be a fit</h2>
          <ul class="space-y-2">
            <li v-for="(reason, index) in job.match_reasons" :key="index" class="flex items-start">
              <svg class="w-5 h-5 text-brand-success mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-neutral-body">{{ reason }}</span>
            </li>
          </ul>
        </div>

        <!-- Premium: Hiring Insights -->
        <div v-if="hasPremiumInsights() && job.hiring_contacts" class="card p-6 border-2 border-brand-primary">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Hiring insights & contacts</h2>
          <p class="text-neutral-body mb-4">Based on our research, hiring decisions for this role may involve:</p>
          <div class="space-y-4">
            <div v-for="(contact, index) in job.hiring_contacts" :key="index" class="bg-neutral-bg p-4 rounded-[12px]">
              <p class="font-semibold text-brand-charcoal">{{ contact.name }}</p>
              <p class="text-sm text-neutral-body">{{ contact.title }}</p>
              <p v-if="contact.location" class="text-sm text-neutral-body">{{ contact.location }}</p>
              <p class="text-sm text-neutral-body mt-2 italic">{{ contact.note }}</p>
            </div>
          </div>
          <p class="text-xs text-neutral-body mt-4 italic">
            Use this information respectfully and professionally. Start with a short, targeted introduction.
          </p>
        </div>

        <!-- Premium: Interview Prep -->
        <div v-if="hasInterviewPrep() && job.interview_prep" class="card p-6 border-2 border-brand-primary">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Interview prep tips for this role</h2>
          <div class="space-y-6">
            <div>
              <h3 class="font-semibold text-brand-charcoal mb-2">Key themes to highlight in your experience</h3>
              <ul class="space-y-1">
                <li v-for="(theme, index) in job.interview_prep.themes" :key="index" class="flex items-start">
                  <svg class="w-4 h-4 text-brand-success mr-2 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span class="text-sm text-neutral-body">{{ theme }}</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 class="font-semibold text-brand-charcoal mb-2">Example questions you might be asked</h3>
              <ul class="space-y-1">
                <li v-for="(question, index) in job.interview_prep.questions_they_might_ask" :key="index" class="flex items-start">
                  <span class="text-sm text-neutral-body">• {{ question }}</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 class="font-semibold text-brand-charcoal mb-2">Smart questions you can ask them</h3>
              <ul class="space-y-1">
                <li v-for="(question, index) in job.interview_prep.questions_to_ask" :key="index" class="flex items-start">
                  <span class="text-sm text-neutral-body">• {{ question }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- How to Apply -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">How to apply</h2>
          <p class="text-neutral-body mb-6">
            Apply directly on the company's chosen platform using the button below. Use the insights above to tailor your resume and responses so you stand out from generic applicants.
          </p>
          <div class="flex gap-3">
            <button class="btn-primary flex-1">
              Apply on company site
            </button>
            <button class="btn-secondary">
              Save this job
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

