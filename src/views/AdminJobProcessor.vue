<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Job processor
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Start and monitor FastAPI pipeline runs (claims <code class="text-xs bg-neutral-bg px-1 rounded">scraper_raw_jobs</code>,
        enrich, promote to <code class="text-xs bg-neutral-bg px-1 rounded">job_hopper_live</code>). Super admin only; API keys stay on the server.
      </p>
    </header>

    <p
      v-if="pageError"
      class="mb-4 text-sm text-red-600"
    >
      {{ pageError }}
    </p>

    <!-- Health -->
    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6 space-y-4">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
        Service health
      </h2>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="healthLoading"
          @click="loadHealth"
        >
          <span v-if="healthLoading">
            <font-awesome-icon
              :icon="['fas', 'spinner']"
              spin
              class="mr-2"
              aria-hidden="true"
            />
            Checking…
          </span>
          <span v-else>Check health</span>
        </button>
        <span
          v-if="healthError"
          class="text-sm text-red-600"
        >{{ healthError }}</span>
      </div>
      <pre
        v-if="healthResult !== null"
        class="text-xs bg-neutral-bg rounded-lg p-3 overflow-x-auto text-brand-charcoal border border-neutral-border"
      >{{ JSON.stringify(healthResult, null, 2) }}</pre>
    </section>

    <!-- Run options -->
    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6 space-y-4">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
        Run options
      </h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block text-sm">
          <span class="font-medium text-brand-charcoal">limit</span>
          <input
            v-model.number="form.limit"
            type="number"
            min="1"
            max="5000"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          >
        </label>
        <label class="block text-sm">
          <span class="font-medium text-brand-charcoal">batch_size</span>
          <input
            v-model.number="form.batch_size"
            type="number"
            min="1"
            max="500"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          >
        </label>
        <label class="block text-sm">
          <span class="font-medium text-brand-charcoal">max_concurrent_llm</span>
          <input
            v-model.number="form.max_concurrent_llm"
            type="number"
            min="1"
            max="64"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          >
        </label>
        <label class="block text-sm">
          <span class="font-medium text-brand-charcoal">max_concurrent_apollo</span>
          <input
            v-model.number="form.max_concurrent_apollo"
            type="number"
            min="1"
            max="64"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          >
        </label>
        <label class="block text-sm">
          <span class="font-medium text-brand-charcoal">max_concurrent_brave</span>
          <input
            v-model.number="form.max_concurrent_brave"
            type="number"
            min="1"
            max="32"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          >
        </label>
        <label class="block text-sm">
          <span class="font-medium text-brand-charcoal">max_concurrent_fetch</span>
          <input
            v-model.number="form.max_concurrent_fetch"
            type="number"
            min="1"
            max="64"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
          >
        </label>
      </div>
      <div class="flex flex-wrap gap-4 text-sm">
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input
            v-model="form.skip_domain_resolution"
            type="checkbox"
            class="rounded border-neutral-border"
          >
          <span>skip_domain_resolution</span>
        </label>
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input
            v-model="form.skip_apollo"
            type="checkbox"
            class="rounded border-neutral-border"
          >
          <span>skip_apollo</span>
        </label>
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input
            v-model="form.skip_enrichment"
            type="checkbox"
            class="rounded border-neutral-border"
          >
          <span>skip_enrichment</span>
        </label>
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input
            v-model="form.force_clear_apollo_limit"
            type="checkbox"
            class="rounded border-neutral-border"
          >
          <span>force_clear_apollo_limit</span>
        </label>
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input
            v-model="form.dry_run"
            type="checkbox"
            class="rounded border-neutral-border"
          >
          <span>dry_run</span>
        </label>
      </div>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="startLoading"
          @click="startRun"
        >
          <span v-if="startLoading">
            <font-awesome-icon
              :icon="['fas', 'spinner']"
              spin
              class="mr-2"
              aria-hidden="true"
            />
            Starting…
          </span>
          <span v-else>Start run</span>
        </button>
        <span
          v-if="startError"
          class="text-sm text-red-600 self-center"
        >{{ startError }}</span>
      </div>
    </section>

    <!-- Hiring contact cache (Apollo) -->
    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6 space-y-4">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
        Hiring contact cache
      </h2>
      <p class="text-sm text-neutral-body max-w-2xl">
        Delete cached Apollo lookup for a <code class="text-xs bg-neutral-bg px-1 rounded">job_hopper_live.id</code>
        so the next in-app “Find hiring contact” call re-queries Apollo.
      </p>
      <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
        <label class="block text-sm flex-1">
          <span class="font-medium text-brand-charcoal">Job UUID</span>
          <input
            v-model="clearHcJobId"
            type="text"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm font-mono"
            placeholder="job_hopper_live.id"
          >
        </label>
        <button
          type="button"
          class="btn-secondary text-sm"
          :disabled="clearHcLoading || !clearHcJobId.trim()"
          @click="clearHiringContactCache"
        >
          <span v-if="clearHcLoading">
            <font-awesome-icon
              :icon="['fas', 'spinner']"
              spin
              class="mr-2"
              aria-hidden="true"
            />
          </span>
          Re-run lookup (clear cache)
        </button>
      </div>
      <p v-if="clearHcMessage" class="text-sm text-neutral-body">{{ clearHcMessage }}</p>
    </section>

    <!-- Monitor -->
    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
        Monitor run
      </h2>
      <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
        <label class="block text-sm flex-1">
          <span class="font-medium text-brand-charcoal">Run ID</span>
          <input
            v-model="monitorRunId"
            type="text"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm font-mono"
            placeholder="uuid"
          >
          <span class="mt-1 block text-xs text-neutral-muted">Change the ID, then Refresh (or toggle auto-refresh) to track another run.</span>
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="statusLoading || !monitorRunId.trim()"
            @click="refreshStatus"
          >
            <span v-if="statusLoading">
              <font-awesome-icon
                :icon="['fas', 'spinner']"
                spin
                class="mr-2"
                aria-hidden="true"
              />
              Loading…
            </span>
            <span v-else>Refresh</span>
          </button>
          <label class="inline-flex items-center gap-2 text-sm cursor-pointer self-center">
            <input
              v-model="autoPoll"
              type="checkbox"
              class="rounded border-neutral-border"
            >
            <span>Auto-refresh every 3s</span>
          </label>
        </div>
      </div>
      <p
        v-if="statusError"
        class="text-sm text-red-600"
      >
        {{ statusError }}
      </p>
      <div
        v-if="runStatus"
        class="space-y-3"
      >
        <div class="flex flex-wrap gap-2 text-sm">
          <span class="font-medium text-brand-charcoal">Status:</span>
          <span
            class="px-2 py-0.5 rounded-md font-medium"
            :class="statusBadgeClass(runStatus.status)"
          >{{ runStatus.status }}</span>
        </div>
        <div
          v-if="Object.keys(runStatus.counts || {}).length"
          class="grid gap-2 sm:grid-cols-2 text-sm"
        >
          <div
            v-for="(val, key) in runStatus.counts"
            :key="key"
            class="flex justify-between gap-4 border-b border-neutral-border border-opacity-50 pb-1"
          >
            <span class="text-neutral-muted font-medium">{{ key }}</span>
            <span class="text-brand-charcoal font-mono">{{ val }}</span>
          </div>
        </div>
        <p
          v-if="runStatus.error_message"
          class="text-sm text-red-600"
        >
          {{ runStatus.error_message }}
        </p>
        <p class="text-xs text-neutral-muted">
          Started: {{ runStatus.started_at ?? '—' }} · Finished: {{ runStatus.finished_at ?? '—' }}
        </p>
        <pre
          class="text-xs bg-neutral-bg rounded-lg p-3 overflow-x-auto text-brand-charcoal border border-neutral-border max-h-96 overflow-y-auto"
        >{{ JSON.stringify(runStatus, null, 2) }}</pre>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { profileAPI } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_JOB_PROCESSOR_RUN_OPTIONS,
  jobProcessorAdminAPI,
  type JobProcessorRunOptions,
  type JobProcessorRunStatus,
} from '@/lib/job-processor-admin'

const pageError = ref<string | null>(null)

const healthLoading = ref(false)
const healthError = ref<string | null>(null)
const healthResult = ref<unknown | null>(null)

const form = reactive<JobProcessorRunOptions>({ ...DEFAULT_JOB_PROCESSOR_RUN_OPTIONS })

const startLoading = ref(false)
const startError = ref<string | null>(null)

const monitorRunId = ref('')
const statusLoading = ref(false)
const statusError = ref<string | null>(null)
const runStatus = ref<JobProcessorRunStatus | null>(null)
const autoPoll = ref(true)

const clearHcJobId = ref('')
const clearHcLoading = ref(false)
const clearHcMessage = ref<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function statusBadgeClass(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  if (status === 'running') return 'bg-blue-100 text-blue-800'
  return 'bg-neutral-bg text-neutral-body'
}

async function loadHealth() {
  healthLoading.value = true
  healthError.value = null
  try {
    const { data, error } = await jobProcessorAdminAPI.checkHealth()
    if (error) {
      healthError.value = error.message
      healthResult.value = null
      return
    }
    healthResult.value = data
  } finally {
    healthLoading.value = false
  }
}

async function clearHiringContactCache() {
  clearHcLoading.value = true
  clearHcMessage.value = null
  try {
    const id = clearHcJobId.value.trim()
    if (!id) return
    const { error } = await supabase.functions.invoke('admin-delete-hiring-contact-cache', {
      body: { job_id: id },
    })
    if (error) {
      clearHcMessage.value = error.message
      return
    }
    clearHcMessage.value = 'Cache cleared (if a row existed).'
  } finally {
    clearHcLoading.value = false
  }
}

async function startRun() {
  startLoading.value = true
  startError.value = null
  try {
    const { data, error } = await jobProcessorAdminAPI.createRun({ ...form })
    if (error) {
      startError.value = error.message
      return
    }
    if (!data) return
    monitorRunId.value = data.run_id
    await refreshStatus()
    restartPollingIfNeeded()
  } finally {
    startLoading.value = false
  }
}

async function refreshStatus() {
  const id = monitorRunId.value.trim()
  if (!id) {
    statusError.value = 'Enter a run ID'
    return
  }
  statusLoading.value = true
  statusError.value = null
  try {
    const { data, error } = await jobProcessorAdminAPI.getRun(id)
    if (error) {
      runStatus.value = null
      statusError.value = error.message
      return
    }
    runStatus.value = data
    if (data && (data.status === 'completed' || data.status === 'failed')) {
      stopPolling()
    } else if (autoPoll.value) {
      restartPollingIfNeeded()
    }
  } finally {
    statusLoading.value = false
  }
}

function restartPollingIfNeeded() {
  stopPolling()
  if (!autoPoll.value) return
  const id = monitorRunId.value.trim()
  if (!id) return
  pollTimer = setInterval(() => {
    void refreshStatus()
  }, 3000)
}

watch(autoPoll, () => {
  restartPollingIfNeeded()
})

onMounted(async () => {
  try {
    const ok = await profileAPI.hasRole('super_admin')
    if (!ok) {
      pageError.value = 'You do not have access to this page.'
    }
  } catch (e) {
    pageError.value = e instanceof Error ? e.message : 'Could not verify permissions.'
  }
  await loadHealth()
  restartPollingIfNeeded()
})

onUnmounted(() => {
  stopPolling()
})
</script>
