/**
 * Email template helpers for job match digest, subscription updates, and system announcements.
 * All templates include a footer with unsubscribe and preferences links.
 */

export interface JobSummary {
  id: number
  title: string | null
  companyName: string | null
  location: string | null
  description?: string | null
  aiBriefing?: string | null
  applyLink: string | null
}

export interface TemplateFooterOptions {
  preferencesUrl: string
  unsubscribeUrl: string
}

const DEFAULT_FOOTER_OPTIONS: TemplateFooterOptions = {
  preferencesUrl: "/profile", // relative; caller should resolve to full URL
  unsubscribeUrl: "#", // caller must replace with signed unsubscribe link
}

function footerHtml(opts: Partial<TemplateFooterOptions> = {}): string {
  const { preferencesUrl, unsubscribeUrl } = { ...DEFAULT_FOOTER_OPTIONS, ...opts }
  return `
<div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 12px; color: #666;">
  <p>Job-Hopper – curated job matches for you.</p>
  <p>
    <a href="${preferencesUrl}">Manage email preferences</a> ·
    <a href="${unsubscribeUrl}">Unsubscribe from all emails</a>
  </p>
</div>`
}

/**
 * Build HTML and plain text for job match digest.
 */
export function renderJobMatchDigest(params: {
  recipientName: string
  jobs: JobSummary[]
  dashboardUrl: string
  footer?: Partial<TemplateFooterOptions>
}): { html: string; text: string } {
  const { recipientName, jobs, dashboardUrl, footer } = params
  const prefsUrl = footer?.preferencesUrl ?? DEFAULT_FOOTER_OPTIONS.preferencesUrl
  const unsubUrl = footer?.unsubscribeUrl ?? DEFAULT_FOOTER_OPTIONS.unsubscribeUrl

  const jobBlocks = jobs
    .map(
      (j) => {
        const preview = jobMatchDigestPreview(j)
        return `
  <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
    <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem;">${escapeHtml(j.title ?? "Job")} at ${escapeHtml(j.companyName ?? "Company")}</h3>
    <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #555;">${escapeHtml(j.location ?? "")}</p>
    ${preview ? `<p style="margin: 0 0 0.75rem 0; font-size: 0.9rem;">${escapeHtml(preview)}</p>` : ""}
    <a href="${escapeHtml(j.applyLink ?? "#")}" style="display: inline-block; padding: 0.5rem 1rem; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Apply</a>
  </div>`
      }
    )
    .join("")

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your new job matches</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem;">
  <h1 style="font-size: 1.5rem;">Hi ${escapeHtml(recipientName)},</h1>
  <p>Here are new job matches we picked for you.</p>
  ${jobBlocks}
  <p><a href="${escapeHtml(dashboardUrl)}">View all matches in your dashboard</a></p>
  ${footerHtml({ preferencesUrl: prefsUrl, unsubscribeUrl: unsubUrl })}
</body>
</html>`

  const textLines = [
    `Hi ${recipientName},`,
    "Here are new job matches for you.",
    "",
    ...jobs.flatMap((j) => {
      const preview = jobMatchDigestPreview(j)
      const lines = [
        `${j.title ?? "Job"} at ${j.companyName ?? "Company"}`,
        j.location ?? "",
      ]
      if (preview) lines.push(preview)
      lines.push(`Apply: ${j.applyLink ?? ""}`, "")
      return lines
    }),
    `View all: ${dashboardUrl}`,
    "",
    "Manage preferences: " + prefsUrl,
    "Unsubscribe: " + unsubUrl,
  ]
  const text = textLines.join("\n")

  return { html, text }
}

/**
 * Subscription started (welcome) email.
 */
export function renderSubscriptionStarted(params: {
  recipientName: string
  footer?: Partial<TemplateFooterOptions>
}): { html: string; text: string } {
  const { recipientName, footer } = params
  const prefsUrl = footer?.preferencesUrl ?? DEFAULT_FOOTER_OPTIONS.preferencesUrl
  const unsubUrl = footer?.unsubscribeUrl ?? DEFAULT_FOOTER_OPTIONS.unsubscribeUrl

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Welcome to Job-Hopper</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem;">
  <h1 style="font-size: 1.5rem;">Welcome, ${escapeHtml(recipientName)}</h1>
  <p>Thanks for subscribing. We'll match jobs to your profile and send them to your feed. Depending on your settings, we may also email you new matches (immediate, daily, or weekly).</p>
  <p>You can update your preferences and notification frequency anytime from your profile.</p>
  ${footerHtml({ preferencesUrl: prefsUrl, unsubscribeUrl: unsubUrl })}
</body>
</html>`

  const text = [
    `Welcome, ${recipientName}`,
    "Thanks for subscribing. We'll match jobs to your profile and send them to your feed. You can update notification preferences from your profile.",
    "Manage preferences: " + prefsUrl,
    "Unsubscribe: " + unsubUrl,
  ].join("\n")

  return { html, text }
}

/**
 * Subscription updated email.
 */
export function renderSubscriptionUpdated(params: {
  recipientName: string
  planName?: string
  nextBillingDate?: string
  footer?: Partial<TemplateFooterOptions>
}): { html: string; text: string } {
  const { recipientName, planName, nextBillingDate, footer } = params
  const prefsUrl = footer?.preferencesUrl ?? DEFAULT_FOOTER_OPTIONS.preferencesUrl
  const unsubUrl = footer?.unsubscribeUrl ?? DEFAULT_FOOTER_OPTIONS.unsubscribeUrl

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your subscription was updated</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem;">
  <h1 style="font-size: 1.5rem;">Hi ${escapeHtml(recipientName)},</h1>
  <p>Your Job-Hopper subscription was updated.</p>
  ${planName ? `<p><strong>Plan:</strong> ${escapeHtml(planName)}</p>` : ""}
  ${nextBillingDate ? `<p><strong>Next billing date:</strong> ${escapeHtml(nextBillingDate)}</p>` : ""}
  <p>If you have questions, contact support.</p>
  ${footerHtml({ preferencesUrl: prefsUrl, unsubscribeUrl: unsubUrl })}
</body>
</html>`

  const text = [
    `Hi ${recipientName},`,
    "Your Job-Hopper subscription was updated.",
    planName ? `Plan: ${planName}` : "",
    nextBillingDate ? `Next billing: ${nextBillingDate}` : "",
    "Manage preferences: " + prefsUrl,
    "Unsubscribe: " + unsubUrl,
  ]
    .filter(Boolean)
    .join("\n")

  return { html, text }
}

/**
 * Subscription cancellation scheduled email.
 */
export function renderSubscriptionCancelScheduled(params: {
  recipientName: string
  cancelAtDate?: string
  footer?: Partial<TemplateFooterOptions>
}): { html: string; text: string } {
  const { recipientName, cancelAtDate, footer } = params
  const prefsUrl = footer?.preferencesUrl ?? DEFAULT_FOOTER_OPTIONS.preferencesUrl
  const unsubUrl = footer?.unsubscribeUrl ?? DEFAULT_FOOTER_OPTIONS.unsubscribeUrl

  const dateLine = cancelAtDate
    ? ` Your access will continue until <strong>${escapeHtml(cancelAtDate)}</strong>.`
    : ''

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your subscription will be canceled</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem;">
  <h1 style="font-size: 1.5rem;">Hi ${escapeHtml(recipientName)},</h1>
  <p>You've scheduled your Job-Hopper subscription to be canceled at the end of your current billing period.${dateLine}</p>
  <p>You’ll keep access to Job-Hopper and your job matches until your subscription ends. You can change your mind and update your subscription anytime from your billing settings.</p>
  ${footerHtml({ preferencesUrl: prefsUrl, unsubscribeUrl: unsubUrl })}
</body>
</html>`

  const textParts = [
    `Hi ${recipientName},`,
    "You've scheduled your Job-Hopper subscription to be canceled at the end of your current billing period.",
  ]
  if (cancelAtDate) {
    textParts.push(`Your access will continue until ${cancelAtDate}.`)
  }
  textParts.push(
    "You’ll keep access to Job-Hopper and your job matches until your subscription ends. You can change your mind and update your subscription anytime from your billing settings.",
    "Manage preferences: " + prefsUrl,
    "Unsubscribe: " + unsubUrl,
  )

  const text = textParts.join("\n")

  return { html, text }
}

/**
 * Subscription canceled email.
 */
export function renderSubscriptionCanceled(params: {
  recipientName: string
  footer?: Partial<TemplateFooterOptions>
}): { html: string; text: string } {
  const { recipientName, footer } = params
  const prefsUrl = footer?.preferencesUrl ?? DEFAULT_FOOTER_OPTIONS.preferencesUrl
  const unsubUrl = footer?.unsubscribeUrl ?? DEFAULT_FOOTER_OPTIONS.unsubscribeUrl

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Subscription canceled</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem;">
  <h1 style="font-size: 1.5rem;">Hi ${escapeHtml(recipientName)},</h1>
  <p>Your Job-Hopper subscription has been canceled. You can re-subscribe anytime from the app.</p>
  ${footerHtml({ preferencesUrl: prefsUrl, unsubscribeUrl: unsubUrl })}
</body>
</html>`

  const text = [
    `Hi ${recipientName},`,
    "Your Job-Hopper subscription has been canceled. You can re-subscribe anytime from the app.",
    "Manage preferences: " + prefsUrl,
    "Unsubscribe: " + unsubUrl,
  ].join("\n")

  return { html, text }
}

/**
 * System announcement: body is pre-rendered HTML from system_announcements.email_body_html.
 * We only wrap with footer.
 */
export function wrapAnnouncementWithFooter(
  bodyHtml: string,
  footer?: Partial<TemplateFooterOptions>
): string {
  const prefsUrl = footer?.preferencesUrl ?? DEFAULT_FOOTER_OPTIONS.preferencesUrl
  const unsubUrl = footer?.unsubscribeUrl ?? DEFAULT_FOOTER_OPTIONS.unsubscribeUrl
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem;">
  ${bodyHtml}
  ${footerHtml({ preferencesUrl: prefsUrl, unsubscribeUrl: unsubUrl })}
</body>
</html>`
}

/** Short blurb for digest: prefer AI briefing over raw job description (often HTML). */
function jobMatchDigestPreview(j: JobSummary): string | null {
  const briefing = j.aiBriefing?.trim()
  if (briefing) return truncate(briefing, 200)
  const plain = j.description?.trim()
  if (plain) return truncate(stripHtmlToPlain(plain), 200)
  return null
}

function stripHtmlToPlain(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 3) + "..."
}
