import { supabase } from '@/lib/supabase'

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

interface SetUserRolesPayload {
  profile: {
    email: string
    first_name: string
    last_name: string | null
  }
  roles: string[]
}

export const adminAPI = {
  async setUserRoles(email: string, roles: string[]): Promise<{ data: SetUserRolesPayload | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('assign-role', {
      body: {
        email,
        roles,
      },
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as SetUserRolesPayload, error: null }
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

