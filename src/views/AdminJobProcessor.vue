<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Job processor
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Start and monitor FastAPI pipeline runs (claims <code class="text-xs bg-neutral-bg px-1 rounded">scraper_raw_jobs</code>,
        enrich, promote to <code class="text-xs bg-neutral-bg px-1 rounded">job_hopper_live</code>). Many jobs can run at once; separate caps limit in-flight LLM, Apollo, Brave, and HTTP fetches across those jobs. Super admin only; API keys stay on the server.
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
          :title="healthTooltips.check"
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
    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 mb-6 space-y-5">
      <div>
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Run options
        </h2>
        <p class="text-xs text-neutral-muted mt-1 max-w-2xl">
          Tune how much work to pull from the queue and how much parallelism to use. Raising
          <span class="font-mono text-[11px]">max_concurrent_jobs</span>
          lets more rows process at once; the other max-concurrent fields cap shared resources so you stay within API limits.
        </p>
      </div>

      <div>
        <h3 class="text-sm font-semibold text-brand-charcoal mb-2">
          Run size
        </h3>
        <div class="grid gap-4 sm:grid-cols-2">
          <label
            v-for="field in runSizeFields"
            :key="field.param"
            class="block text-sm"
            :title="field.tooltip"
          >
            <span class="flex items-start gap-1.5 font-medium text-brand-charcoal">
              <span>{{ field.label }}</span>
              <span class="font-mono text-[11px] font-normal text-neutral-muted leading-5">{{ field.param }}</span>
              <font-awesome-icon
                :icon="['fas', 'circle-info']"
                class="text-neutral-muted text-xs cursor-help shrink-0 mt-0.5"
                :title="field.tooltip"
                aria-hidden="true"
              />
            </span>
            <input
              v-model.number="form[field.key]"
              type="number"
              :min="field.min"
              :max="field.max"
              class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
              :title="field.tooltip"
            >
          </label>
        </div>
      </div>

      <div>
        <h3 class="text-sm font-semibold text-brand-charcoal mb-1">
          Parallelism
        </h3>
        <p class="text-xs text-neutral-muted mb-2">
          Jobs run concurrently up to the job cap; each limit below applies across all in-flight jobs together.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <label
            v-for="field in parallelismFields"
            :key="field.param"
            class="block text-sm"
            :title="field.tooltip"
          >
            <span class="flex items-start gap-1.5 font-medium text-brand-charcoal">
              <span>{{ field.label }}</span>
              <span class="font-mono text-[11px] font-normal text-neutral-muted leading-5">{{ field.param }}</span>
              <font-awesome-icon
                :icon="['fas', 'circle-info']"
                class="text-neutral-muted text-xs cursor-help shrink-0 mt-0.5"
                :title="field.tooltip"
                aria-hidden="true"
              />
            </span>
            <input
              v-model.number="form[field.key]"
              type="number"
              :min="field.min"
              :max="field.max"
              class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm"
              :title="field.tooltip"
            >
          </label>
        </div>
      </div>

      <div>
        <h3 class="text-sm font-semibold text-brand-charcoal mb-2">
          Flags
        </h3>
        <div class="flex flex-col gap-3 text-sm">
          <label
            v-for="item in runFlagFields"
            :key="item.param"
            class="flex items-start gap-2 cursor-pointer rounded-lg border border-transparent hover:border-neutral-border/80 px-1 py-0.5 -mx-1"
            :title="item.tooltip"
          >
            <input
              v-model="form[item.key]"
              type="checkbox"
              class="rounded border-neutral-border mt-0.5 shrink-0"
              :title="item.tooltip"
            >
            <span class="flex flex-col gap-0.5">
              <span class="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                <span class="font-medium text-brand-charcoal">{{ item.label }}</span>
                <span class="font-mono text-[11px] text-neutral-muted">{{ item.param }}</span>
                <font-awesome-icon
                  :icon="['fas', 'circle-info']"
                  class="text-neutral-muted text-xs cursor-help shrink-0"
                  :title="item.tooltip"
                  aria-hidden="true"
                />
              </span>
              <span class="text-xs text-neutral-muted">{{ item.hint }}</span>
            </span>
          </label>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="startLoading"
          :title="startRunTooltip"
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

    <!-- Monitor -->
    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
        Monitor run
      </h2>
      <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
        <label
          class="block text-sm flex-1"
          :title="monitorTooltips.runId"
        >
          <span class="flex items-center gap-1.5 font-medium text-brand-charcoal">
            <span>Run ID</span>
            <font-awesome-icon
              :icon="['fas', 'circle-info']"
              class="text-neutral-muted text-xs cursor-help"
              :title="monitorTooltips.runId"
              aria-hidden="true"
            />
          </span>
          <input
            v-model="monitorRunId"
            type="text"
            class="mt-1 w-full rounded-lg border border-neutral-border px-3 py-2 text-sm font-mono"
            placeholder="uuid"
            :title="monitorTooltips.runId"
          >
          <span class="mt-1 block text-xs text-neutral-muted">Paste the UUID from Start run or another source. Refresh loads the latest status.</span>
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="statusLoading || !monitorRunId.trim()"
            :title="monitorTooltips.refresh"
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
          <label
            class="inline-flex items-start gap-2 text-sm cursor-pointer self-center max-w-xs"
            :title="monitorTooltips.autoPoll"
          >
            <input
              v-model="autoPoll"
              type="checkbox"
              class="rounded border-neutral-border mt-0.5 shrink-0"
              :title="monitorTooltips.autoPoll"
            >
            <span class="flex flex-col gap-0.5">
              <span class="flex items-center gap-1.5">
                <span>Auto-refresh every 3s</span>
                <font-awesome-icon
                  :icon="['fas', 'circle-info']"
                  class="text-neutral-muted text-xs cursor-help shrink-0"
                  :title="monitorTooltips.autoPoll"
                  aria-hidden="true"
                />
              </span>
              <span class="text-xs text-neutral-muted font-normal">Polls until the run completes or fails.</span>
            </span>
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
import {
  DEFAULT_JOB_PROCESSOR_RUN_OPTIONS,
  jobProcessorAdminAPI,
  type JobProcessorRunOptions,
  type JobProcessorRunStatus,
} from '@/lib/job-processor-admin'

type RunNumberFieldKey =
  | 'limit'
  | 'batch_size'
  | 'max_concurrent_jobs'
  | 'max_concurrent_llm'
  | 'max_concurrent_apollo'
  | 'max_concurrent_brave'
  | 'max_concurrent_fetch'

type RunFlagFieldKey =
  | 'skip_domain_resolution'
  | 'skip_apollo'
  | 'skip_enrichment'
  | 'force_clear_apollo_limit'
  | 'dry_run'

interface RunNumberField {
  key: RunNumberFieldKey
  label: string
  param: string
  min: number
  max: number
  tooltip: string
}

interface RunFlagField {
  key: RunFlagFieldKey
  label: string
  param: string
  tooltip: string
  hint: string
}

const runSizeFields: RunNumberField[] = [
  {
    key: 'limit',
    label: 'Limit',
    param: 'limit',
    min: 1,
    max: 5000,
    tooltip:
      'Maximum number of pending scraper rows to claim and process in this run (validated 1–5000 on the server).',
  },
  {
    key: 'batch_size',
    label: 'Batch size',
    param: 'batch_size',
    min: 1,
    max: 500,
    tooltip:
      'How many rows each database claim requests in one call. Smaller values mean more round trips; larger values pull bigger chunks per claim.',
  },
]

const parallelismFields: RunNumberField[] = [
  {
    key: 'max_concurrent_jobs',
    label: 'Max concurrent jobs',
    param: 'max_concurrent_jobs',
    min: 1,
    max: 64,
    tooltip:
      'How many raw jobs are processed at the same time. Increase this so the pipeline can overlap work; LLM, Apollo, Brave, and fetch limits below still apply across all active jobs.',
  },
  {
    key: 'max_concurrent_llm',
    label: 'Max concurrent LLM calls',
    param: 'max_concurrent_llm',
    min: 1,
    max: 64,
    tooltip:
      'Upper bound on simultaneous OpenAI-compatible chat completions across all jobs: filter step, enrichment, and domain-resolution LLM. Stays within model rate limits.',
  },
  {
    key: 'max_concurrent_apollo',
    label: 'Max concurrent Apollo',
    param: 'max_concurrent_apollo',
    min: 1,
    max: 64,
    tooltip:
      'Upper bound on concurrent Apollo organization enrich requests while jobs run in parallel.',
  },
  {
    key: 'max_concurrent_brave',
    label: 'Max concurrent Brave',
    param: 'max_concurrent_brave',
    min: 1,
    max: 32,
    tooltip:
      'Upper bound on concurrent Brave web searches used when resolving a company website domain.',
  },
  {
    key: 'max_concurrent_fetch',
    label: 'Max concurrent page fetches',
    param: 'max_concurrent_fetch',
    min: 1,
    max: 64,
    tooltip:
      'Upper bound on concurrent HTTP page loads when turning Brave search results into text for domain resolution (several URLs may load at once per job).',
  },
]

const runFlagFields: RunFlagField[] = [
  {
    key: 'skip_domain_resolution',
    label: 'Skip domain resolution',
    param: 'skip_domain_resolution',
    tooltip:
      'Skips Brave search, downloading candidate pages, and the domain LLM. Apollo and later steps still run unless you skip them separately.',
    hint: 'No website lookup for the company.',
  },
  {
    key: 'skip_apollo',
    label: 'Skip Apollo',
    param: 'skip_apollo',
    tooltip: 'Skips Apollo organization enrichment so no Apollo API credits are used for company data.',
    hint: 'No Apollo company enrichment.',
  },
  {
    key: 'skip_enrichment',
    label: 'Skip enrichment LLM',
    param: 'skip_enrichment',
    tooltip:
      'Skips the enrichment chat call. Rows that still go to live jobs get placeholder enrichment fields.',
    hint: 'Placeholder briefing and tiers when promoting to live.',
  },
  {
    key: 'force_clear_apollo_limit',
    label: 'Clear Apollo exhausted flag',
    param: 'force_clear_apollo_limit',
    tooltip:
      'Before processing, clears the “Apollo credits exhausted” processor flag so the run attempts Apollo again (unless Skip Apollo is on).',
    hint: 'Retry Apollo after a credit-limit stop.',
  },
  {
    key: 'dry_run',
    label: 'Dry run',
    param: 'dry_run',
    tooltip:
      'Runs the pipeline logic but does not persist changes: no inserts, raw-job status updates, or processor flag updates.',
    hint: 'No database writes.',
  },
]

const healthTooltips = {
  check: 'Calls the job-processor health endpoint and shows the JSON response.',
} as const

const startRunTooltip =
  'Creates a new pipeline run with the options above and opens it in Monitor run.'

const monitorTooltips = {
  runId: 'UUID of the run to inspect. After Start run, this field is filled automatically.',
  refresh: 'Loads the latest status and counts for the run ID above.',
  autoPoll:
    'While enabled, refetches run status every three seconds until the run finishes (completed or failed).',
} as const

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
