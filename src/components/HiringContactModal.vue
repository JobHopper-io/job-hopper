<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { jobsAPI } from '@/lib/jobs'
import type { JobHiringContact } from '@/types/database'

const props = defineProps<{
  open: boolean
  jobId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const loading = ref(false)
const loadError = ref<string | null>(null)
const row = ref<JobHiringContact | null>(null)
const fromCache = ref(false)

async function fetchContact() {
  if (!props.jobId) return
  loading.value = true
  loadError.value = null
  row.value = null
  fromCache.value = false
  try {
    const { data, error } = await jobsAPI.findHiringContact(props.jobId)
    if (error) {
      loadError.value = error.message
      return
    }
    row.value = data?.row ?? null
    fromCache.value = data?.cached === true
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.jobId) {
      void fetchContact()
    }
    if (typeof document === 'undefined') return
    if (isOpen) document.body.classList.add('overflow-hidden')
    else document.body.classList.remove('overflow-hidden')
  },
)

function onBackdropClick() {
  emit('close')
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && props.open) emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.classList.remove('overflow-hidden')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hiring-contact-modal-title"
      @click.self="onBackdropClick"
    >
      <div
        class="card flex max-h-[min(85vh,36rem)] w-full max-w-lg flex-col overflow-hidden p-0 shadow-xl"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4 border-b border-neutral-border px-6 py-4">
          <div class="min-w-0">
            <h2
              id="hiring-contact-modal-title"
              class="text-xl font-heading font-semibold text-brand-charcoal"
            >
              Hiring contact
            </h2>
            <p v-if="fromCache && row" class="mt-1 text-xs text-neutral-body">
              Cached result — no additional lookup was run.
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg p-2 text-neutral-body hover:bg-neutral-bg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            aria-label="Close"
            @click="emit('close')"
          >
            <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div v-if="loading" class="flex flex-col items-center justify-center gap-3 py-10 text-center text-neutral-body">
            <font-awesome-icon
              :icon="['fas', 'spinner']"
              spin
              class="text-2xl text-brand-primary"
              aria-hidden="true"
            />
            <p class="text-sm">Looking up a likely hiring contact…</p>
          </div>

          <div v-else-if="loadError" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {{ loadError }}
          </div>

          <div v-else-if="row?.status === 'found'" class="space-y-3 text-sm">
            <p class="text-neutral-body">
              Here is the best match we could find for outreach at this company.
            </p>
            <dl class="space-y-2">
              <div v-if="row.full_name">
                <dt class="text-xs font-semibold uppercase tracking-wide text-neutral-body">Name</dt>
                <dd class="text-brand-charcoal">{{ row.full_name }}</dd>
              </div>
              <div v-if="row.title">
                <dt class="text-xs font-semibold uppercase tracking-wide text-neutral-body">Title</dt>
                <dd class="text-brand-charcoal">{{ row.title }}</dd>
              </div>
              <div v-if="row.email">
                <dt class="text-xs font-semibold uppercase tracking-wide text-neutral-body">Email</dt>
                <dd>
                  <a
                    :href="`mailto:${row.email}`"
                    class="inline-flex items-center gap-1.5 font-medium text-brand-primary hover:underline"
                  >
                    <font-awesome-icon :icon="['fas', 'envelope']" class="shrink-0" aria-hidden="true" />
                    {{ row.email }}
                  </a>
                </dd>
              </div>
              <div v-if="row.linkedin_url">
                <dt class="text-xs font-semibold uppercase tracking-wide text-neutral-body">LinkedIn</dt>
                <dd>
                  <a
                    :href="row.linkedin_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-brand-primary font-medium hover:underline break-all"
                  >
                    {{ row.linkedin_url }}
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          <div v-else-if="row?.status === 'not_found'" class="text-sm text-neutral-body">
            <p class="mb-2 font-medium text-brand-charcoal">
              We couldn't find a likely hiring contact for this role.
            </p>
            <p>
              Try applying through the official posting or reaching out via the company's careers page.
              We've saved this result so we won't repeat the lookup for this job.
            </p>
          </div>

          <div v-else-if="row?.status === 'error'" class="text-sm text-neutral-body">
            <p class="mb-2 flex items-center gap-2 font-medium text-brand-charcoal">
              <font-awesome-icon :icon="['fas', 'exclamation-triangle']" class="text-amber-600" aria-hidden="true" />
              Lookup didn't complete
            </p>
            <p v-if="row.error_message" class="break-words font-mono text-xs">
              {{ row.error_message }}
            </p>
            <p v-else class="text-neutral-body">
              Something went wrong while contacting our data provider. Please try again later.
            </p>
          </div>

          <div v-else class="text-sm text-neutral-body">
            No result returned.
          </div>
        </div>

        <div class="border-t border-neutral-border px-6 py-4">
          <button type="button" class="btn-primary w-full sm:w-auto" @click="emit('close')">
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
