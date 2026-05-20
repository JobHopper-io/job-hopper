<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, useId } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/bodyScrollLock'
import type { JobContact, PremiumInsightsOrgChoice } from '@/types/database'

const NONE_KEY = '__none__'

const props = withDefaults(
  defineProps<{
    open: boolean
    contacts: JobContact[] | null | undefined
    companySummary?: Record<string, unknown> | null
    /** When set, modal shows error state instead of contacts */
    errorMessage?: string | null
    /** Request in flight (contacts may still be stale from a prior view) */
    loading?: boolean
    /** Optional second line under an error (e.g. freemium credit reassurance) */
    freemiumNote?: string | null
    /** When set, user must pick an employer (Apollo org scores in the ambiguity band) or none */
    orgChoiceOptions?: PremiumInsightsOrgChoice[] | null
    orgChoiceSubmitting?: boolean
  }>(),
  {
    companySummary: null,
    errorMessage: null,
    loading: false,
    freemiumNote: null,
    orgChoiceOptions: null,
    orgChoiceSubmitting: false,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm-org-choice', payload: { decline: true } | { selectedApolloOrganizationId: string }): void
}>()

const orgRadioName = useId()
const selectedOrgKey = ref<string | null>(null)

watch(
  () => [props.orgChoiceOptions, props.open] as const,
  () => {
    selectedOrgKey.value = null
  },
)

const hasContacts = computed(() => {
  const c = props.contacts
  return Array.isArray(c) && c.length > 0
})

const showOrgChoice = computed(
  () => Array.isArray(props.orgChoiceOptions) && props.orgChoiceOptions.length > 0,
)

const companySummaryText = computed(() => {
  const o = props.companySummary
  if (!o) return null
  const name = typeof o.name === 'string' ? o.name : null
  const domain = typeof o.primary_domain === 'string' ? o.primary_domain : null
  if (name && domain) return `${name} · ${domain}`
  if (name) return name
  if (domain) return domain
  return null
})

function onBackdropClick() {
  emit('close')
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && props.open) emit('close')
}

function onConfirmOrgChoiceClick() {
  if (selectedOrgKey.value === null) return
  if (selectedOrgKey.value === NONE_KEY) {
    emit('confirm-org-choice', { decline: true })
    return
  }
  emit('confirm-org-choice', { selectedApolloOrganizationId: selectedOrgKey.value })
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof document === 'undefined') return
    if (isOpen) lockBodyScroll()
    else unlockBodyScroll()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (props.open) unlockBodyScroll()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="showOrgChoice ? 'premium-insights-org-choice-title' : 'premium-insights-modal-title'"
      @click.self="onBackdropClick"
    >
      <div
        class="card max-h-[min(85vh,36rem)] w-full max-w-lg overflow-hidden p-0 shadow-xl flex flex-col"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4 border-b border-neutral-border px-6 py-4">
          <h2
            v-if="showOrgChoice"
            id="premium-insights-org-choice-title"
            class="text-xl font-heading font-semibold text-brand-charcoal"
          >
            Which company is this job with?
          </h2>
          <h2
            v-else
            id="premium-insights-modal-title"
            class="text-xl font-heading font-semibold text-brand-charcoal"
          >
            Hiring contacts
          </h2>
          <button
            type="button"
            class="shrink-0 rounded-lg p-2 text-neutral-body hover:bg-neutral-bg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            aria-label="Close"
            @click="emit('close')"
          >
            <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p v-if="!loading && !errorMessage && !showOrgChoice && companySummaryText" class="text-sm text-neutral-body">
            <span class="font-medium text-brand-charcoal">Organization:</span>
            {{ companySummaryText }}
          </p>

          <div
            v-if="loading"
            class="flex flex-col items-center justify-center gap-3 py-8 text-center text-neutral-body text-sm"
          >
            <font-awesome-icon
              :icon="['fas', 'spinner']"
              spin
              class="text-2xl text-brand-primary"
              aria-hidden="true"
            />
            <p>Looking up hiring contacts…</p>
          </div>

          <template v-else>
            <template v-if="showOrgChoice">
              <p class="text-sm text-neutral-body">
                Several Apollo organizations scored close enough to the best match that we need your help.
                Choose the one that best represents this posting’s employer, or choose none to stop without a contact.
              </p>
              <fieldset class="space-y-3">
                <legend class="sr-only">Employer match</legend>
                <label
                  v-for="opt in orgChoiceOptions"
                  :key="opt.apollo_organization_id"
                  class="flex cursor-pointer gap-3 rounded-lg border border-neutral-border bg-neutral-bg/40 px-4 py-3 has-[:checked]:border-brand-primary has-[:checked]:ring-1 has-[:checked]:ring-brand-primary"
                >
                  <input
                    v-model="selectedOrgKey"
                    type="radio"
                    class="mt-1 h-4 w-4 shrink-0 accent-brand-primary"
                    :value="opt.apollo_organization_id"
                    :name="orgRadioName"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="font-medium text-brand-charcoal">{{ opt.name }}</span>
                    <span v-if="opt.primary_domain" class="mt-0.5 block text-xs text-neutral-body">{{
                      opt.primary_domain
                    }}</span>
                    <span class="mt-0.5 block text-xs text-neutral-body">Match score: {{ opt.score }}</span>
                  </span>
                </label>
                <label
                  class="flex cursor-pointer gap-3 rounded-lg border border-neutral-border bg-neutral-bg/40 px-4 py-3 has-[:checked]:border-brand-primary has-[:checked]:ring-1 has-[:checked]:ring-brand-primary"
                >
                  <input
                    v-model="selectedOrgKey"
                    type="radio"
                    class="mt-1 h-4 w-4 shrink-0 accent-brand-primary"
                    :value="NONE_KEY"
                    :name="orgRadioName"
                  />
                  <span class="font-medium text-brand-charcoal">None of these</span>
                </label>
              </fieldset>
            </template>

            <div
              v-else-if="errorMessage"
              class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-2"
              role="alert"
            >
              <p>{{ errorMessage }}</p>
              <p v-if="freemiumNote" class="text-red-900/90 text-xs leading-snug">{{ freemiumNote }}</p>
            </div>

            <ul v-else-if="hasContacts" class="space-y-4">
              <li
                v-for="(c, idx) in contacts"
                :key="idx"
                class="rounded-lg border border-neutral-border bg-neutral-bg/40 px-4 py-3"
              >
                <p class="font-heading font-semibold text-brand-charcoal">{{ c.name }}</p>
                <p v-if="c.title" class="text-sm text-neutral-body mt-0.5">{{ c.title }}</p>
                <p v-if="c.location" class="text-xs text-neutral-body mt-1">{{ c.location }}</p>
                <p v-if="c.note" class="text-xs text-neutral-body mt-2">{{ c.note }}</p>
                <a
                  v-if="c.email"
                  :href="`mailto:${c.email}`"
                  class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
                >
                  <font-awesome-icon :icon="['fas', 'envelope']" class="shrink-0" aria-hidden="true" />
                  {{ c.email }}
                </a>
              </li>
            </ul>

            <div
              v-else
              class="flex flex-col items-center justify-center gap-3 py-8 text-center text-neutral-body text-sm"
            >
              <p>No hiring contacts are available for this job yet.</p>
            </div>
          </template>
        </div>
        <div class="border-t border-neutral-border px-6 py-4 flex flex-wrap gap-3 justify-end">
          <template v-if="showOrgChoice">
            <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
            <button
              type="button"
              class="btn-primary inline-flex items-center gap-2"
              :disabled="selectedOrgKey === null || orgChoiceSubmitting"
              @click="onConfirmOrgChoiceClick"
            >
              <font-awesome-icon
                v-if="orgChoiceSubmitting"
                :icon="['fas', 'spinner']"
                spin
                class="shrink-0"
                aria-hidden="true"
              />
              Continue
            </button>
          </template>
          <button v-else type="button" class="btn-primary w-full sm:w-auto" @click="emit('close')">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
