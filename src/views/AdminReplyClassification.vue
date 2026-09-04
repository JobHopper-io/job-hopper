<template>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Reply Classification
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        Inbound replies to outbound institutional-lead emails, classified by classify-replies.
        An Unsubscribe classification automatically adds the reply's organization to the
        exclusion list.
      </p>
    </header>

    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div class="w-full sm:max-w-xs">
          <label
            for="search"
            class="block text-sm font-medium text-brand-charcoal mb-1"
          >
            Search by sender email
          </label>
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
          <label
            for="class-filter"
            class="block text-sm font-medium text-brand-charcoal mb-1"
          >
            Classification
          </label>
          <select
            id="class-filter"
            v-model="classFilter"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal bg-white"
            @change="handleSearch"
          >
            <option value="">
              All
            </option>
            <option
              v-for="c in REPLY_CLASSES"
              :key="c"
              :value="c"
            >
              {{ c }}
            </option>
          </select>
        </div>
        <div class="flex items-end gap-3">
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="loading"
            @click="handleSearch"
          >
            {{ loading ? 'Searching…' : 'Search' }}
          </button>
          <p
            v-if="error"
            class="text-sm text-red-600"
          >
            {{ error }}
          </p>
        </div>
      </div>

      <div class="-mx-4 sm:-mx-6 lg:-mx-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-neutral-border text-sm">
          <thead class="bg-neutral-bg">
            <tr>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Received
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                From
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Subject
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Classification
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Source lead
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr
              v-for="reply in replies"
              :key="reply.id"
            >
              <td class="px-4 sm:px-6 py-3 align-top whitespace-nowrap text-neutral-body">
                {{ new Date(reply.received_at).toLocaleString() }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-brand-charcoal">
                {{ reply.from_email }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-neutral-body max-w-xs truncate">
                {{ reply.raw_subject ?? '—' }}
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <span
                  v-if="reply.reply_class"
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="replyClassBadgeClass(reply.reply_class)"
                >
                  {{ reply.reply_class }}
                </span>
                <span
                  v-else
                  class="text-xs text-neutral-muted"
                >
                  {{ reply.processed ? 'unclassified' : 'pending' }}
                </span>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <template v-if="reply.institutional_leads">
                  <div class="text-brand-charcoal">
                    {{ reply.institutional_leads.organization_name }}
                  </div>
                  <div class="text-xs text-neutral-muted">
                    {{ reply.institutional_leads.category }}
                    <template v-if="reply.institutional_leads.campaign">
                      · {{ reply.institutional_leads.campaign }}
                    </template>
                  </div>
                  <router-link
                    :to="`/admin/partner-dashboard/${reply.institutional_lead_id}`"
                    class="text-xs text-brand-primary hover:underline"
                  >
                    Partner dashboard
                  </router-link>
                </template>
                <span
                  v-else
                  class="text-xs text-neutral-muted"
                >
                  No matched lead
                </span>
              </td>
            </tr>
            <tr v-if="!loading && replies.length === 0">
              <td
                colspan="5"
                class="px-4 sm:px-6 py-6 text-center text-sm text-neutral-body"
              >
                No replies found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="total > pageSize"
        class="flex items-center justify-between pt-4 border-t border-neutral-border text-xs text-neutral-body"
      >
        <p>
          Showing
          {{ page * pageSize + 1 }}
          –
          {{ Math.min((page + 1) * pageSize, total) }}
          of
          {{ total }}
          replies
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-3 py-1 rounded-md border border-neutral-border text-xs"
            :disabled="page === 0 || loading"
            @click="goToPage(page - 1)"
          >
            Previous
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded-md border border-neutral-border text-xs"
            :disabled="(page + 1) * pageSize >= total || loading"
            @click="goToPage(page + 1)"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminAPI, type AdminReplyEventRow } from '@/lib/admin'

// Same 10 classes as supabase/functions/_shared/reply-classification-prompt.ts.
const REPLY_CLASSES = [
  'Interested',
  'More information',
  'Meeting requested',
  'Referral',
  'Not now',
  'Not interested',
  'Unsubscribe',
  'Out of office',
  'Wrong contact',
  'Pricing question',
  'Partnership question',
]

function replyClassBadgeClass(replyClass: string): string {
  switch (replyClass) {
    case 'Interested':
    case 'Meeting requested':
      return 'bg-green-100 text-green-800'
    case 'Unsubscribe':
    case 'Not interested':
      return 'bg-red-100 text-red-800'
    case 'Out of office':
    case 'Not now':
      return 'bg-neutral-100 text-neutral-700'
    default:
      return 'bg-blue-100 text-blue-800'
  }
}

const search = ref('')
const classFilter = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const replies = ref<AdminReplyEventRow[]>([])
const page = ref(0)
const pageSize = 25
const total = ref(0)

const fetchReplies = async () => {
  loading.value = true
  error.value = null

  try {
    const { data, error: apiError } = await adminAPI.listReplyEvents({
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
