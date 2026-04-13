<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** Raw advice text; empty or missing means still generating */
    adviceText: string | null | undefined
    /** Dialog heading (e.g. job-specific vs profile-wide resume advice). */
    modalTitle?: string
  }>(),
  {
    modalTitle: 'Resume advice for this job',
  },
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const hasAdvice = computed(() => {
  const t = props.adviceText
  return typeof t === 'string' && t.trim().length > 0
})

const adviceHtml = computed(() => {
  const t = props.adviceText
  if (typeof t !== 'string' || !t.trim()) return ''
  const raw = marked(t.trim(), { async: false })
  if (typeof raw !== 'string') return ''
  return DOMPurify.sanitize(raw)
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
    if (isOpen) document.body.classList.add('overflow-hidden')
    else document.body.classList.remove('overflow-hidden')
  },
)

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
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-advice-modal-title"
      @click.self="onBackdropClick"
    >
      <div
        class="card max-h-[min(85vh,36rem)] w-full max-w-lg overflow-hidden p-0 shadow-xl flex flex-col"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4 border-b border-neutral-border px-6 py-4">
          <h2
            id="resume-advice-modal-title"
            class="text-xl font-heading font-semibold text-brand-charcoal"
          >
            {{ modalTitle }}
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
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div
            v-if="hasAdvice"
            class="prose prose-sm max-w-none break-words text-neutral-body prose-headings:font-heading prose-headings:text-brand-charcoal prose-strong:text-brand-charcoal"
            v-html="adviceHtml"
          ></div>
          <div v-else class="flex flex-col items-center justify-center gap-3 py-8 text-center text-neutral-body text-sm">
            <font-awesome-icon
              :icon="['fas', 'spinner']"
              spin
              class="text-2xl text-brand-primary"
              aria-hidden="true"
            />
            <p>Your advice is being generated. Check back in a few minutes.</p>
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
