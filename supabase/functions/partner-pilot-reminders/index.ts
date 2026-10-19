// Daily: emails university staff (partner_staff) and the Job-Hopper team when a partner
// pilot is about to end (14 and 3 days out) and once after it has ended, so a pilot
// never lapses silently and students don't lose access without anyone deciding to.
// Skips pilots whose partner already has a live paid license (they converted). Each
// reminder is sent at most once (trial_grants.reminder_*_sent_at); a reminder is only
// marked sent when at least one email went out, so a mail outage retries tomorrow.
//
// Scheduler-only, self-rescheduling chain like daily-job-matching (seeded by migration
// 20261019120000).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { isServiceCall } from "../_shared/cron-auth.ts"
import { sendEmail } from "../_shared/email.ts"

const DAY_MS = 86_400_000
// Ended-pilot notices are only sent for pilots that ended recently, so turning this job
// on doesn't email about every pilot that ever expired.
const ENDED_NOTICE_WINDOW_DAYS = 7

const TEAM_EMAIL = Deno.env.get("PARTNER_LEAD_ALERT_EMAIL") || "support@job-hopper.io"

type Kind = "14d" | "3d" | "ended"

const COLUMN: Record<Kind, "reminder_14d_sent_at" | "reminder_3d_sent_at" | "ended_notice_sent_at"> = {
  "14d": "reminder_14d_sent_at",
  "3d": "reminder_3d_sent_at",
  ended: "ended_notice_sent_at",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function randomTimeTomorrowUtc(): string {
  const now = new Date()
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  // Business hours in the US (13:00–17:00 UTC) so the email lands during a work day.
  return new Date(tomorrow + (13 + Math.random() * 4) * 3_600_000).toISOString()
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  if (!isServiceCall(req)) return json({ error: "Unauthorized" }, 401)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server misconfiguration" }, 500)
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Enqueue tomorrow's run first, so the chain survives a failure below. 23505 = the
  // single-pending-chain index says it's already scheduled.
  const { error: chainError } = await db
    .from("scheduled_jobs")
    .insert({ function_name: "partner-pilot-reminders", payload: {}, run_at: randomTimeTomorrowUtc() })
  if (chainError && chainError.code !== "23505") {
    console.error("partner-pilot-reminders: failed to schedule next run", chainError)
  }

  const now = Date.now()
  const { data: pilots, error } = await db
    .from("trial_grants")
    .select("id, institutional_lead_id, organization_name, seat_count, seats_used, expires_at, reminder_14d_sent_at, reminder_3d_sent_at, ended_notice_sent_at")
    .eq("status", "active")
    .not("institutional_lead_id", "is", null)
    .gt("expires_at", new Date(now - ENDED_NOTICE_WINDOW_DAYS * DAY_MS).toISOString())
    .lt("expires_at", new Date(now + 14 * DAY_MS).toISOString())
  if (error) {
    console.error("partner-pilot-reminders: failed to load pilots", error)
    return json({ error: "Failed to load pilots" }, 500)
  }

  const siteUrl = Deno.env.get("SITE_URL") || "https://job-hopper.io"
  const sent: { pilot: string; kind: Kind }[] = []

  for (const pilot of pilots ?? []) {
    const msLeft = new Date(pilot.expires_at).getTime() - now
    const kind: Kind | null = msLeft <= 0
      ? (pilot.ended_notice_sent_at ? null : "ended")
      : msLeft <= 3 * DAY_MS
        ? (pilot.reminder_3d_sent_at ? null : "3d")
        : (pilot.reminder_14d_sent_at ? null : "14d")
    if (!kind) continue

    // Converted to a paid license: the pilot ending changes nothing for students.
    const { data: orgs } = await db
      .from("org_accounts")
      .select("id")
      .eq("institutional_lead_id", pilot.institutional_lead_id)
      .eq("status", "active")
    let converted = false
    for (const org of orgs ?? []) {
      const { data: live } = await db.rpc("org_account_is_live", { p_org_id: org.id })
      if (live === true) converted = true
    }
    if (converted) continue

    const { data: staff } = await db.from("partner_staff").select("email").eq("institutional_lead_id", pilot.institutional_lead_id)

    const org = pilot.organization_name
    const endDate = new Date(pilot.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    const daysLeft = Math.max(1, Math.ceil(msLeft / DAY_MS))
    const students = `${pilot.seats_used} ${pilot.seats_used === 1 ? "student is" : "students are"}`
    const portalUrl = `${siteUrl}/partner`
    const adminUrl = `${siteUrl}/admin/partner-dashboard/${pilot.institutional_lead_id}`

    const staffSubject = kind === "ended"
      ? `${org}: your Job-Hopper pilot has ended`
      : `${org}: your Job-Hopper pilot ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
    const staffLead = kind === "ended"
      ? `Your Job-Hopper pilot ended on ${endDate}, and students' university-provided access has paused.`
      : `Your Job-Hopper pilot ends on ${endDate}. ${students[0].toUpperCase()}${students.slice(1)} using it today, and they lose university-provided access when it ends.`
    const staffAsk = kind === "ended"
      ? "Reply to this email and we'll restore access as soon as you'd like to continue."
      : "To keep your students' access without interruption, reply to this email and we'll set up your license."

    const sends = [
      ...(staff ?? []).map((s) =>
        sendEmail({
          to: s.email,
          subject: staffSubject,
          text: `${staffLead}\n\n${staffAsk}\n\nYour dashboard: ${portalUrl}\n\nJob-Hopper`,
          html: `<p>${escapeHtml(staffLead)}</p><p>${escapeHtml(staffAsk)}</p><p><a href="${portalUrl}">Open your dashboard</a></p><p>Job-Hopper</p>`,
          category: "partner_pilot_reminder",
        })
      ),
      sendEmail({
        to: TEAM_EMAIL,
        subject: kind === "ended" ? `Pilot lapsed: ${org} (${pilot.seats_used} students)` : `Convert: ${org} pilot ends in ${daysLeft}d (${pilot.seats_used} students)`,
        text: `${org}'s pilot ${kind === "ended" ? "ended" : "ends"} on ${endDate}. ${pilot.seats_used}/${pilot.seat_count} seats used.\n\n${adminUrl}`,
        html: `<p><strong>${escapeHtml(org)}</strong>'s pilot ${kind === "ended" ? "ended" : "ends"} on ${escapeHtml(endDate)}. ${pilot.seats_used}/${pilot.seat_count} seats used.</p><p><a href="${adminUrl}">Open partner</a></p>`,
        category: "partner_pilot_reminder",
      }),
    ]
    const results = await Promise.all(sends)
    if (!results.some((r) => r.success)) {
      console.error("partner-pilot-reminders: every send failed; will retry tomorrow", { pilot: pilot.id, kind })
      continue
    }

    // A 3-day reminder also covers the 14-day one (no late 14-day email afterwards).
    const stamp = new Date().toISOString()
    const update = kind === "3d" ? { reminder_3d_sent_at: stamp, reminder_14d_sent_at: pilot.reminder_14d_sent_at ?? stamp } : { [COLUMN[kind]]: stamp }
    await db.from("trial_grants").update(update).eq("id", pilot.id)
    sent.push({ pilot: pilot.id, kind })
  }

  return json({ checked: pilots?.length ?? 0, sent })
})
