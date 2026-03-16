import { supabase } from '@/lib/supabase'

interface AdminRoleProfile {
  email: string
  first_name: string
  last_name: string | null
}

interface AdminRolePayload {
  profile: AdminRoleProfile
  isAdmin: boolean
}

interface AdminRoleResponse {
  data: AdminRolePayload | null
  error: Error | null
}

type AssignRoleAction = 'status' | 'grant' | 'revoke'

interface AdminUserRow {
  id: string
  email: string
  first_name: string
  last_name: string | null
  roles: string[]
}

interface ListUsersResult {
  profiles: AdminUserRow[]
  total: number
}

interface ListUsersResponse {
  data: ListUsersResult | null
  error: Error | null
}

async function invokeAssignRole(email: string, action: AssignRoleAction): Promise<AdminRoleResponse> {
  const { data, error } = await supabase.functions.invoke('assign-role', {
    body: {
      email,
      role: 'admin',
      action,
    },
  })

  if (error) {
    return { data: null, error }
  }

  return { data: data as AdminRolePayload, error: null }
}

export const adminAPI = {
  async getAdminStatus(email: string): Promise<AdminRoleResponse> {
    return invokeAssignRole(email, 'status')
  },

  async setAdminStatus(email: string, makeAdmin: boolean): Promise<AdminRoleResponse> {
    return invokeAssignRole(email, makeAdmin ? 'grant' : 'revoke')
  },

  async listUsers(params: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<ListUsersResponse> {
    const { data, error } = await supabase.functions.invoke('list-admin-users', {
      body: params,
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as ListUsersResult, error: null }
  },
}

