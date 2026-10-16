<template>
  <div class="space-y-6">
    <!-- Period + page actions -->
    <div v-if="!summaryOnly" class="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <label for="partner-period" class="font-medium text-brand-charcoal">Showing activity for</label>
        <select id="partner-period" v-model="period" class="pa-pill">
          <option v-for="(label, key) in PERIOD_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
        <input
          v-if="period === 'custom'"
          v-model="customSince"
          type="date"
          :max="today"
          class="pa-pill"
          aria-label="Period start date"
        />
        <font-awesome-icon v-if="loading" :icon="['fas', 'spinner']" spin class="text-neutral-muted" aria-label="Updating" />
      </div>
      <slot name="actions" />
    </div>

    <!-- KPIs -->
    <dl class="grid grid-cols-2 lg:grid-cols-5 print:grid-cols-5 gap-4">
      <div v-for="k in kpis" :key="k.label" class="pa-card !p-5 flex flex-col">
        <dt class="flex items-center gap-2.5 text-xs font-medium text-neutral-muted mb-3">
          <span class="pa-chip !w-8 !h-8 text-xs"><font-awesome-icon :icon="['fas', k.icon]" aria-hidden="true" /></span>
          {{ k.label }}
        </dt>
        <dd class="text-3xl font-heading font-bold text-brand-charcoal tabular-nums leading-none">{{ k.value }}</dd>
        <div v-if="k.meter !== undefined" class="h-1.5 rounded-full bg-brand-primary/10 mt-3 overflow-hidden">
          <div class="h-full rounded-full bg-brand-primary" :style="{ width: barWidth(k.meter, 1) }" />
        </div>
        <p class="text-[11px] text-neutral-muted mt-2 leading-snug">{{ k.hint }}</p>
      </div>
    </dl>

    <div v-if="roster.length === 0" class="pa-card text-center py-12">
      <span class="pa-chip !w-14 !h-14 text-xl mx-auto mb-4"><font-awesome-icon :icon="['fas', 'graduation-cap']" aria-hidden="true" /></span>
      <h3 class="font-heading font-semibold text-lg text-brand-charcoal mb-1">No students yet</h3>
      <p class="text-sm text-neutral-body max-w-md mx-auto">
        Once students sign up with their university email, their progress shows up here automatically.
      </p>
    </div>

    <template v-else>
      <div class="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
        <!-- Funnel -->
        <section class="pa-card">
          <header class="pa-head">
            <span class="pa-chip"><font-awesome-icon :icon="['fas', 'compass']" aria-hidden="true" /></span>
            <div>
              <h3 class="pa-title">Student journey</h3>
              <p class="pa-caption">
                Share of students who reached each step. Matches, applications and interviews: {{ periodLabel.toLowerCase() }}.
              </p>
            </div>
          </header>
          <ol class="space-y-4">
            <li v-for="(step, i) in funnel" :key="step.label">
              <div class="flex items-center justify-between gap-3 text-sm mb-1.5">
                <span class="flex items-center gap-2.5 text-neutral-body">
                  <span class="w-5 h-5 rounded-full bg-[#fff7ed] border border-[#ffd9b3] text-[10px] font-semibold text-[#c2410c] flex items-center justify-center">{{ i + 1 }}</span>
                  {{ step.label }}
                </span>
                <span class="tabular-nums whitespace-nowrap">
                  <span class="font-semibold text-brand-charcoal">{{ step.count }}</span>
                  <span class="text-neutral-muted ml-1.5 text-xs">{{ pct(step.count, roster.length) }}</span>
                </span>
              </div>
              <div class="h-2.5 rounded-full bg-brand-primary/10 overflow-hidden">
                <div class="h-full rounded-full bg-brand-primary" :style="{ width: barWidth(step.count, roster.length) }" />
              </div>
            </li>
          </ol>
        </section>

        <!-- Top employers -->
        <section class="pa-card">
          <header class="pa-head">
            <span class="pa-chip"><font-awesome-icon :icon="['fas', 'building']" aria-hidden="true" /></span>
            <div>
              <h3 class="pa-title">Where students are applying</h3>
              <p class="pa-caption">Top employers by applications across all students, {{ periodLabel.toLowerCase() }}.</p>
            </div>
          </header>
          <p v-if="insights.topEmployers.length === 0" class="text-sm text-neutral-body">No applications tracked yet.</p>
          <ul v-else class="space-y-4">
            <li v-for="e in insights.topEmployers" :key="e.company">
              <div class="flex items-center justify-between gap-3 text-sm mb-1.5">
                <span class="text-neutral-body truncate">{{ e.company }}</span>
                <span class="tabular-nums whitespace-nowrap">
                  <span class="font-semibold text-brand-charcoal">{{ e.applications }}</span>
                  <span class="text-neutral-muted ml-1.5 text-xs">{{ e.students }} {{ e.students === 1 ? 'student' : 'students' }}</span>
                </span>
              </div>
              <div class="h-2.5 rounded-full bg-brand-primary/10 overflow-hidden">
                <div class="h-full rounded-full bg-brand-primary" :style="{ width: barWidth(e.applications, insights.topEmployers[0].applications) }" />
              </div>
            </li>
          </ul>
        </section>
      </div>

      <!-- Weekly trends: two single-series charts, never one dual-axis chart -->
      <section class="pa-card">
        <header class="pa-head">
          <span class="pa-chip"><font-awesome-icon :icon="['fas', 'chart-line']" aria-hidden="true" /></span>
          <div>
            <h3 class="pa-title">Weekly activity</h3>
            <p class="pa-caption">{{ periodLabel }}, by week. Hover a bar for details.</p>
          </div>
        </header>
        <div class="grid gap-8 md:grid-cols-2 print:grid-cols-2">
          <div v-for="series in weeklySeries" :key="series.key">
            <p class="text-sm text-neutral-body mb-3">
              {{ series.title }}
              <span class="font-heading font-bold text-xl text-brand-charcoal tabular-nums ml-1.5">{{ series.total }}</span>
            </p>
            <div class="flex items-end gap-1 h-36 border-b border-neutral-border">
              <div
                v-for="w in insights.weekly"
                :key="w.week"
                class="group relative flex-1 h-full flex items-end"
                tabindex="0"
                :aria-label="`Week of ${shortDate(w.week)}: ${w[series.key]} ${series.unit}`"
              >
                <div
                  class="w-full rounded-t-md bg-brand-primary transition-opacity group-hover:opacity-80 group-focus:opacity-80"
                  :style="{ height: barWidth(w[series.key], series.max) }"
                />
                <div
                  class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block group-focus:block whitespace-nowrap rounded-lg bg-brand-charcoal px-2.5 py-1.5 text-xs text-white shadow-lg z-10"
                >
                  Week of {{ shortDate(w.week) }} · <strong>{{ w[series.key] }}</strong> {{ series.unit }}
                </div>
              </div>
            </div>
            <div class="flex justify-between text-[11px] text-neutral-muted mt-1.5">
              <span>{{ shortDate(insights.weekly[0]?.week) }}</span>
              <span>This week</span>
            </div>
          </div>
        </div>
      </section>

      <!-- International students -->
      <section v-if="sponsorshipStudents.length > 0" class="pa-card">
        <header class="pa-head">
          <span class="pa-chip"><font-awesome-icon :icon="['fas', 'globe-americas']" aria-hidden="true" /></span>
          <div>
            <h3 class="pa-title">International students</h3>
            <p class="pa-caption">Students who told us they need visa sponsorship.</p>
          </div>
        </header>
        <div class="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div class="rounded-xl bg-[#fff7ed] px-5 py-4">
            <p class="text-3xl font-heading font-bold text-brand-charcoal tabular-nums">{{ sponsorshipStudents.length }}</p>
            <p class="text-sm text-neutral-body mt-1">{{ sponsorshipStudents.length === 1 ? 'student needs' : 'students need' }} visa sponsorship</p>
          </div>
          <div v-if="sponsorshipMatchTotal > 0" class="rounded-xl bg-[#fff7ed] px-5 py-4">
            <p class="text-3xl font-heading font-bold text-brand-charcoal tabular-nums">{{ pct(sponsorshipSponsorMatches, sponsorshipMatchTotal) }}</p>
            <p class="text-sm text-neutral-body mt-1">
              of their matches ({{ periodLabel.toLowerCase() }}) are with employers that have a medium or high record of sponsoring visas
            </p>
          </div>
        </div>
      </section>

      <!-- Roster (never in the shareable summary report: no student names leave the portal) -->
      <section v-if="!summaryOnly" class="pa-card">
        <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
          <header class="pa-head !mb-0">
            <span class="pa-chip"><font-awesome-icon :icon="['fas', 'users']" aria-hidden="true" /></span>
            <div>
              <h3 class="pa-title">Students</h3>
              <p class="pa-caption">
                Engagement only. Individual job searches and applications stay private to each student.
                Activity counts: {{ periodLabel.toLowerCase() }}.
              </p>
            </div>
          </header>
          <div class="flex flex-wrap items-center gap-2">
            <label class="relative">
              <span class="sr-only">Search students</span>
              <font-awesome-icon
                :icon="['fas', 'magnifying-glass']"
                class="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-muted text-xs"
                aria-hidden="true"
              />
              <input v-model="search" type="search" placeholder="Search name or email" class="pa-pill !pl-9 w-56" />
            </label>
            <label>
              <span class="sr-only">Filter by status</span>
              <select v-model="statusFilter" class="pa-pill">
                <option value="all">All ({{ roster.length }})</option>
                <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">
                  {{ label }} ({{ statusCounts[key] }})
                </option>
              </select>
            </label>
            <button type="button" class="btn-secondary !py-2 !px-4 text-sm !rounded-full" @click="exportCsv">
              <font-awesome-icon :icon="['fas', 'download']" class="mr-1.5" aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>

        <!-- relative: keeps the absolutely-positioned sr-only header inside the scroll clip -->
        <div class="relative overflow-x-auto -mx-6">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11px] uppercase tracking-wide text-neutral-muted bg-[#fff7ed]/70">
                <th class="font-semibold px-6 py-2.5">Student</th>
                <th class="font-semibold px-3 py-2.5">Status</th>
                <th class="font-semibold px-3 py-2.5">Joined</th>
                <th class="font-semibold px-3 py-2.5">Last active</th>
                <th class="font-semibold px-3 py-2.5 text-right">Matches</th>
                <th class="font-semibold px-3 py-2.5 text-right">Applied</th>
                <th class="font-semibold px-3 py-2.5 text-right">Interviewing</th>
                <th class="font-semibold px-3 py-2.5 text-right">Mock interviews</th>
                <th v-if="canRelease" class="px-6 py-2.5"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in visibleRoster"
                :key="s.profileId"
                class="border-b border-neutral-border/70 last:border-0 hover:bg-[#fff7ed]/40 transition-colors"
              >
                <td class="px-6 py-3">
                  <div class="flex items-center gap-3">
                    <span class="w-8 h-8 shrink-0 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold flex items-center justify-center" aria-hidden="true">
                      {{ initials(s) }}
                    </span>
                    <div class="min-w-0">
                      <div class="font-medium text-brand-charcoal truncate">{{ s.name || '—' }}</div>
                      <div class="text-xs text-neutral-muted truncate">{{ s.email }}</div>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-3 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" :class="STATUS_PILL[statusOf(s)]">
                    <span class="h-1.5 w-1.5 rounded-full" :class="STATUS_DOT[statusOf(s)]" aria-hidden="true" />
                    {{ STATUS_LABELS[statusOf(s)] }}
                  </span>
                  <span v-if="mixedSeats" class="block text-[11px] text-neutral-muted mt-0.5">{{ s.seatSource }} seat</span>
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-neutral-body">{{ shortDate(s.claimedAt) }}</td>
                <td class="px-3 py-3 whitespace-nowrap text-neutral-body">{{ s.lastActiveAt ? relative(s.lastActiveAt) : 'Never' }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s.matches }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s.applications }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s.interviewing }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s.practiceSessions }}</td>
                <td v-if="canRelease" class="px-6 py-3 text-right whitespace-nowrap">
                  <template v-if="confirmingRelease === s.profileId">
                    <button
                      type="button"
                      class="text-xs font-medium text-red-600 hover:underline mr-3"
                      :disabled="releasing"
                      @click="$emit('release', s.profileId)"
                    >
                      <font-awesome-icon v-if="releasing" :icon="['fas', 'spinner']" spin class="mr-1" />
                      Confirm release
                    </button>
                    <button type="button" class="text-xs text-neutral-muted hover:underline" @click="confirmingRelease = null">
                      Cancel
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="text-xs text-neutral-muted hover:text-red-600 hover:underline"
                    @click="confirmingRelease = s.profileId"
                  >
                    Release seat
                  </button>
                </td>
              </tr>
              <tr v-if="filteredRoster.length === 0">
                <td colspan="9" class="px-6 py-8 text-center text-sm text-neutral-muted">No students match.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="filteredRoster.length > visibleRoster.length" class="text-center mt-5">
          <button type="button" class="btn-secondary !py-2 !px-5 text-sm !rounded-full" @click="pageSize += PAGE">
            Show more ({{ filteredRoster.length - visibleRoster.length }} remaining)
          </button>
        </div>
        <p v-if="canRelease" class="text-xs text-neutral-muted mt-5">
          Releasing a seat (e.g. a graduated student) returns it to your pool. That student keeps their
          account but loses university-provided access and won't be re-added automatically.
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PERIOD_LABELS, type PartnerInsights, type PartnerRosterRow, type PeriodKey } from '@/lib/partnerPortal'

const props = defineProps<{
  insights: PartnerInsights
  seatsUsed: number
  seatTotal: number
  canRelease?: boolean
  releasing?: boolean
  /** Used for the CSV filename. */
  organizationName: string
  /** Human label of the active period, e.g. "Last 30 days". */
  periodLabel: string
  /** Shareable report mode: aggregates only, no period controls, no student roster. */
  summaryOnly?: boolean
  loading?: boolean
}>()
const period = defineModel<PeriodKey>('period', { default: 'academic_year' })
const customSince = defineModel<string>('customSince', { default: '' })
const today = new Date().toISOString().slice(0, 10)
defineEmits<{ release: [profileId: string] }>()

const ACTIVE_DAYS = 30
const STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive 30d+',
  not_started: 'Not set up',
} as const
type Status = keyof typeof STATUS_LABELS
const STATUS_DOT: Record<Status, string> = {
  active: 'bg-brand-success',
  inactive: 'bg-amber-500',
  not_started: 'bg-neutral-muted',
}
const STATUS_PILL: Record<Status, string> = {
  active: 'bg-green-50 text-green-800',
  inactive: 'bg-amber-50 text-amber-800',
  not_started: 'bg-neutral-bg text-neutral-body',
}

const roster = computed(() => props.insights.roster)
const activeCutoff = Date.now() - ACTIVE_DAYS * 86_400_000

function statusOf(s: PartnerRosterRow): Status {
  if (!s.onboarded) return 'not_started'
  return s.lastActiveAt && new Date(s.lastActiveAt).getTime() >= activeCutoff ? 'active' : 'inactive'
}

const activeCount = computed(() =>
  roster.value.filter((s) => s.lastActiveAt && new Date(s.lastActiveAt).getTime() >= activeCutoff).length,
)
const totalApplications = computed(() => roster.value.reduce((n, s) => n + s.applications, 0))
const totalPractice = computed(() => roster.value.reduce((n, s) => n + s.practiceSessions, 0))

const funnel = computed(() => {
  const r = roster.value
  return [
    { label: 'Claimed a seat', count: r.length },
    { label: 'Completed profile', count: r.filter((s) => s.onboarded).length },
    { label: 'Uploaded a resume', count: r.filter((s) => s.hasResume).length },
    { label: 'Received job matches', count: r.filter((s) => s.matches > 0).length },
    { label: 'Applied to a job', count: r.filter((s) => s.applications > 0).length },
    { label: 'Reached an interview', count: r.filter((s) => s.interviewing > 0).length },
  ]
})

const weeklySeries = computed(() => {
  const w = props.insights.weekly
  const mk = (key: 'joined' | 'applications', title: string, unit: string) => ({
    key,
    title,
    unit,
    total: w.reduce((n, x) => n + x[key], 0),
    max: Math.max(1, ...w.map((x) => x[key])),
  })
  return [
    mk('joined', 'Students joined', 'joined'),
    mk('applications', 'Applications submitted', 'applications'),
  ]
})

const kpis = computed(() => [
  {
    label: 'Seats in use',
    icon: 'users',
    value: props.seatTotal ? `${props.seatsUsed} / ${props.seatTotal}` : String(props.seatsUsed),
    meter: props.seatTotal ? props.seatsUsed / props.seatTotal : undefined,
    hint: `+${props.insights.joinedInPeriod} joined, ${props.periodLabel.toLowerCase()}`,
  },
  {
    label: 'Activated',
    icon: 'circle-check',
    value: pct(funnel.value[2].count, roster.value.length),
    hint: `${funnel.value[2].count} uploaded a resume`,
  },
  {
    label: 'Active, last 30 days',
    icon: 'chart-line',
    value: pct(activeCount.value, roster.value.length),
    hint: `${activeCount.value} of ${roster.value.length} students`,
  },
  {
    label: 'Applications',
    icon: 'paper-plane',
    value: String(totalApplications.value),
    hint: `${props.periodLabel} · ${funnel.value[4].count} students`,
  },
  {
    label: 'Reached interviews',
    icon: 'briefcase',
    value: String(funnel.value[5].count),
    hint: `${props.periodLabel} · ${totalPractice.value} mock interviews`,
  },
])

function initials(s: PartnerRosterRow): string {
  const source = s.name || s.email
  return source
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

const sponsorshipStudents = computed(() => roster.value.filter((s) => s.needsSponsorship))
const sponsorshipMatchTotal = computed(() => sponsorshipStudents.value.reduce((n, s) => n + s.matches, 0))
const sponsorshipSponsorMatches = computed(() =>
  sponsorshipStudents.value.reduce((n, s) => n + s.sponsorMatches, 0),
)

const search = ref('')
const statusFilter = ref<Status | 'all'>('all')
const statusCounts = computed(() => {
  const c: Record<Status, number> = { active: 0, inactive: 0, not_started: 0 }
  for (const s of roster.value) c[statusOf(s)] += 1
  return c
})
const filteredRoster = computed(() => {
  const q = search.value.trim().toLowerCase()
  return roster.value.filter(
    (s) =>
      (statusFilter.value === 'all' || statusOf(s) === statusFilter.value) &&
      (!q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)),
  )
})

const PAGE = 25
const pageSize = ref(PAGE)
watch([search, statusFilter], () => (pageSize.value = PAGE))
const visibleRoster = computed(() => filteredRoster.value.slice(0, pageSize.value))
// Only label seat type when both kinds exist (mid pilot -> paid transition).
const mixedSeats = computed(() => new Set(roster.value.map((s) => s.seatSource)).size > 1)

const confirmingRelease = ref<string | null>(null)
// Reset the inline confirm once the parent reloads data after a release.
watch(roster, () => (confirmingRelease.value = null))

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : '—'
}
function barWidth(n: number, of: number): string {
  if (of <= 0 || n <= 0) return '0%'
  return `${Math.max((n / of) * 100, 2)}%`
}
function shortDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}
function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return shortDate(iso)
}

function exportCsv() {
  const header = ['Name', 'Email', 'Status', 'Seat', 'Joined', 'Last active', 'Resume', 'Matches', 'Applications', 'Interviewing', 'Mock interviews']
  const rows = filteredRoster.value.map((s) => [
    s.name, s.email, STATUS_LABELS[statusOf(s)], s.seatSource, s.claimedAt.slice(0, 10),
    s.lastActiveAt?.slice(0, 10) ?? '', s.hasResume ? 'yes' : 'no', s.matches, s.applications,
    s.interviewing, s.practiceSessions,
  ])
  const csv = [header, ...rows]
    // Names are user-entered: prefix formula-leading characters so Excel won't execute them.
    .map((r) => r.map((v) => `"${String(v).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.organizationName.replace(/[^\w]+/g, '-')}-students-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
/* Same card language as the marketing site (Universities/Home): soft white, 2xl corners. */
.pa-card {
  @apply rounded-2xl bg-white border border-neutral-border/80 shadow-sm p-6 break-inside-avoid min-w-0;
}
.pa-head {
  @apply flex items-start gap-3 mb-5;
}
.pa-chip {
  @apply w-10 h-10 shrink-0 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center;
}
.pa-title {
  @apply text-base font-heading font-semibold text-brand-charcoal leading-tight;
}
.pa-caption {
  @apply text-xs text-neutral-muted mt-1 leading-relaxed;
}
.pa-pill {
  @apply rounded-full border border-neutral-border bg-white px-4 py-2 text-sm text-brand-charcoal shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40;
}
</style>
