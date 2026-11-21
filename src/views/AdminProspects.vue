<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Prospect Review
      </h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Job seekers found in public posts, classified by intent. Approve the ones worth contacting.
        Keys on the focused row: <kbd class="kbd">a</kbd> approve, <kbd class="kbd">r</kbd> reject,
        <kbd class="kbd">d</kbd> do not contact, <kbd class="kbd">j</kbd>/<kbd class="kbd">k</kbd> next / previous.
      </p>
    </header>

    <dl class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <div
        v-for="tile in statTiles"
        :key="tile.label"
        class="rounded-2xl border border-neutral-border bg-white shadow-sm px-5 py-4"
      >
        <dt class="text-xs font-medium text-neutral-muted">
          {{ tile.label }}
        </dt>
        <dd class="text-2xl font-heading font-semibold text-brand-charcoal tabular-nums">
          {{ tile.value }}
        </dd>
      </div>
    </dl>

    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div class="w-full sm:w-40">
          <label for="status-filter" class="block text-sm font-medium text-brand-charcoal mb-1">Status</label>
          <select id="status-filter" v-model="statusFilter" class="filter-input" @change="reload">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div class="w-full sm:w-52">
          <label for="segment-filter" class="block text-sm font-medium text-brand-charcoal mb-1">Segment</label>
          <select id="segment-filter" v-model="segmentFilter" class="filter-input" @change="reload">
            <option value="">All</option>
            <option v-for="s in PROSPECT_SEGMENTS" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="w-full sm:w-32">
          <label for="score-filter" class="block text-sm font-medium text-brand-charcoal mb-1">Min score</label>
          <input
            id="score-filter"
            v-model.number="minScore"
            type="number"
            min="0"
            max="100"
            class="filter-input"
            placeholder="0"
            @change="reload"
          >
        </div>
        <div class="w-full sm:w-36">
          <label for="email-filter" class="block text-sm font-medium text-brand-charcoal mb-1">Email</label>
          <select id="email-filter" v-model="emailFilter" class="filter-input" @change="reload">
            <option value="">Any</option>
            <option value="true">Has email</option>
            <option value="false">No email</option>
          </select>
        </div>
        <p class="text-sm text-neutral-body sm:ml-auto">
          {{ total.toLocaleString() }} matching · showing {{ rangeLabel }}
        </p>
      </div>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
      <p v-if="loading && prospects.length === 0" class="text-sm text-neutral-body">
        <font-awesome-icon :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />Loading…
      </p>
      <p v-else-if="!loading && prospects.length === 0" class="text-sm text-neutral-body">No prospects match these filters.</p>

      <ol class="divide-y divide-neutral-border -mx-6">
        <li
          v-for="(p, i) in prospects"
          :key="p.id"
          :ref="(el) => setRowRef(el, i)"
          tabindex="0"
          :class="[
            'px-6 py-4 outline-none cursor-pointer transition-colors',
            i === focused ? 'bg-brand-primary/5 ring-2 ring-inset ring-brand-primary' : 'hover:bg-neutral-bg',
            p.review_status !== 'pending' ? 'opacity-60' : '',
          ]"
          @click="focusRow(i)"
          @focus="focused = i"
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div class="w-14 shrink-0">
              <span class="text-2xl font-heading font-semibold tabular-nums" :class="scoreClass(p.intent_score)">
                {{ p.intent_score ?? '–' }}
              </span>
            </div>

            <div class="min-w-0 flex-1 space-y-1.5">
              <p class="text-sm text-brand-charcoal">{{ p.intent_reason ?? 'Not classified yet.' }}</p>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-body">
                <span><span class="text-neutral-muted">Title</span> {{ p.target_job_title ?? '–' }}</span>
                <span><span class="text-neutral-muted">Level</span> {{ p.career_level ?? '–' }}</span>
                <span><span class="text-neutral-muted">Years</span> {{ p.years_of_experience ?? '–' }}</span>
                <span><span class="text-neutral-muted">Email</span> {{ p.email_masked ?? 'none' }}</span>
                <span v-if="p.ineligible_reason"><span class="text-neutral-muted">Send</span> {{ p.ineligible_reason }}</span>
                <a
                  v-if="p.evidence"
                  :href="p.evidence.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-brand-primary hover:underline"
                  @click.stop
                >
                  Post <font-awesome-icon :icon="['fas', 'arrow-up-right-from-square']" class="text-[10px]" aria-hidden="true" />
                </a>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="s in p.segments ?? []"
                  :key="s"
                  class="rounded-full bg-neutral-bg border border-neutral-border px-2 py-0.5 text-[11px] text-neutral-body"
                >{{ s }}</span>
                <span
                  v-if="p.review_status !== 'pending'"
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="p.review_status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'"
                >{{ p.do_not_contact ? 'do not contact' : p.review_status }}</span>
              </div>
              <button
                v-if="p.evidence?.snippet"
                type="button"
                class="text-xs text-neutral-muted hover:text-brand-charcoal"
                @click.stop="toggleSnippet(p.id)"
              >
                <font-awesome-icon
                  :icon="['fas', 'chevron-down']"
                  :class="['mr-1 transition-transform', expanded.has(p.id) ? 'rotate-180' : '']"
                  aria-hidden="true"
                />{{ expanded.has(p.id) ? 'Hide post' : 'Show post' }}
              </button>
              <p v-if="expanded.has(p.id)" class="text-xs text-neutral-body whitespace-pre-line bg-neutral-bg rounded-lg p-3">
                {{ p.evidence?.snippet }}
              </p>

              <div v-if="i === focused" class="flex flex-wrap items-end gap-3 pt-1" @click.stop>
                <label class="text-xs text-neutral-muted">
                  Correct title
                  <input
                    v-model="draftTitle"
                    type="text"
                    class="filter-input mt-1 w-56"
                    :placeholder="p.target_job_title ?? 'e.g. Software Engineer'"
                    @keydown.stop
                  >
                </label>
                <label class="text-xs text-neutral-muted">
                  Correct level
                  <select v-model="draftLevel" class="filter-input mt-1 w-48" @keydown.stop>
                    <option value="">(keep {{ p.career_level ?? 'none' }})</option>
                    <option v-for="l in PROSPECT_CAREER_LEVELS" :key="l" :value="l">{{ l }}</option>
                  </select>
                </label>
              </div>
            </div>

            <div class="flex shrink-0 gap-2" @click.stop>
              <button type="button" class="action-btn border-green-200 text-green-700 hover:bg-green-50" :disabled="busy" title="Approve (a)" @click="review(i, 'approve')">
                <font-awesome-icon :icon="['fas', 'check']" aria-hidden="true" /> Approve
              </button>
              <button type="button" class="action-btn border-neutral-border text-neutral-body hover:bg-neutral-bg" :disabled="busy" title="Reject (r)" @click="review(i, 'reject')">
                <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" /> Reject
              </button>
              <button type="button" class="action-btn border-red-200 text-red-700 hover:bg-red-50" :disabled="busy" title="Do not contact (d)" @click="review(i, 'do_not_contact')">
                <font-awesome-icon :icon="['fas', 'user-minus']" aria-hidden="true" /> Do not contact
              </button>
            </div>
          </div>
        </li>
      </ol>

      <div class="flex items-center justify-between pt-2">
        <button type="button" class="btn-secondary text-sm" :disabled="offset === 0 || loading" @click="page(-1)">Previous</button>
        <button type="button" class="btn-secondary text-sm" :disabled="offset + PAGE_SIZE >= total || loading" @click="page(1)">Next</button>
      </div>
    </section>

    <div class="mt-8">
      <router-link
        to="/admin/dashboard"
        class="inline-flex items-center justify-center rounded-lg border border-neutral-border px-4 py-2 text-sm font-medium text-brand-charcoal hover:bg-neutral-bg"
      >
        Back to admin
      </router-link>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  PROSPECT_CAREER_LEVELS,
  PROSPECT_SEGMENTS,
  adminProspectsAPI,
  type AdminProspectRow,
  type ProspectCareerLevel,
  type ProspectReviewAction,
  type ProspectReviewStats,
  type ProspectReviewStatus,
} from '@/lib/adminProspects'

const PAGE_SIZE = 50

const prospects = ref<AdminProspectRow[]>([])
const total = ref(0)
const stats = ref<ProspectReviewStats>({ pending: 0, approved: 0, rejected: 0, reviewed_today: 0 })
const loading = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const offset = ref(0)
const focused = ref(0)
const expanded = ref(new Set<string>())
const rowEls: HTMLElement[] = []

const statusFilter = ref<ProspectReviewStatus | ''>('pending')
const segmentFilter = ref('')
const minScore = ref<number | ''>('')
const emailFilter = ref<'' | 'true' | 'false'>('')
const draftTitle = ref('')
const draftLevel = ref<ProspectCareerLevel | ''>('')

const statTiles = computed(() => [
  { label: 'Pending', value: stats.value.pending },
  { label: 'Approved', value: stats.value.approved },
  { label: 'Rejected', value: stats.value.rejected },
  { label: 'Reviewed today', value: stats.value.reviewed_today },
])
const rangeLabel = computed(() =>
  prospects.value.length ? `${offset.value + 1}-${offset.value + prospects.value.length}` : '0',
)

function setRowRef(el: unknown, i: number) {
  if (el instanceof HTMLElement) rowEls[i] = el
}

function scoreClass(score: number | null) {
  if (score == null) return 'text-neutral-muted'
  if (score >= 80) return 'text-green-700'
  if (score >= 60) return 'text-brand-charcoal'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-600'
}

function resetDrafts() {
  draftTitle.value = ''
  draftLevel.value = ''
}

function focusRow(i: number) {
  if (i < 0 || i >= prospects.value.length) return
  if (i !== focused.value) resetDrafts()
  focused.value = i
  void nextTick(() => {
    rowEls[i]?.focus({ preventScroll: true })
    rowEls[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function toggleSnippet(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

async function load() {
  loading.value = true
  error.value = null
  const { data, error: err } = await adminProspectsAPI.list({
    reviewStatus: statusFilter.value,
    segment: segmentFilter.value,
    minScore: minScore.value === '' ? null : minScore.value,
    hasEmail: emailFilter.value === '' ? null : emailFilter.value === 'true',
    limit: PAGE_SIZE,
    offset: offset.value,
  })
  loading.value = false
  if (err || !data) {
    error.value = err?.message ?? 'Failed to load prospects'
    return
  }
  prospects.value = data.prospects
  total.value = data.total
  stats.value = data.stats
  rowEls.length = 0
  focusRow(0)
}

function reload() {
  offset.value = 0
  void load()
}

function page(direction: 1 | -1) {
  offset.value = Math.max(0, offset.value + direction * PAGE_SIZE)
  void load()
}

async function review(i: number, action: ProspectReviewAction) {
  const p = prospects.value[i]
  if (!p || busy.value) return
  busy.value = true
  error.value = null
  const corrections: { targetJobTitle?: string; careerLevel?: ProspectCareerLevel } = {}
  if (draftTitle.value.trim()) corrections.targetJobTitle = draftTitle.value.trim()
  if (draftLevel.value) corrections.careerLevel = draftLevel.value
  const { data, error: err } = await adminProspectsAPI.review(p.id, action, corrections)
  busy.value = false
  if (err || !data) {
    error.value = err?.message ?? 'Review failed'
    return
  }
  // Stats: move one count from the old status to the new one (no reload, so the list keeps its place).
  const before = p.review_status
  const after = data.review_status
  if (before !== after) {
    stats.value = { ...stats.value, [before]: stats.value[before] - 1, [after]: stats.value[after] + 1 }
  }
  if (!p.reviewed_at || new Date(p.reviewed_at).toDateString() !== new Date().toDateString()) {
    stats.value = { ...stats.value, reviewed_today: stats.value.reviewed_today + 1 }
  }
  prospects.value[i] = { ...p, ...data, evidence: p.evidence, ineligible_reason: p.ineligible_reason }
  focusRow(Math.min(i + 1, prospects.value.length - 1))
}

function onKeydown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (!prospects.value.length) return
  const keys: Record<string, () => void> = {
    j: () => focusRow(focused.value + 1),
    k: () => focusRow(focused.value - 1),
    a: () => void review(focused.value, 'approve'),
    r: () => void review(focused.value, 'reject'),
    d: () => void review(focused.value, 'do_not_contact'),
  }
  const run = keys[e.key]
  if (run) {
    e.preventDefault()
    run()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void load()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.filter-input {
  @apply w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary;
}
.action-btn {
  @apply inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50;
}
.kbd {
  @apply rounded border border-neutral-border bg-neutral-bg px-1 font-mono text-[11px];
}
</style>
