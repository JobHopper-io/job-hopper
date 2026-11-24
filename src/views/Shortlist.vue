<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { SHORTLIST_SIGNUP_URL, shortlistAPI, type PublicShortlist } from '@/lib/shortlist'

// Public reverse-recruiting shortlist (/s/:token), linked from the job-seeker outreach
// email. The token is the only credential. Apply goes through the tracked click URL.
const route = useRoute()
const token = typeof route.params.token === 'string' ? route.params.token : ''

const state = ref<'loading' | 'ok' | 'not_found' | 'error'>('loading')
const shortlist = ref<PublicShortlist | null>(null)

onMounted(async () => {
  const result = await shortlistAPI.load(token)
  if (result.status === 'ok') shortlist.value = result.shortlist
  state.value = result.status
})

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <div v-if="state === 'loading'" class="card p-8 text-center">
        <font-awesome-icon :icon="['fas', 'spinner']" spin class="text-3xl text-brand-charcoal mb-4" aria-hidden="true" />
        <p class="text-neutral-body">Loading your shortlist…</p>
      </div>

      <div v-else-if="state === 'not_found' || state === 'error'" class="card p-8 text-center">
        <font-awesome-icon :icon="['fas', 'exclamation-triangle']" class="text-4xl text-amber-500 mb-6" aria-hidden="true" />
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-3">
          {{ state === 'error' ? 'Something went wrong' : 'This shortlist has expired or isn’t valid' }}
        </h1>
        <p class="text-neutral-body mb-6">
          {{ state === 'error' ? 'Please try again in a moment.' : 'Shortlists stay up for 14 days. You can still get matches like these by creating a profile.' }}
        </p>
        <a :href="SHORTLIST_SIGNUP_URL" class="btn-primary w-full inline-block text-center">Get matches every week, free</a>
      </div>

      <template v-else-if="shortlist">
        <header class="mb-6">
          <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-2">Jobs that match your search</h1>
          <p class="text-neutral-body">
            We check that each job is still open when we make the list, but jobs can close at any time.
            This list stays up until {{ formatDate(shortlist.expires_at) }}.
          </p>
        </header>

        <p v-if="shortlist.jobs.length === 0" class="card p-6 text-neutral-body">
          The jobs on this list have closed since we made it.
        </p>

        <ul class="space-y-4">
          <li v-for="job in shortlist.jobs" :key="job.job_id" class="card p-6">
            <h2 class="text-lg font-heading font-semibold text-brand-charcoal">{{ job.title || 'Untitled role' }}</h2>
            <p class="mt-1 text-sm text-neutral-body flex flex-wrap gap-x-4 gap-y-1">
              <span v-if="job.company">
                <font-awesome-icon :icon="['fas', 'briefcase']" class="mr-1 text-neutral-muted" aria-hidden="true" />{{ job.company }}
              </span>
              <span v-if="job.location">
                <font-awesome-icon :icon="['fas', 'location-dot']" class="mr-1 text-neutral-muted" aria-hidden="true" />{{ job.location }}
              </span>
              <span v-if="formatDate(job.posted_date)">Posted {{ formatDate(job.posted_date) }}</span>
            </p>
            <ul v-if="job.bullets.length" class="mt-3 space-y-1 text-sm text-brand-charcoal">
              <li v-for="b in job.bullets" :key="b" class="flex gap-2">
                <font-awesome-icon :icon="['fas', 'check']" class="mt-0.5 text-green-600" aria-hidden="true" />
                <span>{{ b }}</span>
              </li>
            </ul>
            <a
              :href="job.click_url"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-primary mt-4 inline-block"
            >
              Apply
              <font-awesome-icon :icon="['fas', 'arrow-up-right-from-square']" class="ml-2" aria-hidden="true" />
              <span class="sr-only">(opens the employer’s site in a new tab)</span>
            </a>
          </li>
        </ul>

        <section class="card p-6 mt-8 text-center">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-2">Get matches like these every week, free</h2>
          <p class="text-neutral-body mb-4">Create a profile and we’ll send new jobs that fit your search.</p>
          <!-- A full page load (not router-link) so App.vue records the campaign as first touch. -->
          <a :href="SHORTLIST_SIGNUP_URL" class="btn-primary inline-block">Create my free profile</a>
        </section>
      </template>
    </div>
  </div>
</template>
