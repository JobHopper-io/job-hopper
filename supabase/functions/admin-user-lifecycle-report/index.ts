import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  categorizeUserLifecycle,
  type UserLifecycleCategory,
} from '../_shared/user-lifecycle-category.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 1000
const MAX_PROFILES = 10000

const CATEGORY_ORDER: UserLifecycleCategory[] = [
  'incomplete_onboarding',
  'stripe_free_trial',
  'freemium',
  'active_subscription',
  'churned',
  'unclassified',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No authorization header' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  const supabaseUserClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await supabaseUserClient.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  const [{ data: isAdmin, error: adminCheckError }, { data: isSuperAdmin, error: superAdminError }] =
    await Promise.all([
      supabaseUserClient.rpc('current_user_has_role', { role_name: 'admin' }),
      supabaseUserClient.rpc('current_user_has_role', { role_name: 'super_admin' }),
    ])

  if (adminCheckError || superAdminError) {
    console.error('admin-user-lifecycle-report: role check failed', adminCheckError ?? superAdminError)
    return new Response(JSON.stringify({ error: 'Failed to verify admin status' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  if (!isAdmin && !isSuperAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 403,
    })
  }

  const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  try {
    const allProfiles: {
      id: string
      email: string
      first_name: string
      last_name: string
      onboarding_completed: boolean | null
    }[] = []

    let offset = 0
    let lastPageSize = 0
    while (allProfiles.length < MAX_PROFILES) {
      const remaining = MAX_PROFILES - allProfiles.length
      const take = Math.min(PAGE_SIZE, remaining)

      const { data: page, error: pageError } = await supabaseAdminClient
        .from('profiles')
        .select('id, email, first_name, last_name, onboarding_completed')
        .order('email', { ascending: true })
        .range(offset, offset + take - 1)

      if (pageError) {
        console.error('admin-user-lifecycle-report: profiles page', pageError)
        return new Response(JSON.stringify({ error: 'Failed to load profiles' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      if (!page || page.length === 0) {
        break
      }

      lastPageSize = page.length
      allProfiles.push(...page)
      offset += page.length

      if (page.length < take) {
        break
      }
    }

    const truncated = allProfiles.length >= MAX_PROFILES && lastPageSize === PAGE_SIZE

    const statusesByProfile = new Map<string, string[]>()
    let subOffset = 0
    while (true) {
      const { data: subPage, error: subError } = await supabaseAdminClient
        .from('subscriptions')
        .select('profile_id, status')
        .order('profile_id', { ascending: true })
        .range(subOffset, subOffset + PAGE_SIZE - 1)

      if (subError) {
        console.error('admin-user-lifecycle-report: subscriptions', subError)
        return new Response(JSON.stringify({ error: 'Failed to load subscriptions' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      if (!subPage || subPage.length === 0) {
        break
      }

      for (const row of subPage) {
        const pid = row.profile_id as string
        const status = row.status as string
        const list = statusesByProfile.get(pid)
        if (list) {
          list.push(status)
        } else {
          statusesByProfile.set(pid, [status])
        }
      }

      subOffset += subPage.length
      if (subPage.length < PAGE_SIZE) {
        break
      }
    }

    const countByCategory = new Map<UserLifecycleCategory, number>()
    for (const cat of CATEGORY_ORDER) {
      countByCategory.set(cat, 0)
    }

    const users: {
      id: string
      email: string
      firstName: string
      lastName: string
      category: UserLifecycleCategory
    }[] = []

    for (const profile of allProfiles) {
      const statuses = statusesByProfile.get(profile.id) ?? []
      let hasTrialSub = false
      let hasActiveSub = false
      let hasCanceledSub = false
      let hasAnySub = false

      for (const status of statuses) {
        hasAnySub = true
        if (status === 'trial') hasTrialSub = true
        else if (status === 'active') hasActiveSub = true
        else if (status === 'canceled') hasCanceledSub = true
      }

      const category = categorizeUserLifecycle({
        onboardingCompleted: profile.onboarding_completed === true,
        hasTrialSub,
        hasActiveSub,
        hasCanceledSub,
        hasAnySub,
      })

      countByCategory.set(category, (countByCategory.get(category) ?? 0) + 1)

      users.push({
        id: profile.id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        category,
      })
    }

    const totalProfiles = allProfiles.length
    const summary = CATEGORY_ORDER.map((category) => {
      const count = countByCategory.get(category) ?? 0
      const pct = totalProfiles > 0 ? Math.round((1000 * count) / totalProfiles) / 10 : 0
      return { category, count, pct }
    }).filter((row) => row.category !== 'unclassified' || row.count > 0)

    return new Response(
      JSON.stringify({
        summary,
        users,
        totalProfiles,
        truncated,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('admin-user-lifecycle-report', error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
