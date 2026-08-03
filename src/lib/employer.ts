import { supabase } from '@/lib/supabase'
import type { EmployerAccount } from '@/types/database'

export const employerAPI = {
  /** Employer sign-up: distinct from authAPI.signUp - handle_new_user() branches on
   * account_type to create an employer_accounts row instead of a profiles row. */
  async signUp(email: string, password: string, companyName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/employer/register`,
        data: {
          account_type: 'employer',
          company_name: companyName,
        },
      },
    })

    if (error) {
      console.error('Employer auth signUp error:', error.message, error)
    }

    return { data, error }
  },

  async getCurrentEmployerAccount(): Promise<{ data: EmployerAccount | null; error: Error | null }> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (!user || authError) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data, error } = await supabase
      .from('employer_accounts')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle<EmployerAccount>()

    return { data: data ?? null, error }
  },
}
