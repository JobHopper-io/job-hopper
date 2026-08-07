import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'

export interface AnnouncementHistoryRow {
  id: string
  title: string
  email_subject: string
  published_at: string
  sent_by: string | null
}

export interface SendAnnouncementResult {
  id: string
  sent: number
  failed: number
  total_eligible: number
}

export interface AnnouncementDraft {
  title: string
  emailSubject: string
  emailBodyHtml: string
}

export interface SendTestResult {
  testSent: boolean
  error: string | null
}

export const systemAnnouncementsAPI = {
  /** Renders exactly the HTML the real send will produce - no DB write, no email sent. */
  async preview(draft: AnnouncementDraft): Promise<{ data: string | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-send-announcement', {
      body: {
        title: draft.title,
        email_subject: draft.emailSubject,
        email_body_html: draft.emailBodyHtml,
        dry_run: true,
      },
    })

    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: (data as { html: string }).html, error: null }
  },

  /** Sends the exact real-send HTML to one address only - no announcement row, no real recipients touched. */
  async sendTest(
    draft: AnnouncementDraft,
    testEmail: string,
  ): Promise<{ data: SendTestResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-send-announcement', {
      body: {
        title: draft.title,
        email_subject: draft.emailSubject,
        email_body_html: draft.emailBodyHtml,
        test_email: testEmail,
      },
    })

    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    const result = data as { test_sent: boolean; error: string | null }
    return { data: { testSent: result.test_sent, error: result.error }, error: null }
  },

  async send(draft: AnnouncementDraft): Promise<{ data: SendAnnouncementResult | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-send-announcement', {
      body: {
        title: draft.title,
        email_subject: draft.emailSubject,
        email_body_html: draft.emailBodyHtml,
      },
    })

    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: data as SendAnnouncementResult, error: null }
  },

  async listHistory(): Promise<{ data: AnnouncementHistoryRow[] | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-list-announcements', {
      body: {},
    })

    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: (data as { announcements: AnnouncementHistoryRow[] }).announcements, error: null }
  },
}
