/**
 * Copy per B2C recovery segment and sequence stage. Same grounded-claims discipline as
 * the institutional outbound templates: no invented urgency, no fake scarcity, no feature
 * claim that isn't already live and sellable on /pricing.
 *
 * Personalization is limited to what's true for this person right now: first name,
 * searches used vs the free limit, resume uploaded or not, target job title. No job
 * counts and no "new jobs" claims while the job feed is stale (no new jobs since
 * 2026-11-12). Offers appear only when growth_settings.recovery_offers has a line for the
 * segment (empty by default).
 *
 * Stage 2 copy (sent 5 days after stage 1 if they haven't converted) is a DRAFT pending
 * approval; nothing sends it until recovery_auto_send is turned on or an admin sends.
 */
import type { RevenueRecoverySegmentKey } from './revenue-recovery-segments.ts'

export type RecoveryStage = 1 | 2

export interface SegmentCopyContext {
  firstName: string | null
  siteUrl: string
  /** email_events.campaign for this send, also the utm_campaign. */
  campaign: string
  searchesUsed?: number
  searchLimit?: number
  hasResume?: boolean
  targetJobTitle?: string | null
  /** From growth_settings.recovery_offers for this segment; omitted when not configured. */
  offer?: string | null
}

export interface SegmentCopy {
  subject: string
  body: string // plain text; wrapAnnouncementWithFooter/footerHtml handle HTML + footer
}

export const recoveryCampaign = (segment: RevenueRecoverySegmentKey, stage: RecoveryStage) => `recovery_${segment}_s${stage}`

/** App link with the recovery UTM tags. */
export function recoveryLink(siteUrl: string, path: string, campaign: string): string {
  const url = new URL(path, siteUrl)
  url.searchParams.set('utm_source', 'email_recovery')
  url.searchParams.set('utm_medium', 'email')
  url.searchParams.set('utm_campaign', campaign)
  return url.toString()
}

function hello(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0]
  return `Hi ${first || 'there'},`
}

const role = (ctx: SegmentCopyContext) => ctx.targetJobTitle?.trim() || null
const sign = (ctx: SegmentCopyContext) => (ctx.offer?.trim() ? `${ctx.offer.trim()}\n\nJob-Hopper` : 'Job-Hopper')

type Builder = (ctx: SegmentCopyContext, link: (path: string) => string) => SegmentCopy

const COPY: Record<RevenueRecoverySegmentKey, Record<RecoveryStage, Builder>> = {
  abandoned_checkout: {
    1: (ctx, link) => ({
      subject: 'You started checking out on Job-Hopper',
      body: `${hello(ctx.firstName)}

You started signing up for a Job-Hopper plan but didn't finish checkout. If something got in the way, you can pick it up again here: ${link('/pricing')}

If you ran into a problem with checkout, just reply and tell us what happened.

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'Any questions about Job-Hopper plans?',
      body: `${hello(ctx.firstName)}

A few days ago you started checking out but didn't finish. If you're weighing which plan fits${role(ctx) ? ` your ${role(ctx)} search` : ''}, the pricing page lists exactly what each one includes: ${link('/pricing')}

Reply with any question and we'll answer it.

${sign(ctx)}`,
    }),
  },

  cancelled: {
    1: (ctx, link) => ({
      subject: 'Your Job-Hopper subscription is still available if you want it back',
      body: `${hello(ctx.firstName)}

Your Job-Hopper subscription has ended. If you want to pick it back up, you can re-subscribe any time -- nothing about your account was deleted.

Resubscribe: ${link('/pricing')}

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'What would have made Job-Hopper worth keeping?',
      body: `${hello(ctx.firstName)}

You cancelled your Job-Hopper subscription recently. If something was missing or didn't work for you, a one-line reply telling us what it was would help us a lot.

Your account and profile are still there if you come back: ${link('/pricing')}

${sign(ctx)}`,
    }),
  },

  heavy_free_usage: {
    1: (ctx, link) => ({
      subject: "You've used your free searches -- Core removes that cap",
      body: `${hello(ctx.firstName)}

You've used ${ctx.searchLimit != null ? `${ctx.searchesUsed ?? ctx.searchLimit} of the ${ctx.searchLimit}` : 'all the'} searches your free plan allows. Core removes that cap and adds unlimited automated matching, so matching runs without you starting a search each time.

See what Core includes: ${link('/pricing')}

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'Keep your job search going without the free-plan cap',
      body: `${hello(ctx.firstName)}

Your free plan's searches are used up${role(ctx) ? `, so your ${role(ctx)} search is on hold until you upgrade` : ''}. Core has no search cap, plus daily email digests, full Hiring Intel, full resume advice and an application tracker.

Compare plans: ${link('/pricing')}

${sign(ctx)}`,
    }),
  },

  visa_focused_no_conversion: {
    1: (ctx, link) => ({
      subject: 'Real sponsorship data for your job search',
      body: `${hello(ctx.firstName)}

Job-Hopper helps visa-seeking job seekers find employers that actually sponsor, backed by real DOL and USCIS filing data instead of guesswork. Premium adds the deeper layer: Real Sponsorship Score, Sponsor Watch alerts, and direct hiring-manager contact.

See what Premium includes: ${link('/pricing')}

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'Know which employers sponsor before you apply',
      body: `${hello(ctx.firstName)}

When you need sponsorship, applying to employers that never sponsor costs time you don't have. Premium's Real Sponsorship Score is built from DOL and USCIS filings${role(ctx) ? `, so you can check employers for ${role(ctx)} roles before you apply` : ''}, and Sponsor Watch alerts you when an employer you follow files.

See Premium: ${link('/pricing')}

${sign(ctx)}`,
    }),
  },

  activated_never_paid: {
    1: (ctx, link) => ({
      subject: 'What Core unlocks beyond your free searches',
      body: `${hello(ctx.firstName)}

You've been using Job-Hopper's free tier. Core adds unlimited automated matching (no manual searching), daily email digests, full Hiring Intel instead of the teaser view, full resume advice, and an application tracker.

See the plans: ${link('/pricing')}

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'Is the free plan enough for your search?',
      body: `${hello(ctx.firstName)}

If the free plan covers what you need${role(ctx) ? ` for your ${role(ctx)} search` : ''}, that's fine. If you want matching to run on its own, with daily digests and full resume advice, that's what Core adds.

See the plans: ${link('/pricing')}

${sign(ctx)}`,
    }),
  },

  onboarded_no_resume: {
    1: (ctx, link) => ({
      subject: 'Add your resume to Job-Hopper',
      body: `${hello(ctx.firstName)}

Your Job-Hopper profile is set up, but there's no resume on it yet. Resume advice works from your uploaded resume, so adding one is the next step.

Upload it from your profile: ${link('/profile')}

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'Your Job-Hopper profile is still missing a resume',
      body: `${hello(ctx.firstName)}

A quick reminder: your profile still has no resume${role(ctx) ? ` for your ${role(ctx)} search` : ''}. It takes a minute to upload, and resume advice needs it.

Upload your resume: ${link('/profile')}

${sign(ctx)}`,
    }),
  },

  never_activated: {
    1: (ctx, link) => ({
      subject: 'Finish setting up your Job-Hopper account',
      body: `${hello(ctx.firstName)}

You created a Job-Hopper account but haven't finished setting up your profile yet -- so we haven't been able to show you any job matches.

It takes about a minute: ${link('/onboarding')}

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'Your Job-Hopper setup is one step away',
      body: `${hello(ctx.firstName)}

Your Job-Hopper account is still waiting on its profile. Tell us what role you're after and where, and matching can start.

Finish setup: ${link('/onboarding')}

${sign(ctx)}`,
    }),
  },

  no_login_30d: {
    1: (ctx, link) => ({
      subject: "It's been a while since you checked Job-Hopper",
      body: `${hello(ctx.firstName)}

You haven't been back to Job-Hopper in a while. Your profile is still there whenever you want to pick your search back up${role(ctx) ? ` for ${role(ctx)} roles` : ''}.

Go to your dashboard: ${link('/dashboard')}

${sign(ctx)}`,
    }),
    // DRAFT, pending approval.
    2: (ctx, link) => ({
      subject: 'Still looking for your next role?',
      body: `${hello(ctx.firstName)}

If your job search is still on, your Job-Hopper account is ready when you are. If you've found something, congratulations -- you can turn these emails off with the link below.

Your dashboard: ${link('/dashboard')}

${sign(ctx)}`,
    }),
  },
}

export function buildSegmentCopy(segment: RevenueRecoverySegmentKey, stage: RecoveryStage, ctx: SegmentCopyContext): SegmentCopy {
  return COPY[segment][stage](ctx, (path) => recoveryLink(ctx.siteUrl, path, ctx.campaign))
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Same paragraph/line-break + auto-link approach as outbound-dry-run.mjs's
 * renderHtmlBody, so plain-text copy renders as real paragraphs with a clickable link
 * instead of a raw pasted URL. */
export function plainTextToHtml(body: string): string {
  const paragraphs = escapeHtml(body)
    .split('\n\n')
    .map((para) => `<p style="margin:0 0 1em;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  return paragraphs.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
}
