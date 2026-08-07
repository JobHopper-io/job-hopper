import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4"
import { sendEmail } from "./email.ts"
import { wrapAnnouncementWithFooter } from "./email-templates.ts"
import { getFooterLinksForProfile } from "./unsubscribe-token.ts"

export type SystemAnnouncementSendResult =
  | { ok: true; sent: number; failed: number; totalEligible: number }
  | { ok: false; status: number; error: string }

/**
 * Loads a published system_announcements row, finds every profile opted into announcement
 * emails and not unsubscribed, and sends to all of them - no artificial cap. Shared by
 * send-system-announcement (the original manual SQL-insert + invoke workflow) and
 * admin-send-announcement (the admin UI) so there's one send path, not two to keep in sync.
 */
export async function sendSystemAnnouncement(
  supabase: SupabaseClient,
  announcementId: string,
): Promise<SystemAnnouncementSendResult> {
  const { data: announcement, error: annError } = await supabase
    .from("system_announcements")
    .select("id, email_subject, email_body_html, published_at")
    .eq("id", announcementId)
    .single()

  if (annError || !announcement) {
    return { ok: false, status: 404, error: "Announcement not found" }
  }

  if (!announcement.published_at) {
    return { ok: false, status: 400, error: "Announcement is not published" }
  }

  // Profiles that are allowed to receive system announcements (not unsubscribed, opted in).
  const { data: settingsRows, error: settingsError } = await supabase
    .from("notification_settings")
    .select("profile_id")
    .is("email_unsubscribed_at", null)
    .eq("system_announcements_email_enabled", true)

  if (settingsError) {
    console.error("sendSystemAnnouncement: failed to load notification_settings", settingsError)
    return { ok: false, status: 500, error: "Failed to load recipients" }
  }

  const profileIds = (settingsRows ?? []).map((r: { profile_id: string }) => r.profile_id)
  if (profileIds.length === 0) {
    return { ok: true, sent: 0, failed: 0, totalEligible: 0 }
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", profileIds)

  const recipients = (profiles ?? []).filter((p: { email: string | null }) => p.email)

  let sent = 0
  let failed = 0
  for (const profile of recipients) {
    try {
      const footer = await getFooterLinksForProfile(profile.id)
      const fullHtml = wrapAnnouncementWithFooter(announcement.email_body_html, {
        preferencesUrl: footer.preferencesUrl,
        unsubscribeUrl: footer.unsubscribeUrl,
      })
      const result = await sendEmail({
        to: profile.email,
        subject: announcement.email_subject,
        html: fullHtml,
        profileId: profile.id,
        eventType: "system_announcement",
        templateKey: "system_announcement",
        payload: { announcement_id: announcementId },
        supabase,
      })
      if (result.success) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return { ok: true, sent, failed, totalEligible: profileIds.length }
}
