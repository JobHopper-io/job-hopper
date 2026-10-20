// Backend for the university partner portal (/partner, university staff) and the shared
// analytics on /admin/partner-dashboard/:leadId and /admin/partners (our admins). One
// file dispatched by `action`, same shape as admin-org-accounts.
//
// Access: a "partner" is an institutional_leads row. Our admins can act on any partner;
// university staff (partner_staff, matched by the caller's auth email) only on their own,
// and only on the read + release-seat actions. Configuration (domains, staff) is
// admin-only. Data is seat holders only, counts/status per student, never which
// companies a given student applied to -- see partner_insights() in the migration.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4"
import Stripe from "npm:stripe@14.21.0"
import { sendEmail } from "../_shared/email.ts"
import { isServiceCall } from "../_shared/cron-auth.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Mirrors the 30-day window in SQL org_account_is_live() (the actual entitlement rule);
// used here only to show the university the date access would pause.
const LICENSE_GRACE_DAYS = 30
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

// Org licenses bill products.price_cents per seat per month (admin-org-accounts sets
// the Stripe subscription quantity to the seat count), so this is the real list value.
async function seatPrices(db: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await db.from("products").select("key, price_cents").eq("category", "base_plan").in("key", ["core", "premium"])
  return Object.fromEntries((data ?? []).map((p) => [p.key as string, p.price_cents as number]))
}

type Action =
  | "notify_seats_full"
  | "request_seats"
  | "resolve_seat_request"
  | "my_partners"
  | "overview"
  | "release_seat"
  | "list_partners"
  | "update_domains"
  | "add_staff"
  | "remove_staff"

interface RequestBody {
  action?: Action
  leadId?: string
  profileId?: string
  emailDomains?: string[]
  email?: string
  /** request_seats: how many more seats the university wants. */
  seats?: number
  note?: string
  requestId?: string
  /** ISO timestamp: scope activity analytics to this period (overview). Omit for all time. */
  since?: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  })
}

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

// Where partner alerts (seats full, seat requests) reach the Job-Hopper team: the same
// inbox submit-partner-lead already alerts for new partner leads.
const TEAM_EMAIL = Deno.env.get("PARTNER_LEAD_ALERT_EMAIL") || "support@job-hopper.io"

function siteUrl(): string {
  return Deno.env.get("SITE_URL") || "https://job-hopper.io"
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server misconfiguration" }, 500)

  // Scheduler-only path (queued by claim_partner_seat when a partner runs out of seats).
  if (isServiceCall(req)) {
    const body = (await req.json().catch(() => ({}))) as RequestBody
    if (body.action !== "notify_seats_full" || !body.leadId) return json({ error: "Unknown service action" }, 400)
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    return await notifySeatsFull(db, body.leadId)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json({ error: "Missing authorization header" }, 401)

  // Same client pair as admin-partner-dashboard: service-role apikey so the role RPC
  // resolves, caller's JWT so auth.uid() inside it is the caller.
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  try {
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user?.email) return json({ error: "Unauthorized" }, 401)
    const callerEmail = user.email.toLowerCase()

    const { data: isAdmin, error: adminError } = await userClient.rpc("current_user_has_role", {
      role_name: "admin",
    })
    if (adminError) {
      console.error("partner-portal: role check failed", adminError)
      return json({ error: "Failed to verify access" }, 500)
    }

    const leadId = (body.leadId ?? "").trim()

    async function isStaffOf(id: string): Promise<boolean> {
      const { data } = await db
        .from("partner_staff")
        .select("id")
        .eq("institutional_lead_id", id)
        .eq("email", callerEmail)
        .maybeSingle()
      return !!data
    }

    // -----------------------------------------------------------------
    // my_partners: which partner portals can the caller open?
    // -----------------------------------------------------------------
    if (body.action === "my_partners") {
      const { data, error } = await db
        .from("partner_staff")
        .select("institutional_leads(id, organization_name)")
        .eq("email", callerEmail)
      if (error) {
        console.error("partner-portal: my_partners failed", error)
        return json({ error: "Failed to load partners" }, 500)
      }
      return json({ partners: (data ?? []).map((r) => r.institutional_leads).filter(Boolean), isAdmin: !!isAdmin })
    }

    // -----------------------------------------------------------------
    // list_partners (admin): every lead with a pilot, paid seats, or domains set up.
    // -----------------------------------------------------------------
    if (body.action === "list_partners") {
      if (!isAdmin) return json({ error: "Admins only" }, 403)

      const [grantsRes, orgsRes, domainLeadsRes, summariesRes, prices, waitlistRes, requestsRes] = await Promise.all([
        db.from("trial_grants").select("institutional_lead_id, seat_count, seats_used, feature_tier, expires_at, status, created_at").not("institutional_lead_id", "is", null),
        db.from("org_accounts").select("institutional_lead_id, seat_count, seats_used, feature_tier, status, created_at, billing_interval, discount_percent, list_price_cents, subscription_id").not("institutional_lead_id", "is", null),
        db.from("institutional_leads").select("id").neq("email_domains", "{}"),
        db.rpc("partner_summaries"),
        seatPrices(db),
        db.from("partner_seat_waitlist").select("institutional_lead_id"),
        db.from("partner_seat_requests").select("institutional_lead_id, seats").is("resolved_at", null),
      ])
      const err = grantsRes.error ?? orgsRes.error ?? domainLeadsRes.error ?? summariesRes.error
      if (err) {
        console.error("partner-portal: list_partners failed", err)
        return json({ error: "Failed to load partners" }, 500)
      }

      const leadIds = new Set<string>([
        ...(grantsRes.data ?? []).map((g) => g.institutional_lead_id as string),
        ...(orgsRes.data ?? []).map((o) => o.institutional_lead_id as string),
        ...(domainLeadsRes.data ?? []).map((l) => l.id),
      ])
      if (leadIds.size === 0) return json({ partners: [] })

      const { data: leads, error: leadsError } = await db
        .from("institutional_leads")
        .select("id, organization_name, category, status, email_domains, student_size, estimated_seats")
        .in("id", [...leadIds])
      if (leadsError) {
        console.error("partner-portal: list_partners leads failed", leadsError)
        return json({ error: "Failed to load partners" }, 500)
      }

      // Latest pilot / paid record per lead; same "latest wins" rule the claim RPC uses.
      const latest = <T extends { institutional_lead_id: string | null; created_at: string }>(rows: T[]) => {
        const m = new Map<string, T>()
        for (const r of rows) {
          const cur = m.get(r.institutional_lead_id!)
          if (!cur || r.created_at > cur.created_at) m.set(r.institutional_lead_id!, r)
        }
        return m
      }
      const pilots = latest(grantsRes.data ?? [])
      const paid = latest(orgsRes.data ?? [])

      // Payment status per license, for the "invoice overdue" flag.
      const licenseSubIds = [...paid.values()].map((o) => o.subscription_id).filter((id): id is string => !!id)
      const { data: licenseSubs } = licenseSubIds.length
        ? await db.from("subscriptions").select("id, status, past_due_since").in("id", licenseSubIds)
        : { data: [] }
      const subById = new Map((licenseSubs ?? []).map((sub) => [sub.id, sub]))

      const summaries = new Map(
        ((summariesRes.data ?? []) as { lead_id: string }[]).map((r) => [r.lead_id, r]),
      )

      return json({
        partners: (leads ?? []).map((l) => ({
          ...l,
          pilot: pilots.get(l.id) ?? null,
          paid: paid.get(l.id)
            ? {
                ...paid.get(l.id)!,
                subscription_status: subById.get(paid.get(l.id)!.subscription_id ?? "")?.status ?? null,
                past_due_since: subById.get(paid.get(l.id)!.subscription_id ?? "")?.past_due_since ?? null,
              }
            : null,
          summary: summaries.get(l.id) ?? null,
          waitlisted: (waitlistRes.data ?? []).filter((w) => w.institutional_lead_id === l.id).length,
          requestedSeats: (requestsRes.data ?? []).filter((r) => r.institutional_lead_id === l.id).reduce((n, r) => n + r.seats, 0),
        })),
        seatPriceCents: prices,
      })
    }

    if (!leadId) return json({ error: "Missing leadId" }, 400)

    const canRead = !!isAdmin || (await isStaffOf(leadId))
    if (!canRead) return json({ error: "You don't have access to this partner" }, 403)

    // -----------------------------------------------------------------
    // overview: everything the dashboard renders.
    // -----------------------------------------------------------------
    if (body.action === "overview") {
      const since = body.since ? new Date(body.since) : null
      if (since && Number.isNaN(since.getTime())) return json({ error: "Invalid period" }, 400)

      const [leadRes, pilotRes, paidRes, staffRes, insightsRes, prices, requestsRes] = await Promise.all([
        db.from("institutional_leads").select("id, organization_name, category, email_domains").eq("id", leadId).maybeSingle(),
        db.from("trial_grants").select("id, seat_count, seats_used, feature_tier, expires_at, status, invite_code, created_at").eq("institutional_lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("org_accounts").select("id, seat_count, seats_used, feature_tier, status, created_at, billing_interval, discount_percent, list_price_cents, subscription_id").eq("institutional_lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("partner_staff").select("email, created_at").eq("institutional_lead_id", leadId).order("created_at"),
        db.rpc("partner_insights", { p_lead_id: leadId, p_since: since?.toISOString() ?? null }),
        isAdmin ? seatPrices(db) : Promise.resolve(null),
        db.from("partner_seat_requests").select("id, requested_by, seats, note, created_at").eq("institutional_lead_id", leadId).is("resolved_at", null).order("created_at"),
      ])
      const err = leadRes.error ?? pilotRes.error ?? paidRes.error ?? staffRes.error ?? insightsRes.error
      if (err) {
        console.error("partner-portal: overview failed", err)
        return json({ error: "Failed to load partner dashboard" }, 500)
      }
      if (!leadRes.data) return json({ error: "Partner not found" }, 404)

      const billing = paidRes.data ? await licenseBilling(db, paidRes.data.subscription_id) : null

      // Fallback for a missed invoice.paid webhook: a pay-first license whose first
      // invoice Stripe reports paid goes live on the next dashboard load.
      if (paidRes.data?.status === "pending_payment" && billing?.latestInvoice?.status === "paid") {
        const { error: activateError } = await db.from("org_accounts").update({ status: "active" }).eq("id", paidRes.data.id).eq("status", "pending_payment")
        if (activateError) console.error("partner-portal: could not activate paid license", activateError)
        else paidRes.data.status = "active"
      }

      return json({
        lead: leadRes.data,
        pilot: pilotRes.data,
        paid: paidRes.data,
        staff: staffRes.data ?? [],
        insights: insightsRes.data,
        isAdmin: !!isAdmin,
        // List prices are for our admins only; the university sees its own license terms
        // and invoices (billing) since it is the customer paying them.
        seatPriceCents: prices,
        billing,
        seatRequests: requestsRes.data ?? [],
      })
    }

    // -----------------------------------------------------------------
    // release_seat: free a student's seat (graduated/left). The seat goes back into the
    // pool -- unlike admin-org-accounts' revoke_seat, the purchased seat count and the
    // Stripe quantity are unchanged. Blocks the domain auto-claim from re-granting it.
    // -----------------------------------------------------------------
    if (body.action === "release_seat") {
      const profileId = (body.profileId ?? "").trim()
      if (!profileId) return json({ error: "Missing profileId" }, 400)

      const { data: profile } = await db
        .from("profiles")
        .select("id, email, trial_grant_id, org_account_id")
        .eq("id", profileId)
        .maybeSingle()

      const [{ data: grant }, { data: org }] = await Promise.all([
        db.from("trial_grants").select("id, institutional_lead_id, seats_used").eq("id", profile?.trial_grant_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle(),
        db.from("org_accounts").select("id, institutional_lead_id, seats_used").eq("id", profile?.org_account_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle(),
      ])
      const ownsGrant = grant?.institutional_lead_id === leadId
      const ownsOrg = org?.institutional_lead_id === leadId
      if (!profile || (!ownsGrant && !ownsOrg)) return json({ error: "That student doesn't hold a seat here" }, 404)

      const email = profile.email.toLowerCase()
      // ponytail: read-then-write seat counters, same as admin-org-accounts' revoke;
      // move into one SQL function if two people release seats concurrently in practice.
      if (ownsOrg) {
        await db.from("org_seat_invites").update({ revoked_at: new Date().toISOString() }).eq("org_account_id", org!.id).eq("email", email)
        await db.from("org_accounts").update({ seats_used: Math.max(0, org!.seats_used - 1) }).eq("id", org!.id)
      }
      if (ownsGrant) {
        await db.from("trial_grants").update({ seats_used: Math.max(0, grant!.seats_used - 1) }).eq("id", grant!.id)
      }
      const { error: unlinkError } = await db
        .from("profiles")
        .update({
          ...(ownsOrg ? { org_account_id: null } : {}),
          ...(ownsGrant ? { trial_grant_id: null } : {}),
          partner_seat_claimed_at: null,
        })
        .eq("id", profileId)
      if (unlinkError) {
        console.error("partner-portal: release unlink failed", unlinkError)
        return json({ error: "Failed to release seat" }, 500)
      }
      await db.from("partner_seat_releases").upsert({ institutional_lead_id: leadId, email, released_by: user.id })

      return json({ released: profileId })
    }

    // -----------------------------------------------------------------
    // request_seats: the university asks for more seats (staff or admin). Recorded for
    // the admin page and emailed to the Job-Hopper team, who add them to the license.
    // -----------------------------------------------------------------
    if (body.action === "request_seats") {
      const seats = Number(body.seats)
      if (!Number.isInteger(seats) || seats < 1 || seats > 100_000) return json({ error: "Enter how many seats you need" }, 400)
      const note = (body.note ?? "").trim().slice(0, 1000) || null

      const { error } = await db
        .from("partner_seat_requests")
        .insert({ institutional_lead_id: leadId, requested_by: callerEmail, seats, note })
      if (error) {
        console.error("partner-portal: request_seats failed", error)
        return json({ error: "Failed to send your request" }, 500)
      }

      const { data: lead } = await db.from("institutional_leads").select("organization_name").eq("id", leadId).single()
      const org = lead?.organization_name ?? "A partner"
      const adminUrl = `${siteUrl()}/admin/partner-dashboard/${leadId}`
      await sendEmail({
        to: TEAM_EMAIL,
        subject: `Seat request: ${org} wants ${seats} more seats`,
        text: `${callerEmail} at ${org} requested ${seats} more seats.${note ? `\n\nNote: ${note}` : ""}\n\nAdd seats: ${adminUrl}`,
        html: `<p><strong>${escapeHtml(callerEmail)}</strong> at <strong>${escapeHtml(org)}</strong> requested <strong>${seats}</strong> more seats.</p>${note ? `<p>Note: ${escapeHtml(note)}</p>` : ""}<p><a href="${adminUrl}">Add seats</a></p>`,
        category: "partner_seat_request",
      })
      return json({ requested: seats })
    }

    // Everything below configures the partner: admin only.
    if (!isAdmin) return json({ error: "Admins only" }, 403)

    if (body.action === "update_domains") {
      const domains = [...new Set((body.emailDomains ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))]
      const bad = domains.filter((d) => !DOMAIN_RE.test(d))
      if (bad.length) return json({ error: `Not a valid domain: ${bad.join(", ")}` }, 400)
      const generic = domains.filter((d) => ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"].includes(d))
      if (generic.length) return json({ error: `A public email provider can't be a partner domain: ${generic.join(", ")}` }, 400)

      const { error } = await db.from("institutional_leads").update({ email_domains: domains }).eq("id", leadId)
      if (error) {
        console.error("partner-portal: update_domains failed", error)
        return json({ error: "Failed to save domains" }, 500)
      }
      return json({ emailDomains: domains })
    }

    if (body.action === "add_staff") {
      const email = (body.email ?? "").trim().toLowerCase()
      if (!EMAIL_RE.test(email)) return json({ error: "A valid email is required" }, 400)

      const { error } = await db
        .from("partner_staff")
        .upsert({ institutional_lead_id: leadId, email, created_by: user.id }, { onConflict: "institutional_lead_id,email" })
      if (error) {
        console.error("partner-portal: add_staff failed", error)
        return json({ error: "Failed to add staff member" }, 500)
      }

      const { data: lead } = await db.from("institutional_leads").select("organization_name").eq("id", leadId).single()
      const org = lead?.organization_name ?? "your institution"
      const siteUrl = Deno.env.get("SITE_URL") || "https://job-hopper.io"
      const url = `${siteUrl}/partner`
      // Best-effort, like the seat invite emails: the staff row grants access either way.
      const sent = await sendEmail({
        to: email,
        subject: `Your ${org} partner dashboard on Job-Hopper`,
        text: `You've been given access to the ${org} partner dashboard on Job-Hopper, where you can see how your students are using their seats.\n\nSign in (or create an account with this email, ${email}): ${url}\n\nJob-Hopper`,
        html: `<p>You've been given access to the <strong>${escapeHtml(org)}</strong> partner dashboard on Job-Hopper, where you can see how your students are using their seats.</p><p>Sign in, or create an account with this email (${escapeHtml(email)}): <a href="${url}">${url}</a></p><p>Job-Hopper</p>`,
        category: "partner_staff_invite",
      })
      return json({ added: email, emailSent: sent.success })
    }

    if (body.action === "resolve_seat_request") {
      const { error } = await db
        .from("partner_seat_requests")
        .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
        .eq("id", body.requestId ?? "")
        .eq("institutional_lead_id", leadId)
      if (error) return json({ error: "Failed to resolve request" }, 500)
      return json({ resolved: body.requestId })
    }

    if (body.action === "remove_staff") {
      const email = (body.email ?? "").trim().toLowerCase()
      const { error } = await db.from("partner_staff").delete().eq("institutional_lead_id", leadId).eq("email", email)
      if (error) {
        console.error("partner-portal: remove_staff failed", error)
        return json({ error: "Failed to remove staff member" }, 500)
      }
      return json({ removed: email })
    }

    return json({ error: "Unknown action" }, 400)
  } catch (error) {
    console.error("partner-portal: unexpected error", error)
    return json({ error: "Internal server error" }, 500)
  }
})

// Live billing state for the university's billing card: the license terms plus the
// latest Stripe invoice (amount, due date, paid/open, and the hosted pay link). A Stripe
// outage degrades to terms-only rather than failing the whole dashboard.
async function licenseBilling(db: SupabaseClient, subscriptionId: string | null) {
  if (!subscriptionId) return null
  const { data: sub } = await db
    .from("subscriptions")
    .select("status, current_period_ends_at, stripe_subscription_id, past_due_since")
    .eq("id", subscriptionId)
    .maybeSingle()
  if (!sub) return null

  const graceEndsAt = sub.status === "past_due" && sub.past_due_since
    ? new Date(new Date(sub.past_due_since).getTime() + LICENSE_GRACE_DAYS * 86_400_000).toISOString()
    : null

  let latestInvoice = null
  try {
    const invoices = await stripe.invoices.list({ subscription: sub.stripe_subscription_id, limit: 1 })
    const inv = invoices.data[0]
    if (inv) {
      latestInvoice = {
        status: inv.status,
        totalCents: inv.total,
        amountDueCents: inv.amount_remaining,
        dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        url: inv.hosted_invoice_url,
        number: inv.number,
      }
    }
  } catch (err) {
    console.error("partner-portal: could not load latest invoice", err)
  }
  return {
    subscriptionStatus: sub.status,
    renewsAt: sub.current_period_ends_at,
    pastDueSince: sub.past_due_since,
    graceEndsAt,
    accessPaused: !!graceEndsAt && new Date(graceEndsAt).getTime() <= Date.now(),
    latestInvoice,
  }
}

async function notifySeatsFull(db: SupabaseClient, leadId: string): Promise<Response> {
  const [{ data: lead }, { data: staff }, { count: waiting }] = await Promise.all([
    db.from("institutional_leads").select("organization_name").eq("id", leadId).maybeSingle(),
    db.from("partner_staff").select("email").eq("institutional_lead_id", leadId),
    db.from("partner_seat_waitlist").select("email", { count: "exact", head: true }).eq("institutional_lead_id", leadId),
  ])
  if (!lead) return json({ error: "Partner not found" }, 404)

  const org = lead.organization_name
  const n = waiting ?? 0
  const students = `${n} ${n === 1 ? "student is" : "students are"}`
  const portalUrl = `${siteUrl()}/partner`
  const adminUrl = `${siteUrl()}/admin/partner-dashboard/${leadId}`
  const sends = [
    ...(staff ?? []).map((s) =>
      sendEmail({
        to: s.email,
        subject: `${org}: all Job-Hopper seats are in use`,
        text: `Every seat in your Job-Hopper program is taken, and ${students} waiting for access. Waiting students get a seat automatically as soon as one is available.\n\nRequest more seats or free up seats from graduated students: ${portalUrl}`,
        html: `<p>Every seat in your Job-Hopper program is taken, and <strong>${students} waiting</strong> for access. Waiting students get a seat automatically as soon as one is available.</p><p><a href="${portalUrl}">Request more seats</a> or free up seats from graduated students.</p>`,
        category: "partner_seats_full",
      })
    ),
    sendEmail({
      to: TEAM_EMAIL,
      subject: `Upsell: ${org} is out of seats (${n} waiting)`,
      text: `${org} has no free seats and ${students} waiting.\n\n${adminUrl}`,
      html: `<p><strong>${escapeHtml(org)}</strong> has no free seats and ${students} waiting.</p><p><a href="${adminUrl}">Open partner</a></p>`,
      category: "partner_seats_full",
    }),
  ]
  const results = await Promise.all(sends)
  return json({ notified: results.filter((r) => r.success).length })
}
