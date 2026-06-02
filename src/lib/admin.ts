import { supabase } from '@/lib/supabase'
import type { UserLifecycleReport } from '@/lib/user-lifecycle'

export type AdminTestEmailKind =
  | 'job_match_digest'
  | 'subscription_started'
  | 'subscription_updated'
  | 'subscription_cancel_scheduled'
  | 'subscription_canceled'
  | 'system_announcement'

export interface AdminSendTestEmailPayload {
  profile_id?: string
  email?: string
  kind: AdminTestEmailKind
  job_ids?: string[]
  plan_name?: string
  next_billing_date?: string
  cancel_at_date?: string
  announcement_id?: string
}

export interface AdminSendTestEmailResult {
  success: boolean
  message_id: string | null
  error: string | null
  kind: AdminTestEmailKind
  profile_id: string
}

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

  async sendTestEmail(
    payload: AdminSendTestEmailPayload,
  ): Promise<{ data: AdminSendTestEmailResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-send-test-email', {
      body: payload,
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as AdminSendTestEmailResult, error: null }
  },

  async getUserLifecycleReport(): Promise<{ data: UserLifecycleReport | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-user-lifecycle-report', {
      body: {},
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as UserLifecycleReport, error: null }
  },
}

