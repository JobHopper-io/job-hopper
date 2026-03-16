<template>
  <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-2">
        Admin Management
      </h1>
      <p class="text-sm text-neutral-body max-w-2xl">
        View all users, their roles, and manage who has admin access.
      </p>
    </header>

    <section class="bg-white rounded-2xl border border-neutral-border shadow-sm p-6 space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="w-full sm:max-w-xs">
          <label
            for="search"
            class="block text-sm font-medium text-brand-charcoal mb-1"
          >
            Search by email
          </label>
          <input
            id="search"
            v-model="search"
            type="search"
            class="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm text-brand-charcoal placeholder-neutral-muted focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-white"
            placeholder="user@example.com"
            @keyup.enter="handleSearch"
          >
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
                Name
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Email
              </th>
              <th class="px-4 sm:px-6 py-3 text-left font-medium text-neutral-muted">
                Roles
              </th>
              <th class="px-4 sm:px-6 py-3 text-right font-medium text-neutral-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-border">
            <tr
              v-for="user in users"
              :key="user.id"
            >
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="font-medium text-brand-charcoal">
                  {{ user.first_name }} {{ user.last_name || '' }}
                </div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="text-neutral-body">
                  {{ user.email }}
                </div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top">
                <div class="text-neutral-body">
                  <span v-if="user.roles.length > 0">
                    {{ user.roles.join(', ') }}
                  </span>
                  <span v-else>
                    —
                  </span>
                </div>
              </td>
              <td class="px-4 sm:px-6 py-3 align-top text-right">
                <div class="flex items-center justify-end gap-2">
                  <template v-if="isCurrentUser(user)">
                    <span class="text-[11px] text-neutral-muted">
                      You can’t edit your own permissions
                    </span>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="btn-primary text-xs"
                      :disabled="mutatingId === user.id"
                      @click="openPermissions(user)"
                    >
                      <span v-if="mutatingId === user.id">
                        Opening…
                      </span>
                      <span v-else>
                        Manage permissions
                      </span>
                    </button>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && users.length === 0">
              <td
                colspan="4"
                class="px-4 sm:px-6 py-6 text-center text-sm text-neutral-body"
              >
                No users found.
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
          users
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

    <AdminManagePermissionsModal
      v-if="activeUser"
      :user="activeUser"
      :roles="activeUser.roles"
      :is-self="isCurrentUser(activeUser)"
      :is-saving="savingPermissions"
      :error="modalError"
      @save="handleSavePermissions"
      @cancel="closePermissions"
    />
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminAPI } from '@/lib/admin'
import { profileAPI } from '@/lib/profile'
import AdminManagePermissionsModal from '@/components/AdminManagePermissionsModal.vue'

interface AdminUserRow {
  id: string
  email: string
  first_name: string
  last_name: string | null
  roles: string[]
}

const search = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const users = ref<AdminUserRow[]>([])
const page = ref(0)
const pageSize = 25
const total = ref(0)
const mutatingId = ref<string | null>(null)
const currentUserEmail = ref<string | null>(null)
const activeUser = ref<AdminUserRow | null>(null)
const savingPermissions = ref(false)
const modalError = ref<string | null>(null)

const fetchUsers = async () => {
  loading.value = true
  error.value = null

  try {
    const { data, error: apiError } = await adminAPI.listUsers({
      search: search.value.trim() || undefined,
      limit: pageSize,
      offset: page.value * pageSize,
    })

    if (apiError) {
      error.value = apiError.message
      return
    }

    users.value = data?.profiles ?? []
    total.value = data?.total ?? users.value.length
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  page.value = 0
  await fetchUsers()
}

const goToPage = async (newPage: number) => {
  if (newPage < 0) return
  page.value = newPage
  await fetchUsers()
}
const isCurrentUser = (user: AdminUserRow) => {
  return currentUserEmail.value != null && user.email.toLowerCase() === currentUserEmail.value.toLowerCase()
}

const openPermissions = (user: AdminUserRow) => {
  modalError.value = null
  mutatingId.value = user.id
  activeUser.value = { ...user }
  mutatingId.value = null
}

const closePermissions = () => {
  activeUser.value = null
  modalError.value = null
}

const handleSavePermissions = async (roles: string[]) => {
  if (!activeUser.value) return
  savingPermissions.value = true
  modalError.value = null

  try {
    const { data, error: apiError } = await adminAPI.setUserRoles(activeUser.value.email, roles)
    if (apiError) {
      modalError.value = apiError.message
      return
    }
    if (!data) return

    const idx = users.value.findIndex((u) => u.id === activeUser.value?.id)
    if (idx !== -1) {
      users.value[idx] = {
        ...users.value[idx],
        roles: data.roles,
      }
    }

    closePermissions()
  } finally {
    savingPermissions.value = false
  }
}

onMounted(async () => {
  const { data: profile } = await profileAPI.getCurrentUserProfile()
  currentUserEmail.value = profile?.email ?? null
  await fetchUsers()
})
</script>

