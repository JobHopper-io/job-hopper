<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <header class="mb-4">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Manage permissions
        </h2>
        <p class="mt-1 text-xs text-neutral-body">
          Update which admin permissions this user has. Super admin requires admin.
        </p>
      </header>

      <section class="space-y-4">
        <div class="rounded-lg bg-neutral-bg px-3 py-2 text-xs text-neutral-body">
          <div class="font-medium text-brand-charcoal">
            {{ user.first_name }} {{ user.last_name || '' }}
          </div>
          <div class="text-neutral-muted">
            {{ user.email }}
          </div>
        </div>

        <div class="space-y-2">
          <label class="flex items-start gap-2 text-sm">
            <input
              v-model="localRolesState.admin"
              type="checkbox"
              class="mt-1 h-4 w-4 rounded border-neutral-border text-brand-primary focus:ring-brand-primary"
              :disabled="isSelf || isSaving"
            >
            <span>
              <span class="font-medium text-brand-charcoal">Admin</span>
              <span class="block text-xs text-neutral-body">
                Can access internal admin tools and dashboards.
              </span>
            </span>
          </label>

          <label class="flex items-start gap-2 text-sm">
            <input
              v-model="localRolesState.super_admin"
              type="checkbox"
              class="mt-1 h-4 w-4 rounded border-neutral-border text-brand-primary focus:ring-brand-primary"
              :disabled="isSelf || isSaving"
            >
            <span>
              <span class="font-medium text-brand-charcoal">Super admin</span>
              <span class="block text-xs text-neutral-body">
                Can manage admin permissions. Requires admin and cannot be modified for your own account.
              </span>
            </span>
          </label>

          <p class="mt-1 text-xs text-neutral-muted">
            Note: Super admin will automatically ensure admin is also selected.
          </p>
        </div>

        <p
          v-if="isSelf"
          class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          You cannot modify your own permissions. Ask another super admin to change your access.
        </p>

        <p
          v-if="error"
          class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {{ error }}
        </p>
      </section>

      <footer class="mt-6 flex justify-end gap-2">
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
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

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

const localRolesState = reactive({
  admin: computed({
    get: () => props.roles.includes('admin'),
    set: (value: boolean) => {
      // If admin is unchecked while super_admin is active, also drop super_admin.
      if (!value && localRolesState.super_admin) {
        localRolesState.super_admin = false
      }
    },
  }),
  super_admin: computed({
    get: () => props.roles.includes('super_admin'),
    set: (value: boolean) => {
      // If super_admin is checked, ensure admin is also checked.
      if (value && !localRolesState.admin) {
        localRolesState.admin = true
      }
    },
  }),
})

watch(
  () => props.roles,
  () => {
    // The computed getters will derive from props.roles; this watcher exists
    // to ensure reactivity when the parent updates roles after a save.
  },
)

const handleSave = () => {
  const nextRoles: string[] = []
  if (localRolesState.admin) nextRoles.push('admin')
  if (localRolesState.super_admin) nextRoles.push('super_admin')
  emit('save', nextRoles)
}
</script>

