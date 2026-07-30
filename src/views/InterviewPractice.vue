<template>
  <div class="app-warm-bg min-h-screen">
  <main class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <button
      type="button"
      class="inline-flex items-center gap-2 text-sm font-medium text-brand-primary hover:underline mb-6"
      @click="router.back()"
    >
      <font-awesome-icon :icon="['fas', 'chevron-left']" class="text-xs" aria-hidden="true" />
      Back
    </button>

    <header class="mb-6 flex items-start justify-between gap-4">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white">
          <font-awesome-icon :icon="['fas', 'comments']" aria-hidden="true" />
        </span>
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <h1 class="text-2xl sm:text-3xl font-heading font-bold text-brand-charcoal">
              Mock Interview Practice
            </h1>
            <span
              v-if="questionNumber > 0"
              class="inline-flex items-center rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-semibold text-brand-primary"
            >
              Question {{ questionNumber }}
            </span>
          </div>
          <p class="inline-block rounded-[12px] border border-[#D3E3F9] bg-[#EAF1FC] px-3 py-2 text-sm leading-snug text-neutral-body">
            Practicing for <span class="font-semibold text-brand-charcoal">{{ jobTitle }}</span>
            <template v-if="companyName">
              at <span class="font-semibold text-brand-charcoal">{{ companyName }}</span>
            </template>
          </p>
        </div>
      </div>
      <button type="button" class="btn-secondary text-sm px-4 py-2 shrink-0" @click="endSession">
        End session
      </button>
    </header>

    <p v-if="loadError" class="text-sm text-red-600 mb-4">
      {{ loadError }}
    </p>

    <section v-else class="flex flex-col overflow-hidden rounded-[16px] border border-neutral-border bg-white shadow-sm">
      <div ref="transcriptEl" class="p-5 sm:p-6 flex flex-col gap-4 max-h-[32rem] overflow-y-auto">
        <template v-for="(item, i) in renderItems" :key="i">
          <div v-if="item.kind === 'question'" class="flex gap-2.5 max-w-[88%]">
            <div class="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0">
              <font-awesome-icon :icon="['fas', 'comments']" class="text-xs" aria-hidden="true" />
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-neutral-body">Interviewer</span>
              <div class="bg-neutral-bg rounded-2xl rounded-tl-md px-4 py-2.5 text-sm text-brand-charcoal">
                {{ item.text }}
              </div>
            </div>
          </div>

          <div v-else-if="item.kind === 'answer'" class="flex gap-2.5 max-w-[88%] self-end flex-row-reverse">
            <div class="w-8 h-8 rounded-full bg-neutral-border text-neutral-body flex items-center justify-center shrink-0">
              <font-awesome-icon :icon="['fas', 'user-tie']" class="text-xs" aria-hidden="true" />
            </div>
            <div class="flex flex-col gap-1 items-end">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-neutral-body">You</span>
              <div class="bg-brand-primary text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm">
                {{ item.text }}
              </div>
            </div>
          </div>

          <div
            v-else
            class="max-w-[88%] ml-[42px] flex items-start gap-2 border-l-[3px] border-brand-success bg-green-50 rounded-r-lg px-3.5 py-2 text-[13px] text-neutral-body"
          >
            <font-awesome-icon :icon="['fas', 'lightbulb']" class="mt-0.5 shrink-0 text-brand-success" aria-hidden="true" />
            <span><span class="font-semibold text-brand-charcoal">Feedback:</span> {{ item.text }}</span>
          </div>
        </template>

        <div v-if="loading" class="flex gap-2.5 max-w-[88%]">
          <div class="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0">
            <font-awesome-icon :icon="['fas', 'comments']" class="text-xs" aria-hidden="true" />
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-neutral-body">Interviewer</span>
            <div class="bg-neutral-bg rounded-2xl rounded-tl-md px-4 py-3.5 flex items-center gap-1.5">
              <span
                v-for="d in [0, 1, 2]"
                :key="d"
                class="h-1.5 w-1.5 rounded-full bg-neutral-body/40 animate-bounce"
                :style="{ animationDelay: `${d * 150}ms` }"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-neutral-border p-4 flex flex-col gap-2">
        <p v-if="quotaExceeded" class="text-sm text-red-600">
          You've used all {{ quotaExceeded.dailyLimit }} free practice questions today. Come back
          tomorrow, or upgrade for unlimited practice.
        </p>
        <template v-else-if="!ended">
          <div class="flex gap-2.5 items-end">
            <textarea
              v-model="answerText"
              rows="1"
              class="input flex-1 resize-none"
              placeholder="Type your answer…"
              :disabled="loading"
              @keydown.enter.exact.prevent="submitAnswer"
            />
            <button
              type="button"
              class="btn-primary text-sm px-5 py-3 shrink-0"
              :disabled="loading || !answerText.trim()"
              @click="submitAnswer"
            >
              Send
            </button>
          </div>
          <p class="text-[11px] text-neutral-body/70">Press Enter to send</p>
          <div v-if="quota" class="mx-auto w-full max-w-xs">
            <div class="mb-1 flex items-center justify-between text-xs text-neutral-body">
              <span>Free plan: {{ quota.used }} of {{ quota.dailyLimit }} used today</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-bg">
              <div
                class="h-full rounded-full bg-brand-primary transition-all"
                :style="{ width: `${quota.dailyLimit > 0 ? Math.min(100, (quota.used / quota.dailyLimit) * 100) : 0}%` }"
              />
            </div>
            <router-link :to="{ name: 'billing-purchase' }" class="mt-1 inline-block text-xs font-medium text-brand-primary hover:underline">
              Upgrade for unlimited practice
            </router-link>
          </div>
        </template>
        <p v-else class="text-sm text-neutral-body text-center">Session ended.</p>
      </div>
    </section>
  </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { interviewPracticeAPI, type InterviewPracticeQuotaExceeded } from '@/lib/interviewPractice'

type RenderItem = { kind: 'question' | 'answer' | 'feedback'; text: string }

const route = useRoute()
const router = useRouter()

const jobMatchId = String(route.params.jobMatchId ?? '')
const jobTitle = typeof route.query.jobTitle === 'string' ? route.query.jobTitle : 'this role'
const companyName = typeof route.query.companyName === 'string' ? route.query.companyName : ''

const renderItems = ref<RenderItem[]>([])
const sessionId = ref<string | null>(null)
const quota = ref<{ used: number; dailyLimit: number } | null>(null)
const quotaExceeded = ref<InterviewPracticeQuotaExceeded | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const answerText = ref('')
const ended = ref(false)
const transcriptEl = ref<HTMLElement | null>(null)

const questionNumber = computed(() => renderItems.value.filter((i) => i.kind === 'question').length)

async function scrollToBottom() {
  await nextTick()
  transcriptEl.value?.scrollTo({ top: transcriptEl.value.scrollHeight, behavior: 'smooth' })
}

async function startSession() {
  loading.value = true
  loadError.value = null
  const { data, error, quotaExceeded: exceeded } = await interviewPracticeAPI.start(jobMatchId)
  loading.value = false

  if (exceeded) {
    quotaExceeded.value = exceeded
    return
  }
  if (error || !data) {
    loadError.value = error?.message ?? 'Could not start the interview session.'
    return
  }

  sessionId.value = data.sessionId
  quota.value = data.quota
  renderItems.value.push({ kind: 'question', text: data.question })
  void scrollToBottom()
}

async function submitAnswer() {
  const answer = answerText.value.trim()
  if (!answer || !sessionId.value || loading.value) return

  renderItems.value.push({ kind: 'answer', text: answer })
  answerText.value = ''
  loading.value = true
  void scrollToBottom()

  const { data, error, quotaExceeded: exceeded } = await interviewPracticeAPI.continue(
    sessionId.value,
    jobMatchId,
    answer,
  )
  loading.value = false

  if (exceeded) {
    quotaExceeded.value = exceeded
    return
  }
  if (error || !data) {
    loadError.value = error?.message ?? 'Could not get the next question.'
    return
  }

  quota.value = data.quota
  if (data.feedback) {
    renderItems.value.push({ kind: 'feedback', text: data.feedback })
  }
  renderItems.value.push({ kind: 'question', text: data.question })
  void scrollToBottom()
}

function endSession() {
  ended.value = true
  router.back()
}

onMounted(() => {
  if (!jobMatchId) {
    loadError.value = 'Missing job to practice for.'
    return
  }
  void startSession()
})
</script>
