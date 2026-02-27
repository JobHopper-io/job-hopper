<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { jobsAPI, type MatchedJob } from '@/lib/jobs'

const route = useRoute()
const router = useRouter()

const jobIdParam = route.params.id as string
const jobId = Number.parseInt(jobIdParam, 10)
const job = ref<MatchedJob | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

const userStore = useUserStore()

onMounted(async () => {
  try {
    if (Number.isNaN(jobId)) {
      loadError.value = 'Invalid job id'
      return
    }
    const { data, error } = await jobsAPI.getJobMatchByJobId(jobId)
    if (error) {
      loadError.value = error.message
      return
    }
    if (!data) {
      loadError.value = 'Job not found in your matches'
      return
    }
    job.value = data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    loadError.value = message
  } finally {
    isLoading.value = false
  }
})

type OverviewBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

function buildOverviewBlocks(raw: string | null | undefined): OverviewBlock[] {
  const source = raw?.trim()
  if (!source) {
    return [
      {
        type: 'paragraph',
        text: 'This role does not have a detailed overview yet.',
      },
    ]
  }

  // Normalize common scraped formatting into line breaks + bullets.
  let normalized = source
    // Turn middle-dot or asterisk bullets into real bullets on their own lines.
    .replace(/(?:\u00b7|\*)\s*/g, '\n• ')
    // Insert breaks between sentences when there is a capital letter after punctuation.
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')

  // Split into logical lines.
  const rawLines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const blocks: OverviewBlock[] = []
  let currentList: string[] | null = null

  for (const line of rawLines) {
    const bulletMatch = line.match(/^(?:[-*•]\s+)(.+)$/)
    if (bulletMatch) {
      const itemText = bulletMatch[1].trim()
      if (!currentList) {
        currentList = []
        blocks.push({ type: 'list', items: currentList })
      }
      currentList.push(itemText)
      continue
    }

    // Non-bullet line: close any open list and add as its own paragraph.
    currentList = null
    blocks.push({ type: 'paragraph', text: line })
  }

  return blocks
}

const formattedOverview = computed<OverviewBlock[]>(() =>
  buildOverviewBlocks(job.value?.description),
)

async function handleToggleSave() {
  if (!job.value) return
  if (job.value.isSaved) {
    await jobsAPI.unsaveJob(job.value.matchId)
    job.value.isSaved = false
  } else {
    await jobsAPI.saveJob(job.value.matchId)
    job.value.isSaved = true
  }
}

function handleApplyClick() {
  if (!job.value || !job.value.applyLink) return
  window.open(job.value.applyLink, '_blank', 'noopener,noreferrer')
}
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

      <div v-else-if="loadError" class="card p-6 text-center text-red-600">
        {{ loadError }}
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
          <div class="space-y-3 text-neutral-body leading-relaxed">
            <template
              v-for="(block, index) in formattedOverview"
              :key="index"
            >
              <p v-if="block.type === 'paragraph'">
                {{ block.text }}
              </p>
              <ul
                v-else
                class="list-disc pl-5 space-y-1"
              >
                <li
                  v-for="(item, idx) in block.items"
                  :key="idx"
                >
                  {{ item }}
                </li>
              </ul>
            </template>
          </div>
        </div>

        <!-- Key Details -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Key Details</h2>
          <ul class="space-y-2 text-neutral-body">
            <li>
              <span class="font-semibold">Apply link:</span>
              <span v-if="job.applyLink">
                <a
                  :href="job.applyLink"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-brand-primary hover:underline"
                >
                  Apply on company site
                </a>
              </span>
              <span v-else>Not provided</span>
            </li>
            <li>
              <span class="font-semibold">Match score:</span>
              {{ job.score != null ? job.score.toFixed(1) : '—' }}
            </li>
          </ul>
        </div>

        <!-- How to Apply -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">How to apply</h2>
          <p class="text-neutral-body mb-6">
            Apply directly on the company's chosen platform using the button below. Use the insights above to tailor your resume and responses so you stand out from generic applicants.
          </p>
          <div class="flex gap-3">
            <button
              class="btn-primary flex-1"
              :disabled="!job.applyLink"
              @click="handleApplyClick"
            >
              Apply on company site
            </button>
            <button
              class="btn-secondary"
              type="button"
              @click="handleToggleSave"
            >
              {{ job.isSaved ? 'Unsave this job' : 'Save this job' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

