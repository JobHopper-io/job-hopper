/**
 * Outbound send counts for admin-growth-dashboard, from email_events rows of type
 * 'outbound' (growth step 3). Pure so it's testable without a DB.
 *
 * sent       = every outbound row whose status is not 'failed' (handed to Mailtrap,
 *              whatever happened after)
 * delivered  = sent rows with delivered_at set
 * bounced    = sent rows with bounced_at set
 * complained = sent rows with complained_at set
 * blocked    = rows the outbound script didn't send because of suppression
 *              (payload.blocked_reason set; status 'failed', but not a send failure)
 *
 * delivered/bounced/complained only count rows already counted as sent, so each is
 * always <= sent. They use the timestamps, not status, because status only moves
 * forward (a delivered-then-complained email counts as both delivered and complained).
 */

export interface OutboundEventRow {
  campaign: string | null
  status: string
  delivered_at: string | null
  bounced_at: string | null
  complained_at: string | null
  /** payload->>blocked_reason */
  blocked_reason: string | null
}

export interface OutboundCounts {
  sent: number
  delivered: number
  bounced: number
  complained: number
  blocked: number
}

export interface OutboundCampaignCounts extends OutboundCounts {
  campaign: string | null
}

function emptyCounts(): OutboundCounts {
  return { sent: 0, delivered: 0, bounced: 0, complained: 0, blocked: 0 }
}

export function summarizeOutboundEmails(rows: OutboundEventRow[]): {
  totals: OutboundCounts
  byCampaign: OutboundCampaignCounts[]
} {
  const totals = emptyCounts()
  const byCampaign = new Map<string | null, OutboundCounts>()
  for (const row of rows) {
    const c = byCampaign.get(row.campaign) ?? emptyCounts()
    byCampaign.set(row.campaign, c)
    const sent = row.status !== "failed"
    for (const counts of [totals, c]) {
      if (row.blocked_reason) counts.blocked += 1
      if (!sent) continue
      counts.sent += 1
      if (row.delivered_at) counts.delivered += 1
      if (row.bounced_at) counts.bounced += 1
      if (row.complained_at) counts.complained += 1
    }
  }
  return {
    totals,
    byCampaign: [...byCampaign.entries()]
      .map(([campaign, counts]) => ({ campaign, ...counts }))
      .sort((a, b) => b.sent - a.sent || String(a.campaign).localeCompare(String(b.campaign))),
  }
}
