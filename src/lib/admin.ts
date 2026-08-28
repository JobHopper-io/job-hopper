import { supabase } from '@/lib/supabase'
import type { UserLifecycleReport } from '@/lib/user-lifecycle'
import type { EmployerAccount, InstitutionalLead, OrgAccount, OrgSeatInvite, TrialGrant } from '@/types/database'
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
    { label: 'Paid', value: report.b2c.paidSubscribers, colorHex: B2C_FUNNEL_RAMP[2], subtext: pctOfTotal(report.b2c.paidSubscribers) },
  ]
}

export interface GrowthDashboardReport {
  b2c: {
    totalSignups: number
    activatedUsers: number
    paidSubscribers: number
    conversionRate: number
    /** New registrations only (profiles.created_at). New paid/activated by date is not tracked. */
    newSignups: { last24h: number; last7d: number }
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
    emailsSent: number
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
  lead: Pick<InstitutionalLead, 'id' | 'organization_name' | 'category' | 'status'>
  grants: PartnerDashboardGrant[]
  orgAccount: PartnerDashboardOrgAccount | null
  seatInvites: PartnerDashboardSeatInvite[]
  metrics: {
    linkedUserCount: number
    activeUserCount: number
    resumeUploads: number
    jobMatches: number
    applications: number
  }
  activeWindowDays: number
}

export type RevenueRecoverySegmentKey =
  | 'never_activated'
  | 'activated_never_paid'
  | 'cancelled'
  | 'no_login_30d'
  | 'heavy_free_usage'
  | 'high_match_users'
  | 'visa_focused_no_conversion'

export interface RevenueRecoverySegmentMember {
  profileId: string
  email: string
  firstName: string
  detail: string
}

export interface RevenueRecoverySegmentSummaryRow {
  key: RevenueRecoverySegmentKey
  label: string
  count: number
}

export interface RevenueRecoverySegmentsResult {
  summary: RevenueRecoverySegmentSummaryRow[]
  segments: Record<RevenueRecoverySegmentKey, RevenueRecoverySegmentMember[]>
  totalProfiles: number
}

export interface SendRevenueRecoverySegmentResult {
  mode: 'test' | 'real'
  success?: boolean
  error?: string | null
  messageId?: string | null
  segment?: RevenueRecoverySegmentKey
  totalEligible?: number
  sent?: number
  suppressed?: number
  failed?: number
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

  async createOrgAccount(payload: {
    leadId: string
    organizationName: string
    billingEmail: string
    billingName?: string
    featureTier: 'core' | 'premium'
    seatCount: number
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

  async listRevenueRecoverySegments(): Promise<{ data: RevenueRecoverySegmentsResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-revenue-recovery-segments', {
      body: { action: 'list_segments' },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: data as RevenueRecoverySegmentsResult, error: null }
  },

  /** Pass exactly one of testEmailOverride or confirmRealSend. */
  async sendRevenueRecoverySegmentEmail(
    segment: RevenueRecoverySegmentKey,
    opts: { testEmailOverride?: string; confirmRealSend?: boolean },
  ): Promise<{ data: SendRevenueRecoverySegmentResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-revenue-recovery-segments', {
      body: { action: 'send_segment_email', segment, ...opts },
    })

    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }

    return { data: data as SendRevenueRecoverySegmentResult, error: null }
  },
}

