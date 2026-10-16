import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'
import type { InstitutionalLead, OrgAccount, TrialGrant } from '@/types/database'

/** One seat holder, as returned by partner_insights() — counts and status only. */
export interface PartnerRosterRow {
  profileId: string
  name: string
  email: string
  seatSource: 'pilot' | 'paid'
  claimedAt: string
  /** Latest of in-app activity (profiles.last_active_at) and sign-in. */
  lastActiveAt: string | null
  onboarded: boolean
  hasResume: boolean
  needsSponsorship: boolean
  matches: number
  sponsorMatches: number
  applications: number
  interviewing: number
  practiceSessions: number
}

export interface PartnerInsights {
  roster: PartnerRosterRow[]
  /** Students who claimed a seat within the requested period. */
  joinedInPeriod: number
  /** Students who matched the domain while every seat was taken. */
  waitlisted: number
  weekly: { week: string; joined: number; applications: number }[]
  topEmployers: { company: string; applications: number; students: number }[]
}

export type PartnerPilot = Pick<
  TrialGrant,
  'id' | 'seat_count' | 'seats_used' | 'feature_tier' | 'expires_at' | 'status' | 'invite_code' | 'created_at'
>
export type PartnerPaid = Pick<
  OrgAccount,
  | 'id'
  | 'seat_count'
  | 'seats_used'
  | 'feature_tier'
  | 'status'
  | 'created_at'
  | 'billing_interval'
  | 'discount_percent'
  | 'list_price_cents'
>

/** The license's live billing state: terms come from PartnerPaid, this is Stripe's side. */
export interface PartnerBilling {
  subscriptionStatus: string
  renewsAt: string | null
  latestInvoice: {
    status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | null
    totalCents: number
    amountDueCents: number
    dueDate: string | null
    url: string | null
    number: string | null
  } | null
}

export interface PartnerSeatRequest {
  id: string
  requested_by: string
  seats: number
  note: string | null
  created_at: string
}

export type SeatClaimResult = { status: 'claimed' | 'full' | 'none'; organization: string | null }

/**
 * Set by the router when a student's university has run out of seats, so the plan
 * picker can explain why (instead of silently asking a covered student to pay).
 */
export const seatsFullFor = ref<string | null>(null)

export interface PartnerOverview {
  lead: Pick<InstitutionalLead, 'id' | 'organization_name' | 'category' | 'email_domains'>
  pilot: PartnerPilot | null
  paid: PartnerPaid | null
  staff: { email: string; created_at: string }[]
  insights: PartnerInsights
  isAdmin: boolean
  /** Monthly list price per seat by tier key; admins only (null for university staff). */
  seatPriceCents: Record<string, number> | null
  billing: PartnerBilling | null
  seatRequests: PartnerSeatRequest[]
}

export interface PartnerSummary {
  seat_holders: number
  onboarded: number
  activated: number
  active_30d: number
  applications_30d: number
}

export interface PartnerListRow
  extends Pick<
    InstitutionalLead,
    'id' | 'organization_name' | 'category' | 'status' | 'email_domains' | 'student_size' | 'estimated_seats'
  > {
  pilot: Omit<PartnerPilot, 'id' | 'invite_code'> | null
  paid: Omit<PartnerPaid, 'id'> | null
  summary: PartnerSummary | null
  waitlisted: number
  /** Seats requested in still-open "request more seats" asks. */
  requestedSeats: number
}

async function invoke<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke('partner-portal', { body })
  if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
  return { data: data as T, error: null }
}

export const partnerPortalAPI = {
  /**
   * Claims a university seat for the signed-in user if their verified email matches a
   * partner's domain or a named seat invite. "full" = their university is a partner but
   * every seat is taken (they're waitlisted). Safe to call repeatedly.
   */
  async claimSeat(): Promise<SeatClaimResult> {
    const { data, error } = await supabase.rpc('claim_partner_seat')
    if (error) {
      console.error('claim_partner_seat failed:', error)
      return { status: 'none', organization: null }
    }
    return data as SeatClaimResult
  },

  /** Engagement heartbeat for partner dashboards; throttled server-side to 1 write/hour. */
  async touchLastActive(): Promise<void> {
    const { error } = await supabase.rpc('touch_last_active')
    if (error) console.error('touch_last_active failed:', error)
  },

  async isPartnerStaff(): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_partner_staff')
    return !error && !!data
  },

  myPartners() {
    return invoke<{ partners: Pick<InstitutionalLead, 'id' | 'organization_name'>[]; isAdmin: boolean }>({
      action: 'my_partners',
    })
  },

  listPartners() {
    return invoke<{ partners: PartnerListRow[]; seatPriceCents: Record<string, number> }>({ action: 'list_partners' })
  },

  /** `since` (ISO) scopes activity to a period; null = all time. */
  overview(leadId: string, since: string | null = null) {
    return invoke<PartnerOverview>({ action: 'overview', leadId, since })
  },

  releaseSeat(leadId: string, profileId: string) {
    return invoke<{ released: string }>({ action: 'release_seat', leadId, profileId })
  },

  updateDomains(leadId: string, emailDomains: string[]) {
    return invoke<{ emailDomains: string[] }>({ action: 'update_domains', leadId, emailDomains })
  },

  addStaff(leadId: string, email: string) {
    return invoke<{ added: string; emailSent: boolean }>({ action: 'add_staff', leadId, email })
  },

  requestSeats(leadId: string, seats: number, note: string) {
    return invoke<{ requested: number }>({ action: 'request_seats', leadId, seats, note })
  },

  resolveSeatRequest(leadId: string, requestId: string) {
    return invoke<{ resolved: string }>({ action: 'resolve_seat_request', leadId, requestId })
  },

  removeStaff(leadId: string, email: string) {
    return invoke<{ removed: string }>({ action: 'remove_staff', leadId, email })
  },
}

export type PartnerStage = 'licensed' | 'pilot' | 'pilot_ended' | 'setup'

export interface PartnerProgram {
  stage: PartnerStage
  label: string
  title: string
  detail: string
  /** Remaining share of the pilot (0-100), or null when not on a running pilot. */
  daysLeftPct: number | null
  daysLeft: number | null
  daysLeftCaption: string
  seatsUsed: number
  seatTotal: number
}

const TIER_LABEL: Record<string, string> = { free: 'Free', core: 'Core', premium: 'Premium' }
const DAY_MS = 86_400_000

/** Where a partner is in the pilot -> paid lifecycle, and which seat pool is live. */
export function describeProgram(
  pilot: Pick<PartnerPilot, 'seat_count' | 'seats_used' | 'feature_tier' | 'expires_at' | 'status' | 'created_at'> | null,
  paid: Pick<PartnerPaid, 'seat_count' | 'seats_used' | 'feature_tier' | 'status'> | null,
): PartnerProgram {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const base = { daysLeftPct: null, daysLeft: null, daysLeftCaption: '' }

  if (paid?.status === 'active') {
    return {
      ...base,
      stage: 'licensed',
      label: 'Licensed',
      title: `${TIER_LABEL[paid.feature_tier] ?? paid.feature_tier} license`,
      detail: `${paid.seat_count} seats, renews monthly`,
      seatsUsed: paid.seats_used,
      seatTotal: paid.seat_count,
    }
  }

  if (pilot) {
    const end = new Date(pilot.expires_at).getTime()
    const seats = { seatsUsed: pilot.seats_used, seatTotal: pilot.seat_count }
    if (pilot.status === 'active' && end > Date.now()) {
      const daysLeft = Math.ceil((end - Date.now()) / DAY_MS)
      const length = Math.max(1, end - new Date(pilot.created_at).getTime())
      return {
        ...seats,
        stage: 'pilot',
        label: 'Pilot',
        title: `${TIER_LABEL[pilot.feature_tier] ?? pilot.feature_tier} pilot`,
        detail: `Runs until ${fmt(pilot.expires_at)}`,
        daysLeftPct: Math.round(((end - Date.now()) / length) * 100),
        daysLeft,
        daysLeftCaption: `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`,
      }
    }
    return {
      ...base,
      ...seats,
      stage: 'pilot_ended',
      label: 'Pilot ended',
      title: 'Pilot ended',
      detail: `Ended ${fmt(pilot.expires_at)}. Students keep their accounts; contact us to restore access.`,
    }
  }

  return { ...base, stage: 'setup', label: 'Setting up', title: 'Setting up', detail: 'Your program is being configured.', seatsUsed: 0, seatTotal: 0 }
}

/** Tailwind classes for a stage pill (dot + pill), shared by the portal and admin list. */
export const STAGE_STYLE: Record<PartnerStage, { pill: string; dot: string }> = {
  licensed: { pill: 'bg-green-50 text-green-800', dot: 'bg-brand-success' },
  pilot: { pill: 'bg-brand-primary/10 text-brand-primary', dot: 'bg-brand-primary' },
  pilot_ended: { pill: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  setup: { pill: 'bg-neutral-bg text-neutral-body', dot: 'bg-neutral-border' },
}

// ---------------------------------------------------------------------------
// Reporting period
// ---------------------------------------------------------------------------

export type PeriodKey = '30d' | '90d' | 'academic_year' | 'all' | 'custom'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  academic_year: 'This academic year',
  all: 'All time',
  custom: 'Since a date…',
}

/** Start of the period as ISO, or null for all time. Academic years start Aug 1. */
export function periodSince(key: PeriodKey, customDate = '', now = new Date()): string | null {
  if (key === '30d' || key === '90d') {
    return new Date(now.getTime() - (key === '30d' ? 30 : 90) * DAY_MS).toISOString()
  }
  if (key === 'academic_year') {
    const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
    return new Date(year, 7, 1).toISOString()
  }
  if (key === 'custom' && customDate) return new Date(`${customDate}T00:00:00`).toISOString()
  return null
}

/** Human label for a period, e.g. "Last 30 days" or "Since Sep 1, 2026". */
export function periodLabel(key: PeriodKey, customDate = ''): string {
  if (key === 'custom') {
    return customDate
      ? `Since ${new Date(`${customDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'All time'
  }
  return PERIOD_LABELS[key]
}

// ---------------------------------------------------------------------------
// Commercial + health (admin)
// ---------------------------------------------------------------------------

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export const DISCOUNT_OPTIONS = [0, 20, 30] as const
export type DiscountPercent = (typeof DISCOUNT_OPTIONS)[number]

/**
 * Monthly-equivalent value of a seat pool: seats × per-seat monthly price × (1 − discount).
 * An annual license's yearly invoice is 12× this. Uses the contract's snapshotted
 * list_price_cents when present, else today's list price (pilots, new quotes).
 */
export function monthlyValueCents(
  pool: { seat_count: number; feature_tier: string; discount_percent?: number; list_price_cents?: number | null } | null,
  prices: Record<string, number> | null,
): number {
  if (!pool) return 0
  const perSeat = pool.list_price_cents ?? prices?.[pool.feature_tier] ?? 0
  return Math.round(pool.seat_count * perSeat * (1 - (pool.discount_percent ?? 0) / 100))
}

/** "$X/mo" or "$Y/yr" — what one invoice for this license is. */
export function invoiceLabel(monthlyCents: number, interval: string): string {
  return interval === 'year' ? `${formatMoney(monthlyCents * 12)}/yr` : `${formatMoney(monthlyCents)}/mo`
}

export interface AttentionFlag {
  label: string
  tone: 'warning' | 'opportunity'
}

/**
 * What an account manager should act on. Thresholds are deliberately simple rules of
 * thumb, not a scoring model: pilots about to end, weak activation once a pilot has had
 * two weeks, an untouched pilot, a lapsed pilot with no license, and nearly-full seats.
 */
export function attentionFlags(
  program: PartnerProgram,
  pilotStartedAt: string | null,
  summary: PartnerSummary | null,
  demand: { waitlisted: number; requestedSeats: number } = { waitlisted: 0, requestedSeats: 0 },
): AttentionFlag[] {
  const flags: AttentionFlag[] = []
  if (demand.requestedSeats > 0) flags.push({ label: `Requested +${demand.requestedSeats} seats`, tone: 'warning' })
  if (demand.waitlisted > 0) flags.push({ label: `${demand.waitlisted} waiting for a seat`, tone: 'opportunity' })
  const holders = summary?.seat_holders ?? 0
  const pilotAgeDays = pilotStartedAt ? (Date.now() - new Date(pilotStartedAt).getTime()) / DAY_MS : 0

  if (program.stage === 'pilot') {
    if (program.daysLeft !== null && program.daysLeft <= 14) {
      flags.push({ label: `Pilot ends in ${program.daysLeft}d — convert`, tone: 'warning' })
    }
    if (holders === 0 && pilotAgeDays >= 7) flags.push({ label: 'No students yet', tone: 'warning' })
  }
  if (program.stage === 'pilot_ended') flags.push({ label: 'Pilot lapsed — follow up', tone: 'warning' })
  if (holders >= 5 && pilotAgeDays >= 14 && (summary?.activated ?? 0) / holders < 0.5) {
    flags.push({ label: 'Low activation', tone: 'warning' })
  }
  if (program.seatTotal > 0 && program.seatsUsed / program.seatTotal >= 0.9) {
    flags.push({ label: 'Seats nearly full — upsell', tone: 'opportunity' })
  }
  return flags
}
