<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Replies
      </h1>
      <p class="text-sm text-neutral-body max-w-3xl">
        Inbound replies, classified by classify-replies: institutional leads with the B2B classes, job
        seekers (prospects and signed-up users) with the job-seeker classes. An unsubscribe suppresses the
        sender automatically. Drafts are suggestions to copy, edit and send yourself; nothing here is sent
        automatically.
      </p>
    </header>

    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div class="w-full sm:w-44">
          <label for="view-filter" class="block text-sm font-medium text-brand-charcoal mb-1">Show</label>
          <select id="view-filter" v-model="view" class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white" @change="handleSearch">
            <option value="open">Open actions</option>
            <option value="overdue">Overdue</option>
            <option value="manual_review">Needs manual review</option>
            <option value="all">All replies</option>
          </select>
        </div>
        <div class="w-full sm:max-w-xs">
          <label for="search" class="block text-sm font-medium text-brand-charcoal mb-1">Search by sender email</label>
          <input
            id="search"
            v-model="search"
            type="search"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal placeholder-neutral-muted focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-white"
            placeholder="name@school.edu"
            @keyup.enter="handleSearch"
          >
        </div>
        <div class="w-full sm:w-56">
          <label for="class-filter" class="block text-sm font-medium text-brand-charcoal mb-1">Classification</label>
          <select id="class-filter" v-model="classFilter" class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white" @change="handleSearch">
            <option value="">All</option>
            <optgroup label="Job seekers">
              <option v-for="c in B2C_REPLY_CLASSES" :key="c" :value="c">{{ classLabel(c) }}</option>
            </optgroup>
            <optgroup label="Institutional leads">
              <option v-for="c in B2B_REPLY_CLASSES" :key="c" :value="c">{{ c }}</option>
            </optgroup>
          </select>
        </div>
        <div class="flex items-end gap-3">
          <button type="button" class="btn-primary text-sm" :disabled="loading" @click="handleSearch">
            {{ loading ? 'Searching…' : 'Search' }}
          </button>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        </div>
      </div>

      <div class="-mx-4 sm:-mx-6 lg:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th scope="col" class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Received</th>
              <th scope="col" class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">From</th>
              <th scope="col" class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Class and need</th>
              <th scope="col" class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Next action</th>
              <th scope="col" class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">Owner</th>
              <th scope="col" class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted" />
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <template v-for="reply in replies" :key="reply.id">
              <tr :class="isOverdue(reply) ? 'bg-red-50' : ''">
                <td class="px-4 sm:px-6 py-3 align-top whitespace-nowrap text-neutral-body">
                  {{ new Date(reply.received_at).toLocaleString() }}
                </td>
                <td class="px-4 sm:px-6 py-3 align-top text-brand-charcoal">
                  <div>{{ reply.from_email }}</div>
                  <div class="text-xs text-neutral-muted">
                    <template v-if="reply.institutional_leads">
                      {{ reply.institutional_leads.organization_name }} · {{ reply.institutional_leads.category }}
                    </template>
                    <template v-else-if="reply.profile_id || reply.prospect_id">
                      Job seeker{{ reply.profile_id ? ' (user)' : ' (prospect)' }}
                    </template>
                    <template v-else>
                      No match
                    </template>
                  </div>
                </td>
                <td class="px-4 sm:px-6 py-3 align-top">
                  <span
                    v-if="reply.reply_class"
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    :class="replyClassBadgeClass(reply.reply_class)"
                  >
                    {{ classLabel(reply.reply_class) }}
                  </span>
                  <span v-else-if="reply.needs_manual_review" class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                    Needs manual review
                  </span>
                  <span v-else class="text-xs text-neutral-muted">
                    pending{{ reply.classify_attempts ? ` (attempt ${reply.classify_attempts} failed)` : '' }}
                  </span>
                  <p v-if="reply.extracted?.need" class="mt-1 text-neutral-body max-w-xs">
                    {{ reply.extracted.need }}
                  </p>
                </td>
                <td class="px-4 sm:px-6 py-3 align-top">
                  <template v-if="reply.next_action">
                    <div class="text-brand-charcoal">{{ reply.next_action }}</div>
                    <div class="text-xs" :class="isOverdue(reply) ? 'text-red-700 font-medium' : 'text-neutral-muted'">
                      <template v-if="reply.handled_at">handled {{ new Date(reply.handled_at).toLocaleDateString() }}</template>
                      <template v-else-if="reply.next_action_due">
                        {{ isOverdue(reply) ? 'overdue since' : 'due' }} {{ new Date(reply.next_action_due).toLocaleDateString() }}
                      </template>
                    </div>
                  </template>
                  <span v-else class="text-xs text-neutral-muted">{{ reply.processed ? 'none' : '—' }}</span>
                </td>
                <td class="px-4 sm:px-6 py-3 align-top text-neutral-body">
                  {{ ownerName(reply) }}
                </td>
                <td class="px-4 sm:px-6 py-3 align-top whitespace-nowrap text-right">
                  <button type="button" class="text-xs text-brand-primary hover:underline mr-3" :aria-expanded="expanded === reply.id" @click="toggle(reply.id)">
                    {{ expanded === reply.id ? 'Hide' : 'Details' }}
                  </button>
                  <button
                    v-if="reply.next_action && !reply.handled_at"
                    type="button"
                    class="btn-secondary text-xs"
                    :disabled="handling === reply.id"
                    @click="markHandled(reply)"
                  >
                    <font-awesome-icon v-if="handling === reply.id" :icon="['fas', 'spinner']" spin class="mr-1" aria-hidden="true" />
                    Mark handled
                  </button>
                </td>
              </tr>
              <tr v-if="expanded === reply.id">
                <td colspan="6" class="px-4 sm:px-6 py-4 bg-neutral-bg/60">
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <p class="text-xs font-medium text-neutral-muted mb-1">Reply</p>
                      <p class="text-sm text-brand-charcoal font-medium mb-1">{{ reply.raw_subject ?? '(no subject)' }}</p>
                      <pre class="whitespace-pre-wrap text-sm text-neutral-body font-sans max-h-64 overflow-y-auto">{{ reply.raw_body ?? '' }}</pre>
                      <dl v-if="reply.extracted" class="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                        <dt class="text-neutral-muted">Roles</dt><dd>{{ reply.extracted.roles.join(', ') || '—' }}</dd>
                        <dt class="text-neutral-muted">Locations</dt><dd>{{ reply.extracted.locations.join(', ') || '—' }}</dd>
                        <dt class="text-neutral-muted">Timeline</dt><dd>{{ reply.extracted.timeline ?? '—' }}</dd>
                        <dt class="text-neutral-muted">Question</dt><dd>{{ reply.extracted.question ?? '—' }}</dd>
                        <dt class="text-neutral-muted">Sentiment</dt><dd>{{ reply.extracted.sentiment }}</dd>
                      </dl>
                      <p v-if="reply.last_classify_error" class="mt-2 text-xs text-red-700">
                        Last error: {{ reply.last_classify_error }}
                      </p>
                    </div>
                    <div>
                      <div class="flex items-center justify-between mb-1">
                        <p class="text-xs font-medium text-neutral-muted">Suggested reply (not sent)</p>
                        <button v-if="reply.draft_response" type="button" class="text-xs text-brand-primary hover:underline" @click="copyDraft(reply)">
                          {{ copied === reply.id ? 'Copied' : 'Copy' }}
                        </button>
                      </div>
                      <pre v-if="reply.draft_response" class="whitespace-pre-wrap text-sm text-brand-charcoal font-sans rounded-lg border border-neutral-border bg-white p-3">{{ reply.draft_response }}</pre>
                      <p v-else class="text-sm text-neutral-muted">No draft for this reply.</p>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="!loading && replies.length === 0">
              <td colspan="6" class="px-4 sm:px-6 py-6 text-center text-sm text-neutral-body">No replies found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total > pageSize" class="flex items-center justify-between pt-4 border-t border-neutral-border text-xs text-neutral-body">
        <p>Showing {{ page * pageSize + 1 }} – {{ Math.min((page + 1) * pageSize, total) }} of {{ total }} replies</p>
        <div class="flex gap-2">
          <button type="button" class="px-3 py-1 rounded-md border border-neutral-border text-xs" :disabled="page === 0 || loading" @click="goToPage(page - 1)">Previous</button>
          <button type="button" class="px-3 py-1 rounded-md border border-neutral-border text-xs" :disabled="(page + 1) * pageSize >= total || loading" @click="goToPage(page + 1)">Next</button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminAPI, type AdminReplyEventRow, type ReplyEventsView } from '@/lib/admin'

// Same classes as supabase/functions/_shared/reply-classification-prompt.ts.
const B2B_REPLY_CLASSES = [
  'Interested', 'More information', 'Meeting requested', 'Referral', 'Not now', 'Not interested',
  'Unsubscribe', 'Out of office', 'Wrong contact', 'Pricing question', 'Partnership question',
]
const B2C_REPLY_CLASSES = [
  'interested', 'role_request', 'pricing', 'assistance', 'not_now', 'not_interested',
  'already_employed', 'unsubscribe', 'out_of_office', 'other',
]

const classLabel = (c: string) => (c.includes('_') || c === c.toLowerCase() ? (c[0].toUpperCase() + c.slice(1)).replace(/_/g, ' ') : c)

function replyClassBadgeClass(replyClass: string): string {
  switch (replyClass) {
    case 'Interested':
    case 'Meeting requested':
    case 'interested':
    case 'role_request':
      return 'bg-green-100 text-green-800'
    case 'Unsubscribe':
    case 'Not interested':
    case 'unsubscribe':
    case 'not_interested':
      return 'bg-red-100 text-red-800'
    case 'Out of office':
    case 'Not now':
    case 'out_of_office':
    case 'not_now':
    case 'already_employed':
      return 'bg-neutral-100 text-neutral-700'
    default:
      return 'bg-blue-100 text-blue-800'
  }
}

const view = ref<ReplyEventsView>('open')
const search = ref('')
const classFilter = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const replies = ref<AdminReplyEventRow[]>([])
const page = ref(0)
const pageSize = 25
const total = ref(0)
const expanded = ref<string | null>(null)
const handling = ref<string | null>(null)
const copied = ref<string | null>(null)

const isOverdue = (r: AdminReplyEventRow) =>
  !!r.next_action && !r.handled_at && !!r.next_action_due && new Date(r.next_action_due).getTime() < Date.now()

const ownerName = (r: AdminReplyEventRow) => {
  if (!r.owner) return 'Unassigned'
  const name = [r.owner.first_name, r.owner.last_name].filter(Boolean).join(' ')
  return name || r.owner.email
}

const toggle = (id: string) => { expanded.value = expanded.value === id ? null : id }

async function copyDraft(r: AdminReplyEventRow) {
  if (!r.draft_response) return
  try {
    await navigator.clipboard.writeText(r.draft_response)
    copied.value = r.id
    setTimeout(() => { if (copied.value === r.id) copied.value = null }, 2000)
  } catch {
    error.value = 'Copy failed; select the text and copy it manually.'
  }
}

async function markHandled(r: AdminReplyEventRow) {
  handling.value = r.id
  const { data, error: apiError } = await adminAPI.markReplyHandled(r.id)
  handling.value = null
  if (apiError) {
    error.value = apiError.message
    return
  }
  r.handled_at = data?.handled_at ?? new Date().toISOString()
}

const fetchReplies = async () => {
  loading.value = true
  error.value = null
  try {
    const { data, error: apiError } = await adminAPI.listReplyEvents({
      view: view.value,
      search: search.value.trim() || undefined,
      replyClass: classFilter.value || undefined,
      limit: pageSize,
      offset: page.value * pageSize,
    })
    if (apiError) {
      error.value = apiError.message
      return
    }
    replies.value = data?.replies ?? []
    total.value = data?.total ?? replies.value.length
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  page.value = 0
  await fetchReplies()
}

const goToPage = async (newPage: number) => {
  if (newPage < 0) return
  page.value = newPage
  await fetchReplies()
}

onMounted(fetchReplies)
</script>
