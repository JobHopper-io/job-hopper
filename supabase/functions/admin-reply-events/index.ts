// Admin-only reply_events for /admin/reply-classification: replies with their
// classify-replies output (class, extracted need, draft, owner, next action), joined back
// to the source institutional lead. The only write is action 'mark_handled' (sets
// handled_at); classification/exclusion writes are classify-replies's job. Drafts are
// shown for copying, never sent from here. Same admin-role-check shape as
// admin-institutional-leads.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REPLY_COLUMNS = [
  'id, from_email, raw_subject, raw_body, received_at, reply_class, processed, institutional_lead_id, prospect_id, profile_id',
  'audience, extracted, draft_response, draft_generated_at, next_action, next_action_due, handled_at',
  'classify_attempts, last_classify_error, needs_manual_review, assigned_to',
  'institutional_leads(organization_name, category, campaign)',
  'owner:profiles!reply_events_assigned_to_fkey(first_name, last_name, email)',
].join(', ')

type View = 'all' | 'open' | 'overdue' | 'manual_review'

interface RequestBody {
  action?: 'list' | 'mark_handled'
  replyId?: string
  view?: View
  replyClass?: string
  search?: string
  limit?: number
  offset?: number
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  // apikey uses the service-role key (not anon) so the PostgREST `current_user_has_role`
  // RPC call succeeds; Authorization still forwards the caller's own JWT, so auth.uid()
  // inside that function resolves to the caller, not an elevated identity.
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc('current_user_has_role', {
      role_name: 'admin',
    })

    if (adminError) {
      console.error('admin-reply-events: role check failed', adminError)
      return new Response(JSON.stringify({ error: 'Failed to verify admin status' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Only admins can access reply events' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    if (body.action === 'mark_handled') {
      if (!body.replyId || !/^[0-9a-f-]{36}$/i.test(body.replyId)) {
        return new Response(JSON.stringify({ error: 'replyId is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }
      const { data: handled, error: handledError } = await serviceClient
        .from('reply_events')
        .update({ handled_at: new Date().toISOString() })
        .eq('id', body.replyId)
        .is('handled_at', null)
        .select('id, handled_at')
      if (handledError) {
        console.error('admin-reply-events: mark handled failed', handledError)
        return new Response(JSON.stringify({ error: 'Failed to mark handled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
      return new Response(JSON.stringify({ handled: handled?.[0] ?? null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const replyClass = (body.replyClass ?? '').trim()
    const view: View = body.view === 'open' || body.view === 'overdue' || body.view === 'manual_review' ? body.view : 'all'
    const search = (body.search ?? '').trim()
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)
    const offset = Math.max(body.offset ?? 0, 0)

    let query = serviceClient
      .from('reply_events')
      .select(REPLY_COLUMNS, { count: 'exact' })
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (replyClass) query = query.eq('reply_class', replyClass)
    if (view === 'open' || view === 'overdue') query = query.is('handled_at', null).not('next_action', 'is', null)
    if (view === 'overdue') query = query.lt('next_action_due', new Date().toISOString())
    if (view === 'manual_review') query = query.eq('needs_manual_review', true)
    if (search) query = query.ilike('from_email', `%${search}%`)

    const { data: replies, error: repliesError, count } = await query

    if (repliesError) {
      console.error('admin-reply-events: error loading replies', repliesError)
      return new Response(JSON.stringify({ error: 'Failed to load reply events' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    return new Response(
      JSON.stringify({ replies: replies ?? [], total: count ?? (replies ?? []).length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (error) {
    console.error('admin-reply-events: unexpected error', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
