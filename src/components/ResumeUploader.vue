<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { profileAPI } from '@/lib/profile'
import { useUserStore } from '@/stores/user'

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

const userStore = useUserStore()

const resumeViewUrl = ref<string | null>(null)
const resumeFile = ref<File | null>(null)
const resumeFileName = ref('')
const resumeUploading = ref(false)
const resumeError = ref('')

// Load resume view URL when resumeBucketKey changes (only set URL if key unchanged after fetch)
watch(
  () => props.resumeBucketKey,
  async (key) => {
    if (!key) {
      resumeViewUrl.value = null
      return
    }
    const { data: url } = await profileAPI.getResumeDownloadUrl(key)
    if (props.resumeBucketKey === key) {
      resumeViewUrl.value = url || null
    }
  },
  { immediate: true }
)

const hasResume = computed(() => !!props.resumeBucketKey)

const handleResumeFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  resumeFile.value = file
  resumeFileName.value = file.name
  resumeError.value = ''

  if (props.autoUpload) {
    // Auto-upload mode (Profile view)
    try {
      resumeUploading.value = true
      const { data, error } = await profileAPI.uploadResume(file)
      if (error) {
        resumeError.value = error.message || 'Upload failed'
        emit('error', resumeError.value)
        return
      }
      if (data) {
        await userStore.refreshProfile()
        const bucketKey = data.resume_bucket_key
        if (bucketKey) {
          const { data: url } = await profileAPI.getResumeDownloadUrl(bucketKey)
          resumeViewUrl.value = url || null
        }
        resumeFile.value = null
        resumeFileName.value = ''
        target.value = ''
        emit('uploaded')
      }
    } catch (e) {
      resumeError.value = e instanceof Error ? e.message : 'Upload failed'
      emit('error', resumeError.value)
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
      <a
        :href="resumeViewUrl || '#'"
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand-primary font-medium hover:underline inline-flex items-center gap-2"
        :class="{ 'pointer-events-none opacity-50': !resumeViewUrl }"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {{ resumeViewUrl ? 'View resume' : 'Loading...' }}
      </a>
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
    </div>
  </div>
</template>
