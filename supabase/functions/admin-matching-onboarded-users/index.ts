import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 1000
const MAX_PROFILES = 10000

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
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

  // apikey uses the service-role key (not anon) so the PostgREST `current_user_has_role`
  // RPC calls succeed; Authorization still forwards the caller's own JWT, so auth.uid()
  // inside that function resolves to the caller, not an elevated identity.
  const supabaseUserClient = createClient(supabaseUrl, serviceRoleKey, {
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
    console.error('admin-matching-onboarded-users: role check failed', adminCheckError ?? superAdminError)
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
      email: string | null
      first_name: string | null
      last_name: string | null
    }[] = []

    let offset = 0
    let lastPageSize = 0
    while (allProfiles.length < MAX_PROFILES) {
      const remaining = MAX_PROFILES - allProfiles.length
      const take = Math.min(PAGE_SIZE, remaining)

      const { data: page, error: pageError } = await supabaseAdminClient
        .from('profiles')
        .select('id, email, first_name, last_name')
        .eq('onboarding_completed', true)
        .order('email', { ascending: true, nullsFirst: false })
        .range(offset, offset + take - 1)

      if (pageError) {
        console.error('admin-matching-onboarded-users: profiles page', pageError)
        return new Response(JSON.stringify({ error: 'Failed to load profiles' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      if (!page || page.length === 0) {
        break
      }

      lastPageSize = page.length
      allProfiles.push(...(page as typeof allProfiles))
      offset += page.length

      if (page.length < take) {
        break
      }
    }

    const truncated = allProfiles.length >= MAX_PROFILES && lastPageSize === PAGE_SIZE

    const profileIds = allProfiles.map((p) => p.id)
    const activeProfileIdSet = new Set<string>()

    for (const idChunk of chunk(profileIds, 200)) {
      if (idChunk.length === 0) continue
      const { data: subRows, error: subError } = await supabaseAdminClient
        .from('subscriptions')
        .select('profile_id')
        .in('status', ['trial', 'active'])
        .in('profile_id', idChunk)

      if (subError) {
        console.error('admin-matching-onboarded-users: subscriptions', subError)
        return new Response(JSON.stringify({ error: 'Failed to load subscription status' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      for (const row of subRows ?? []) {
        const pid = row.profile_id as string | undefined
        if (pid) activeProfileIdSet.add(pid)
      }
    }

    const subscribers = allProfiles.map((p) => ({
      id: p.id,
      email: p.email,
      firstName: p.first_name,
      lastName: p.last_name,
      hasActiveSubscription: activeProfileIdSet.has(p.id),
    }))

    return new Response(
      JSON.stringify({
        subscribers,
        truncated,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('admin-matching-onboarded-users', error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
