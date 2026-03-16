<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white/95 backdrop-blur shadow-2xl border border-neutral-border/70">
      <header class="flex items-start gap-3 border-b border-neutral-border/80 px-6 py-4">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary text-sm font-semibold">
          AP
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-heading font-semibold text-brand-charcoal truncate">
            Manage permissions
          </h2>
          <p class="mt-1 text-xs text-neutral-body">
            Choose which admin capabilities this user should have. <span class="font-medium text-brand-charcoal">Super admin</span> always includes <span class="font-medium text-brand-charcoal">admin</span>.
          </p>
        </div>
      </header>

      <section class="px-6 py-4 space-y-4">
        <div class="rounded-xl border border-neutral-border/80 bg-neutral-bg px-3.5 py-2.5 text-xs text-neutral-body">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium text-brand-charcoal truncate">
                {{ user.first_name }} {{ user.last_name || '' }}
              </div>
              <div class="text-neutral-muted truncate">
                {{ user.email }}
              </div>
            </div>
            <span class="hidden sm:inline-flex shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-neutral-muted border border-neutral-border/70">
              Admin access
            </span>
          </div>
        </div>

        <div class="space-y-3">
          <label class="flex items-start gap-3 rounded-xl border border-neutral-border/60 bg-white px-3.5 py-2.5 shadow-xs hover:border-brand-primary/50 hover:bg-brand-primary/2 transition-colors text-sm">
            <input
              v-model="adminChecked"
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-neutral-border text-brand-primary focus:ring-brand-primary"
              :disabled="isSelf || isSaving"
            >
            <span class="space-y-0.5">
              <span class="flex items-center gap-1.5">
                <span class="font-medium text-brand-charcoal">Admin</span>
              </span>
              <span class="block text-xs text-neutral-body">
                Can access internal admin tools and dashboards.
              </span>
            </span>
          </label>

          <label class="flex items-start gap-3 rounded-xl border border-amber-300/80 bg-amber-50/70 px-3.5 py-2.5 shadow-xs hover:border-amber-400 transition-colors text-sm">
            <input
              v-model="superAdminChecked"
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-700 focus:ring-amber-500"
              :disabled="isSelf || isSaving"
            >
            <span class="space-y-0.5">
              <span class="flex items-center gap-1.5">
                <span class="font-medium text-brand-charcoal">Super admin</span>
                <span class="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  High privilege
                </span>
              </span>
              <span class="block text-xs text-neutral-body">
                Can manage admin permissions. Requires admin and cannot be modified for your own account.
              </span>
            </span>
          </label>

          <p class="mt-1 text-xs text-neutral-muted">
            Note: Selecting <span class="font-medium text-brand-charcoal">Super admin</span> will automatically keep <span class="font-medium text-brand-charcoal">Admin</span> selected.
          </p>
        </div>

        <p
          v-if="isSelf"
          class="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <span class="mt-0.5 h-4 w-4 rounded-full border border-amber-500 text-[10px] flex items-center justify-center">
            !
          </span>
          <span>
            You cannot modify your own permissions. Ask another super admin to change your access.
          </span>
        </p>

        <p
          v-if="error"
          class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <span class="mt-0.5 h-4 w-4 rounded-full border border-red-500 text-[10px] flex items-center justify-center">
            !
          </span>
          <span class="break-words">
            {{ error }}
          </span>
        </p>
      </section>

      <footer class="border-t border-neutral-border/80 px-6 py-3.5 flex items-center justify-between gap-3">
        <p class="hidden sm:block text-[11px] text-neutral-muted">
          Changes apply immediately for this user.
        </p>
        <div class="flex justify-end gap-2 w-full sm:w-auto">
          <button
            type="button"
            class="btn-secondary text-xs"
            :disabled="isSaving"
            @click="$emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary text-xs"
            :disabled="isSaving || isSelf"
            @click="handleSave"
          >
            <span v-if="isSaving">
              Saving…
            </span>
            <span v-else>
              Save changes
            </span>
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  user: {
    id: string
    email: string
    first_name: string
    last_name: string | null
  }
  roles: string[]
  isSelf: boolean
  isSaving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'save', roles: string[]): void
  (e: 'cancel'): void
}>()

const adminChecked = ref(false)
const superAdminChecked = ref(false)

// Sync local checkbox state from incoming roles whenever the modal is opened
// or the parent updates the roles after a save.
watch(
  () => props.roles,
  (roles) => {
    adminChecked.value = roles.includes('admin')
    superAdminChecked.value = roles.includes('super_admin')
  },
  { immediate: true },
)

// Enforce super_admin ⇒ admin at the UI level.
watch(superAdminChecked, (value) => {
  if (value && !adminChecked.value) {
    adminChecked.value = true
  }
})

// If admin is turned off while super_admin is on, drop super_admin too.
watch(adminChecked, (value) => {
  if (!value && superAdminChecked.value) {
    superAdminChecked.value = false
  }
})

const handleSave = () => {
  const nextRoles: string[] = []
  if (adminChecked.value) nextRoles.push('admin')
  if (superAdminChecked.value) nextRoles.push('super_admin')
  emit('save', nextRoles)
}
</script>

