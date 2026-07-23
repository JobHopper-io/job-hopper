import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

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
    console.error('admin-seo-performance-report: role check failed', adminCheckError ?? superAdminError)
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

  /** Paginate through a table with `.select(columns)`, up to MAX_ROWS, collecting all pages. */
  async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
    const all: T[] = []
    let offset = 0
    while (all.length < MAX_ROWS) {
      const remaining = MAX_ROWS - all.length
      const take = Math.min(PAGE_SIZE, remaining)
      let query = supabaseAdminClient.from(table).select(columns).range(offset, offset + take - 1)
      if (filter) query = filter(query)
      const { data: page, error: pageError } = await query
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
    const seoPages = await fetchAll<{ url_path: string; page_type: string | null; h1: string | null }>(
      'seo_pages',
      'url_path, page_type, h1',
    )

    const pageViews = await fetchAll<{ url_path: string; views: number }>('seo_page_views', 'url_path, views')
    const viewsByPath = new Map<string, number>()
    for (const row of pageViews) {
      viewsByPath.set(row.url_path, (viewsByPath.get(row.url_path) ?? 0) + row.views)
    }

    const profilesWithLanding = await fetchAll<{ id: string; landing_path: string }>(
      'profiles',
      'id, landing_path',
      (q) => q.not('landing_path', 'is', null),
    )
    const signupsByPath = new Map<string, number>()
    const landingPathByProfileId = new Map<string, string>()
    for (const profile of profilesWithLanding) {
      signupsByPath.set(profile.landing_path, (signupsByPath.get(profile.landing_path) ?? 0) + 1)
      landingPathByProfileId.set(profile.id, profile.landing_path)
    }

    const activeSubs = await fetchAll<{ profile_id: string }>('subscriptions', 'profile_id', (q) =>
      q.eq('status', 'active'),
    )
    const payingByPath = new Map<string, number>()
    for (const sub of activeSubs) {
      const landingPath = landingPathByProfileId.get(sub.profile_id)
      if (landingPath) {
        payingByPath.set(landingPath, (payingByPath.get(landingPath) ?? 0) + 1)
      }
    }

    const rows = seoPages.map((page) => ({
      urlPath: page.url_path,
      pageType: page.page_type ?? 'listing',
      h1: page.h1,
      views: viewsByPath.get(page.url_path) ?? 0,
      signups: signupsByPath.get(page.url_path) ?? 0,
      payingConversions: payingByPath.get(page.url_path) ?? 0,
    }))

    return new Response(
      JSON.stringify({
        rows,
        totalRows: rows.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('admin-seo-performance-report', error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
