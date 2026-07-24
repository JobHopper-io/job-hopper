import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { deriveAcquisitionChannel } from '../_shared/acquisition-channel.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 1000
const MAX_ROWS = 20000

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
    console.error('admin-acquisition-channel-report: role check failed', adminCheckError ?? superAdminError)
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

  type FetchFilter = { column: string; op: 'eq'; value: string } | { column: string; op: 'in'; values: string[] }

  /** Paginate through a table with `.select(columns)`, up to MAX_ROWS, collecting all pages. */
  async function fetchAll<T>(table: string, columns: string, filter?: FetchFilter): Promise<T[]> {
    const all: T[] = []
    let offset = 0
    while (all.length < MAX_ROWS) {
      const remaining = MAX_ROWS - all.length
      const take = Math.min(PAGE_SIZE, remaining)
      let query = supabaseAdminClient.from(table).select(columns)
      if (filter?.op === 'eq') query = query.eq(filter.column, filter.value)
      else if (filter?.op === 'in') query = query.in(filter.column, filter.values)
      const { data: page, error: pageError } = await query.range(offset, offset + take - 1)
      if (pageError) {
        throw new Error(`Failed to load ${table}: ${pageError.message}`)
      }
      if (!page || page.length === 0) break
      all.push(...(page as T[]))
      offset += page.length
      if (page.length < take) break
    }
    return all
  }

  try {
    const profiles = await fetchAll<{
      id: string
      landing_path: string | null
      utm_source: string | null
      referrer_host: string | null
    }>('profiles', 'id, landing_path, utm_source, referrer_host')

    const channelByProfileId = new Map<string, string>()
    const signupsByChannel = new Map<string, number>()
    for (const profile of profiles) {
      const channel = deriveAcquisitionChannel(profile)
      channelByProfileId.set(profile.id, channel)
      signupsByChannel.set(channel, (signupsByChannel.get(channel) ?? 0) + 1)
    }

    // 'trial' counts as converted (they picked a paid plan), same definition resolveBaseTier
    // uses; 'past_due' is deliberately excluded (non-entitling, see base-tier.ts).
    const entitledSubs = await fetchAll<{ profile_id: string }>('subscriptions', 'profile_id', {
      column: 'status',
      op: 'in',
      values: ['trial', 'active'],
    })
    const payingProfileIds = new Set(entitledSubs.map((sub) => sub.profile_id))
    const payingByChannel = new Map<string, number>()
    for (const profileId of payingProfileIds) {
      const channel = channelByProfileId.get(profileId)
      if (channel) {
        payingByChannel.set(channel, (payingByChannel.get(channel) ?? 0) + 1)
      }
    }

    const rows = Array.from(signupsByChannel.entries())
      .map(([channel, signups]) => {
        const payingConversions = payingByChannel.get(channel) ?? 0
        return {
          channel,
          signups,
          payingConversions,
          conversionRate: signups > 0 ? payingConversions / signups : 0,
        }
      })
      .sort((a, b) => b.signups - a.signups)

    return new Response(
      JSON.stringify({
        rows,
        totalSignups: profiles.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('admin-acquisition-channel-report', error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
