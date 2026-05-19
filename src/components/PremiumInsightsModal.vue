<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/bodyScrollLock'
import type { JobContact } from '@/types/database'

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
  }>(),
  {
    companySummary: null,
    errorMessage: null,
    loading: false,
    freemiumNote: null,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const hasContacts = computed(() => {
  const c = props.contacts
  return Array.isArray(c) && c.length > 0
})

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
      aria-labelledby="premium-insights-modal-title"
      @click.self="onBackdropClick"
    >
      <div
        class="card max-h-[min(85vh,36rem)] w-full max-w-lg overflow-hidden p-0 shadow-xl flex flex-col"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4 border-b border-neutral-border px-6 py-4">
          <h2
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
          <p v-if="!loading && !errorMessage && companySummaryText" class="text-sm text-neutral-body">
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
            <div
              v-if="errorMessage"
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
        <div class="border-t border-neutral-border px-6 py-4">
          <button type="button" class="btn-primary w-full sm:w-auto" @click="emit('close')">
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
