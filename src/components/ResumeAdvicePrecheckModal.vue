<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/bodyScrollLock'

const props = withDefaults(
  defineProps<{
    open: boolean
    variant: 'upload-required' | 'confirm-free-credit'
    /** Platform free allowance (from freemium_settings); shown for confirm variant only. */
    maxFreeCredits?: number
    /** Credits still available; shown for confirm variant only. */
    remainingFreeCredits?: number
  }>(),
  {
    maxFreeCredits: 0,
    remainingFreeCredits: 0,
  },
)

const emit = defineEmits<{
  close: []
  confirm: []
}>()

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
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-advice-precheck-title"
      @click.self="onBackdropClick"
    >
      <div
        class="card w-full max-w-md overflow-hidden p-0 shadow-xl"
        @click.stop
      >
        <div class="border-b border-neutral-border px-6 py-4">
          <h2
            id="resume-advice-precheck-title"
            class="text-xl font-heading font-semibold text-brand-charcoal"
          >
            <template v-if="variant === 'upload-required'">Upload your resume first</template>
            <template v-else>Use a free resume advice credit?</template>
          </h2>
        </div>
        <div class="px-6 py-4 text-sm text-neutral-body space-y-3">
          <template v-if="variant === 'upload-required'">
            <p>
              Resume advice for each job is generated using your uploaded resume. Add a resume on your profile
              before you can use this feature.
            </p>
          </template>
          <template v-else>
            <p>
              You can get up to
              <span class="font-semibold text-brand-charcoal">{{ maxFreeCredits }}</span>
              per-job resume advice credits at no charge. You have
              <span class="font-semibold text-brand-charcoal">{{ remainingFreeCredits }}</span>
              left.
            </p>
            <p>
              Using one credit generates tailored feedback for this job and counts against your free limit. If you
              continue without credits later, you can purchase advice through checkout.
            </p>
            <p class="font-medium text-brand-charcoal">Use one free credit for this job?</p>
          </template>
        </div>
        <div class="flex flex-col gap-2 border-t border-neutral-border px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <template v-if="variant === 'upload-required'">
            <button type="button" class="btn-secondary w-full sm:w-auto" @click="emit('close')">Close</button>
            <router-link
              :to="{ name: 'profile' }"
              class="btn-primary w-full text-center sm:w-auto"
              @click="emit('close')"
            >
              Go to profile
            </router-link>
          </template>
          <template v-else>
            <button type="button" class="btn-secondary w-full sm:w-auto" @click="emit('close')">Cancel</button>
            <button type="button" class="btn-primary w-full sm:w-auto" @click="emit('confirm')">
              Use one free credit
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
