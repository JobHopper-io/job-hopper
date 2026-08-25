/**
 * Real copy per B2C revenue-recovery segment (Build 14). Same grounded-claims
 * discipline as the institutional outbound templates: no invented urgency, no fake
 * scarcity, no feature claim that isn't already live and sellable on /pricing.
 */
import type { RevenueRecoverySegmentKey } from './revenue-recovery-segments.ts'

export interface SegmentCopyContext {
  recipientName: string
  siteUrl: string
  /** Only meaningful for high_match_users. */
  matchCount?: number
}

export interface SegmentCopy {
  subject: string
  body: string // plain text; wrapAnnouncementWithFooter/footerHtml handle HTML + footer
}

function firstName(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.split(/\s+/)[0] : 'there'
}

const COPY_BUILDERS: Record<RevenueRecoverySegmentKey, (ctx: SegmentCopyContext) => SegmentCopy> = {
  never_activated: (ctx) => ({
    subject: 'Finish setting up your Job-Hopper account',
    body: `Hi ${firstName(ctx.recipientName)},

You created a Job-Hopper account but haven't finished setting up your profile yet -- so we haven't been able to show you any real job matches.

It takes about a minute: ${ctx.siteUrl}/onboarding

Job-Hopper`,
  }),

  activated_never_paid: (ctx) => ({
    subject: 'What Core unlocks beyond your free searches',
    body: `Hi ${firstName(ctx.recipientName)},

You've been using Job-Hopper's free tier. Core adds unlimited automated matching (no manual searching), daily email digests, full Hiring Intel instead of the teaser view, full resume advice, and an application tracker.

See the plans: ${ctx.siteUrl}/pricing

Job-Hopper`,
  }),

  cancelled: (ctx) => ({
    subject: 'Your Job-Hopper subscription is still available if you want it back',
    body: `Hi ${firstName(ctx.recipientName)},

Your Job-Hopper subscription ended a while back. If you want to pick it back up, you can re-subscribe any time -- nothing about your account was deleted.

Resubscribe: ${ctx.siteUrl}/pricing

Job-Hopper`,
  }),

  no_login_30d: (ctx) => ({
    subject: "It's been a while since you checked Job-Hopper",
    body: `Hi ${firstName(ctx.recipientName)},

You haven't been back to Job-Hopper in a bit. New job postings come in regularly, so it's worth another look.

Check your matches: ${ctx.siteUrl}/dashboard

Job-Hopper`,
  }),

  heavy_free_usage: (ctx) => ({
    subject: "You've used your free searches -- Core removes that cap",
    body: `Hi ${firstName(ctx.recipientName)},

You've used all the searches your free plan allows. Core removes that cap entirely and adds unlimited automated matching, so new matches show up without you having to run a manual search each time.

See what Core includes: ${ctx.siteUrl}/pricing

Job-Hopper`,
  }),

  high_match_users: (ctx) => ({
    subject: 'Your job matches are piling up on the free plan',
    body: `Hi ${firstName(ctx.recipientName)},

You have ${ctx.matchCount ?? 'a number of'} real job matches in Job-Hopper already. Core turns that into unlimited automated matching plus daily digests, so new ones reach you without you checking manually.

See what Core includes: ${ctx.siteUrl}/pricing

Job-Hopper`,
  }),

  visa_focused_no_conversion: (ctx) => ({
    subject: 'Real sponsorship data for your job search',
    body: `Hi ${firstName(ctx.recipientName)},

Job-Hopper helps visa-seeking job seekers find employers that actually sponsor, backed by real DOL and USCIS filing data instead of guesswork. Premium adds the deeper layer: Real Sponsorship Score, Sponsor Watch alerts, and direct hiring-manager contact.

See what Premium includes: ${ctx.siteUrl}/pricing

Job-Hopper`,
  }),
}

export function buildSegmentCopy(segment: RevenueRecoverySegmentKey, ctx: SegmentCopyContext): SegmentCopy {
  return COPY_BUILDERS[segment](ctx)
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
