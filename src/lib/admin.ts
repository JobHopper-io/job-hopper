import { supabase } from '@/lib/supabase'
import type { UserLifecycleReport } from '@/lib/user-lifecycle'
import type { EmployerAccount, InstitutionalLead, OrgAccount, OrgSeatInvite, ReplyEvent, TrialGrant } from '@/types/database'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'

export interface SeoPerformanceRow {
  urlPath: string
  pageType: string
  h1: string | null
  views: number
  signups: number
  payingConversions: number
}

export interface SeoPerformanceReport {
  rows: SeoPerformanceRow[]
  totalRows: number
}

export interface AcquisitionChannelRow {
  /** "seo", "direct", a raw utm_source value (e.g. "linkedin"), or "<host> (organic)". */
  channel: string
  signups: number
  payingConversions: number
  conversionRate: number
}

export interface AcquisitionChannelReport {
  rows: AcquisitionChannelRow[]
  totalSignups: number
}

// Nominal categories (no inherent order/magnitude ranking) - one series, one hue;
// bar length alone carries the comparison, color never re-encodes it.
export function leadsBySourceChartRows(report: GrowthDashboardReport): { label: string; value: number; colorHex: string }[] {
  return report.acquisition.leadsBySource.map((row) => ({
    label: row.source,
    value: row.count,
    colorHex: '#2F6ECC',
  }))
}

// Ordinal ramp, light -> dark, single hue (brand.primary #2F6ECC) - validated with
// scripts/validate_palette.js --ordinal (dataviz skill): monotone lightness, all
// adjacent steps clear the CVD floor, light end clears the surface-contrast floor.
const B2C_FUNNEL_RAMP = ['#8FB8E8', '#5B8FDB', '#2F6ECC']

export function b2cFunnelChartRows(report: GrowthDashboardReport): { label: string; value: number; colorHex: string; subtext?: string }[] {
  const total = report.b2c.totalSignups
  const pctOfTotal = (n: number) => (total > 0 ? `(${((n / total) * 100).toFixed(0)}% of registrations)` : '')
  return [
    { label: 'Registrations', value: total, colorHex: B2C_FUNNEL_RAMP[0] },
    { label: 'Activated', value: report.b2c.activatedUsers, colorHex: B2C_FUNNEL_RAMP[1], subtext: pctOfTotal(report.b2c.activatedUsers) },
    { label: 'Paid (active)', value: report.b2c.paidSubscribers, colorHex: B2C_FUNNEL_RAMP[2], subtext: pctOfTotal(report.b2c.paidSubscribers) },
  ]
}

export interface GrowthDashboardReport {
  b2c: {
    totalSignups: number
    activatedUsers: number
    /** Active subscriptions only (segments base population). */
    paidSubscribers: number
    /** Stripe trials, not yet paid. */
    trialSubscribers: number
    /** paidSubscribers / confirmed registrations. */
    conversionRate: number
    /** New registrations only (profiles.created_at). New paid/activated by date is not tracked. */
    newSignups: { last24h: number; last7d: number }
  }
  /** Day 1 baseline segments (growth_dashboard_counts; same definitions as docs/growth/day1-audit.md). They overlap. */
  segments: {
    registered: number
    confirmed: number
    unconfirmed: number
    confirmedNotOnboarded: number
    resumeUploaded: number
    onboardedNoResume: number
    inactive30d: number
    abandonedCheckoutProxy: number
    activePaid: number
    trialing: number
    pastDue: number
    cancelled: number
    sponsoredSeats: number
  }
  /** Outbound funnel. Each step is counted independently, not as a cohort. */
  funnel: {
    leadsDiscovered: number
    institutionalLeads: number
    prospects: number
    /** Prospects reviewed in /admin/prospects (approved or rejected). */
    prospectsReviewed: number
    prospectsApproved: number
    outboundSent: number
    outboundDelivered: number
    replies: number
    positiveReplies: number
    outboundSignups: number
    outboundPaid: number
  }
  /** Recovery sequences, people per segment counted from their first send. */
  recoveryFunnel: {
    segment: string
    label: string
    sent: number
    delivered: number
    /** last_active_at after their first send. */
    cameBack: number
    /** Completed checkout within 30 days of their first send. */
    paid30d: number
  }[]
  /** B2C subscriptions only (university licenses excluded). */
  cancellations: {
    /** Canceled or scheduled-to-cancel subscriptions by Stripe portal feedback; 'none' = no feedback given. */
    byFeedback: { feedback: string; count: number }[]
    /** By canceled_at (when cancellation was requested). canceledNoDate: canceled before the field existed. */
    churn30d: { canceled: number; ended: number; pendingPeriodEnd: number; canceledNoDate: number }
  }
  institutional: {
    activeOpportunities: number
    trialOrganizations: number
    closedAccounts: number
    /** Recommended-seat-range buckets among leads not marked dead - no dollar pipeline
     * value is computed here since no per-seat price mapping exists yet. */
    seatPipelineByPackage: { recommendedPackage: string; leadCount: number }[]
  }
  acquisition: {
    totalLeads: number
    leadsBySource: { source: string; count: number }[]
    qualifiedOrganizations: number
    /** Outbound emails handed to the provider (email_events type outbound, status not failed). */
    emailsSent: number
    /** Each of these is a subset of emailsSent. */
    emailsDelivered: number
    emailsBounced: number
    emailsComplained: number
    /** Leads the outbound script skipped because of suppression (not send failures). */
    emailsBlocked: number
    emailsByCampaign: {
      campaign: string | null
      sent: number
      delivered: number
      bounced: number
      complained: number
      blocked: number
    }[]
  }
  revenue: {
    mrrCents: number
    annualizedRevenueCents: number
    churnedCount: number
    churnRate: number
  }
}

export type AdminTestEmailKind =
  | 'job_match_digest'
  | 'subscription_started'
  | 'subscription_updated'
  | 'subscription_cancel_scheduled'
  | 'subscription_canceled'
  | 'system_announcement'

export interface AdminSendTestEmailPayload {
  profile_id?: string
  email?: string
  kind: AdminTestEmailKind
  job_ids?: string[]
  plan_name?: string
  next_billing_date?: string
  cancel_at_date?: string
  announcement_id?: string
}

export interface AdminSendTestEmailResult {
  success: boolean
  message_id: string | null
  error: string | null
  kind: AdminTestEmailKind
  profile_id: string
}

interface AdminUserRow {
  id: string
  email: string
  first_name: string
  last_name: string | null
  roles: string[]
}

interface ListUsersResult {
  profiles: AdminUserRow[]
  total: number
}

interface ListUsersResponse {
  data: ListUsersResult | null
  error: Error | null
}

interface SetUserRolesPayload {
  profile: {
    email: string
    first_name: string
    last_name: string | null
  }
  roles: string[]
}

type AdminEmployerRow = Pick<
  EmployerAccount,
  'id' | 'company_name' | 'work_email' | 'verification_status' | 'created_at' | 'reviewed_by' | 'reviewed_at' | 'review_reason'
>

interface ListEmployersResult {
  employers: AdminEmployerRow[]
  total: number
}

interface ReviewEmployerResult {
  employer: AdminEmployerRow
}

export interface AdminTrialGrantLeadRow {
  id: string
  organization_name: string
  category: string
  status: string
  created_at: string
}

export interface CreateTrialGrantPayload {
  organizationName: string
  institutionalLeadId?: string | null
  seatCount: number
  expiresAt: string
  featureTier: 'free' | 'core' | 'premium'
  inviteCode?: string
}

export type AdminInstitutionalLeadRow = Pick<
  InstitutionalLead,
  | 'id'
  | 'organization_name'
  | 'category'
  | 'source'
  | 'status'
  | 'opportunity_score'
  | 'decision_maker_name'
  | 'decision_maker_title'
  | 'contact_email'
  | 'campaign'
  | 'last_send_error'
  | 'created_at'
  | 'updated_at'
>

export type InstitutionalLeadStatus = 'new' | 'contacted' | 'bounced' | 'dead'

export function institutionalLeadStatusBadgeClass(status: string): string {
  switch (status) {
    case 'contacted':
      return 'bg-blue-100 text-blue-800'
    case 'bounced':
      return 'bg-red-100 text-red-800'
    case 'dead':
      return 'bg-neutral-800 text-white'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

interface ListInstitutionalLeadsResult {
  leads: AdminInstitutionalLeadRow[]
  total: number
}

export type AdminReplyEventRow = Pick<
  ReplyEvent,
  'id' | 'from_email' | 'raw_subject' | 'raw_body' | 'received_at' | 'reply_class' | 'processed' | 'institutional_lead_id'
> & {
  institutional_leads: Pick<InstitutionalLead, 'organization_name' | 'category' | 'campaign'> | null
}

interface ListReplyEventsResult {
  replies: AdminReplyEventRow[]
  total: number
}

export type PartnerDashboardGrant = Pick<
  TrialGrant,
  'id' | 'seat_count' | 'seats_used' | 'feature_tier' | 'expires_at' | 'status' | 'invite_code'
>

export type PartnerDashboardOrgAccount = Pick<
  OrgAccount,
  'id' | 'organization_name' | 'feature_tier' | 'seat_count' | 'seats_used' | 'status' | 'subscription_id' | 'created_at'
>

export type PartnerDashboardSeatInvite = Pick<OrgSeatInvite, 'email' | 'invited_at' | 'claimed' | 'revoked_at'>

export interface PartnerDashboardResult {
  lead: Pick<
    InstitutionalLead,
    | 'id'
    | 'organization_name'
    | 'category'
    | 'status'
    | 'estimated_seats'
    | 'student_size'
    | 'contact_email'
    | 'decision_maker_name'
  >
  grants: PartnerDashboardGrant[]
  orgAccount: PartnerDashboardOrgAccount | null
  seatInvites: PartnerDashboardSeatInvite[]
}

export type RevenueRecoverySegmentKey =
  | 'abandoned_checkout'
  | 'cancelled'
  | 'heavy_free_usage'
  | 'visa_focused_no_conversion'
  | 'activated_never_paid'
  | 'onboarded_no_resume'
  | 'never_activated'
  | 'no_login_30d'

/** Mirrors _shared/recovery-sequences.ts RecoveryRunResult. */
export interface RecoveryRunResult {
  mode: 'preview' | 'send'
  candidates: number
  bySegment: Partial<Record<RevenueRecoverySegmentKey, { members: number; due: number }>>
  /** preview: everyone due now (before the per-run cap); send: everyone attempted. */
  planned: { profileId: string; emailMasked: string | null; segment: RevenueRecoverySegmentKey; stage: 1 | 2; campaign: string }[]
  sent: number
  failed: number
  skipped: Record<string, number>
  stopped: Record<string, number>
}

export interface RecoveryAdminResult {
  settings: { autoSend: boolean; maxSendsPerRun: number; offerSegments: string[] }
  /** In priority order: a user in several segments gets only the first. */
  segments: { key: RevenueRecoverySegmentKey; label: string }[]
  result: RecoveryRunResult
}

export interface RecoveryTestSendResult {
  mode: 'test'
  success: boolean
  error?: string | null
  messageId?: string | null
}

export const adminAPI = {
  async setUserRoles(email: string, roles: string[]): Promise<{ data: SetUserRolesPayload | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('assign-role', {
      body: {
        email,
        roles,
      },
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as SetUserRolesPayload, error: null }
  },

  async listUsers(params: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<ListUsersResponse> {
    const { data, error } = await supabase.functions.invoke('list-admin-users', {
      body: params,
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as ListUsersResult, error: null }
  },

  async listEmployers(params: {
    search?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<{ data: ListEmployersResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-list-employers', {
      body: params,
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as ListEmployersResult, error: null }
  },

  async reviewEmployer(
    employerAccountId: string,
    status: 'verified' | 'rejected' | 'suspended',
    reason?: string,
  ): Promise<{ data: ReviewEmployerResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-review-employer', {
      body: { employer_account_id: employerAccountId, status, reason },
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as ReviewEmployerResult, error: null }
  },

  async sendTestEmail(
    payload: AdminSendTestEmailPayload,
  ): Promise<{ data: AdminSendTestEmailResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-send-test-email', {
      body: payload,
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as AdminSendTestEmailResult, error: null }
  },

  async getUserLifecycleReport(): Promise<{ data: UserLifecycleReport | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-user-lifecycle-report', {
      body: {},
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as UserLifecycleReport, error: null }
  },

  async getSeoPerformanceReport(): Promise<{ data: SeoPerformanceReport | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-seo-performance-report', {
      body: {},
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as SeoPerformanceReport, error: null }
  },

  async getAcquisitionChannelReport(): Promise<{
    data: AcquisitionChannelReport | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke('admin-acquisition-channel-report', {
      body: {},
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as AcquisitionChannelReport, error: null }
  },

  async getGrowthDashboardReport(): Promise<{
    data: GrowthDashboardReport | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke('admin-growth-dashboard', {
      body: {},
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as GrowthDashboardReport, error: null }
  },

  /** LLM narration of an already-fetched growth report. Slow (one chat completion), so
   * the view loads the tiles first and fills this in separately. */
  async getGrowthSummary(report: GrowthDashboardReport): Promise<{
    summary: string | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke('admin-growth-dashboard', {
      body: { summary: true, report },
    })
    if (error) {
      return { summary: null, error }
    }
    const payload = data as { summary?: string | null; summaryError?: string }
    if (!payload?.summary) {
      return { summary: null, error: new Error(payload?.summaryError || 'No summary returned') }
    }
    return { summary: payload.summary, error: null }
  },

  async listInstitutionalLeadsForTrialGrants(): Promise<{
    data: AdminTrialGrantLeadRow[] | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke('admin-trial-grants', {
      body: { action: 'list_leads' },
    })

    if (error) {
      return { data: null, error }
    }

    return { data: (data as { leads: AdminTrialGrantLeadRow[] }).leads, error: null }
  },

  async listTrialGrants(): Promise<{ data: TrialGrant[] | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-trial-grants', {
      body: { action: 'list_grants' },
    })

    if (error) {
      return { data: null, error }
    }

    return { data: (data as { grants: TrialGrant[] }).grants, error: null }
  },

  async createTrialGrant(
    payload: CreateTrialGrantPayload,
  ): Promise<{ data: TrialGrant | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-trial-grants', {
      body: { action: 'create_grant', ...payload },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: (data as { grant: TrialGrant }).grant, error: null }
  },

  async listInstitutionalLeads(params: {
    search?: string
    source?: string
    category?: string
    status?: string
    hasContact?: boolean
    sortBy?: 'created_at' | 'opportunity_score'
    sortAscending?: boolean
    limit?: number
    offset?: number
  }): Promise<{ data: ListInstitutionalLeadsResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-institutional-leads', {
      body: { action: 'list', ...params },
    })

    if (error) {
      return { data: null, error }
    }

    return { data: data as ListInstitutionalLeadsResult, error: null }
  },

  async updateInstitutionalLeadStatus(
    leadId: string,
    status: InstitutionalLeadStatus,
  ): Promise<{ data: AdminInstitutionalLeadRow | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-institutional-leads', {
      body: { action: 'update_status', leadId, status },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: (data as { lead: AdminInstitutionalLeadRow }).lead, error: null }
  },

  async listReplyEvents(params: {
    replyClass?: string
    search?: string
    limit?: number
    offset?: number
  }): Promise<{ data: ListReplyEventsResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-reply-events', {
      body: params,
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: data as ListReplyEventsResult, error: null }
  },

  async getPartnerDashboard(
    leadId: string,
  ): Promise<{ data: PartnerDashboardResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-partner-dashboard', {
      body: { leadId },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: data as PartnerDashboardResult, error: null }
  },

  /** Grow an existing license; Stripe invoices the prorated difference immediately. */
  async addOrgSeats(orgAccountId: string, seats: number): Promise<{ data: { seatCount: number } | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-org-accounts', {
      body: { action: 'add_seats', orgAccountId, seats },
    })
    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: data as { seatCount: number }, error: null }
  },

  async createOrgAccount(payload: {
    leadId: string
    organizationName: string
    billingEmail: string
    billingName?: string
    featureTier: 'core' | 'premium'
    seatCount: number
    billingInterval: 'month' | 'year'
    discountPercent: 0 | 20 | 30
  }): Promise<{
    data: { orgAccount: PartnerDashboardOrgAccount; stripeSubscriptionId: string } | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke('admin-org-accounts', {
      body: { action: 'create_org_account', ...payload },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: data as { orgAccount: PartnerDashboardOrgAccount; stripeSubscriptionId: string }, error: null }
  },

  async importOrgSeats(
    orgAccountId: string,
    emails: string[],
  ): Promise<{
    data: { invited: number; alreadyInvited: number; emailsSent: number; seatsUsed: number; seatCount: number } | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke('admin-org-accounts', {
      body: { action: 'import_seats', orgAccountId, emails },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return {
      data: data as { invited: number; alreadyInvited: number; emailsSent: number; seatsUsed: number; seatCount: number },
      error: null,
    }
  },

  async revokeOrgSeat(
    orgAccountId: string,
    email: string,
  ): Promise<{ data: { revoked: string; seatCount: number; seatsUsed: number } | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-org-accounts', {
      body: { action: 'revoke_seat', orgAccountId, email },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: data as { revoked: string; seatCount: number; seatsUsed: number }, error: null }
  },

  /** Who would get which recovery email next (masked emails). Reads only. */
  async previewRecovery(): Promise<{ data: RecoveryAdminResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-revenue-recovery-segments', { body: { action: 'preview' } })
    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: data as RecoveryAdminResult, error: null }
  },

  /** One real run, same rules and per-run cap as the daily job. */
  async sendRecoveryBatch(): Promise<{ data: RecoveryAdminResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-revenue-recovery-segments', {
      body: { action: 'send', confirmRealSend: true },
    })
    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: data as RecoveryAdminResult, error: null }
  },

  /** One segment/stage's copy to a single test address; no member is touched. */
  async sendRecoveryTest(
    segment: RevenueRecoverySegmentKey,
    stage: 1 | 2,
    testEmailOverride: string,
  ): Promise<{ data: RecoveryTestSendResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-revenue-recovery-segments', {
      body: { action: 'test_send', segment, stage, testEmailOverride },
    })
    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: data as RecoveryTestSendResult, error: null }
  },
}

