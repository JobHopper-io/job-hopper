<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { profileAPI } from '@/lib/profile'
import { resumeFileSizeErrorIfAny, resumeMaxSizeLabel } from '@/lib/resumeUploadLimits'

const maxResumeSizeLabel = resumeMaxSizeLabel()

interface Props {
  resumeBucketKey?: string | null
  autoUpload?: boolean
  inputId?: string
}

const props = withDefaults(defineProps<Props>(), {
  resumeBucketKey: null,
  autoUpload: false,
  inputId: 'resume-upload'
})

const emit = defineEmits<{
  'file-selected': [file: File]
  'uploaded': []
  'error': [error: string]
}>()

const resumeFile = ref<File | null>(null)
const resumeFileName = ref('')
const resumeUploading = ref(false)
const resumeError = ref('')
const resumeLoadError = ref<string | null>(null)
const resumeOpening = ref(false)

watch(
  () => props.resumeBucketKey,
  () => {
    resumeLoadError.value = null
  },
)

async function openResumeView() {
  const key = props.resumeBucketKey
  if (!key) return
  resumeLoadError.value = null
  resumeOpening.value = true
  try {
    const { data: url, error } = await profileAPI.getResumeDownloadUrl(key)
    if (error || !url) {
      console.error('Resume load error:', error)
      resumeLoadError.value = "We couldn't load your resume. Try again or upload a new file."
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  } finally {
    resumeOpening.value = false
  }
}

function retryLoadResume() {
  void openResumeView()
}

const hasResume = computed(() => !!props.resumeBucketKey)

const handleResumeFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  resumeFile.value = file
  resumeFileName.value = file.name
  resumeError.value = ''

  const sizeError = resumeFileSizeErrorIfAny(file)
  if (sizeError) {
    resumeError.value = sizeError
    resumeFile.value = null
    resumeFileName.value = ''
    target.value = ''
    return
  }

  if (props.autoUpload) {
    // Auto-upload mode (Profile view)
    try {
      resumeUploading.value = true
      const { data, error } = await profileAPI.uploadResume(file)
      if (error) {
        console.error('Resume upload error:', error)
        const msg = (error.message ?? String(error)).trim()
        resumeError.value = msg || "We couldn't upload your resume. Please try again."
        emit('error', msg)
        return
      }
      if (data) {
        resumeFile.value = null
        resumeFileName.value = ''
        target.value = ''
        emit('uploaded')
      }
    } catch (e) {
      console.error('Resume upload error:', e)
      resumeError.value = "We couldn't upload your resume. Please try again."
      emit('error', e instanceof Error ? e.message : String(e))
    } finally {
      resumeUploading.value = false
    }
  } else {
    // Manual upload mode (Onboarding view) - just emit the file
    emit('file-selected', file)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="hasResume" class="mb-4">
      <p class="text-sm font-medium text-brand-charcoal mb-2">Your current resume</p>
      <template v-if="resumeLoadError">
        <p class="text-sm text-red-600 mb-2">{{ resumeLoadError }}</p>
        <button
          type="button"
          class="text-brand-primary font-medium hover:underline text-sm"
          @click="retryLoadResume"
        >
          Try again
        </button>
      </template>
      <button
        v-else
        type="button"
        class="text-brand-primary font-medium hover:underline inline-flex items-center gap-2 disabled:pointer-events-none disabled:opacity-50"
        :disabled="resumeOpening"
        @click="openResumeView"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {{ resumeOpening ? 'Opening…' : 'View resume' }}
      </button>
    </div>
    <div class="space-y-3">
      <input
        :id="inputId"
        type="file"
        accept=".pdf,.doc,.docx"
        class="hidden"
        :disabled="resumeUploading"
        @change="handleResumeFileChange"
      />
      <label
        :for="inputId"
        class="btn-secondary cursor-pointer inline-block"
        :class="{ 'opacity-50 pointer-events-none': resumeUploading }"
      >
        {{ resumeUploading ? 'Uploading...' : (hasResume ? 'Choose new file to replace' : 'Choose file to upload') }}
      </label>
      <p v-if="resumeFileName && !resumeUploading" class="text-sm text-neutral-body">
        Selected: {{ resumeFileName }}
      </p>
      <p v-if="resumeError" class="text-sm text-red-600">{{ resumeError }}</p>
      <p class="text-xs text-neutral-body">
        Accepted formats: PDF, Word (.doc, .docx). Images are not supported—use a PDF or Word file.
        Maximum file size: {{ maxResumeSizeLabel }}.
      </p>
    </div>
  </div>
</template>
