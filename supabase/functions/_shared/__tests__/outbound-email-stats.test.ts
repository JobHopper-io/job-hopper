import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { type OutboundEventRow, summarizeOutboundEmails } from '../outbound-email-stats.ts'

const row = (campaign: string | null, status: string, d = false, b = false, c = false, blocked: string | null = null): OutboundEventRow => ({
  campaign,
  status,
  delivered_at: d ? '2026-11-20T10:00:00Z' : null,
  bounced_at: b ? '2026-11-20T10:00:00Z' : null,
  complained_at: c ? '2026-11-20T10:00:00Z' : null,
  blocked_reason: blocked,
})

Deno.test('sent = every non-failed row; delivered/bounced/complained from timestamps; blocked separate', () => {
  const { totals, byCampaign } = summarizeOutboundEmails([
    row('a', 'sent'),
    row('a', 'delivered', true),
    row('a', 'complained', true, false, true), // delivered, then a spam complaint
    row('a', 'bounced', false, true),
    row('a', 'failed'), // send failure: counts nowhere
    row('a', 'failed', false, false, false, 'suppressed_emails'), // blocked: only in blocked
    row('b', 'delivered', true),
    row(null, 'sent'),
  ])
  assertEquals(totals, { sent: 6, delivered: 3, bounced: 1, complained: 1, blocked: 1 })
  assertEquals(byCampaign, [
    { campaign: 'a', sent: 4, delivered: 2, bounced: 1, complained: 1, blocked: 1 },
    { campaign: 'b', sent: 1, delivered: 1, bounced: 0, complained: 0, blocked: 0 },
    { campaign: null, sent: 1, delivered: 0, bounced: 0, complained: 0, blocked: 0 },
  ])
})

Deno.test('delivered/bounced/complained can never exceed sent (every status x timestamp combination)', () => {
  const statuses = ['sent', 'failed', 'delivered', 'bounced', 'complained']
  const rows: OutboundEventRow[] = []
  for (const status of statuses) {
    for (let mask = 0; mask < 8; mask++) {
      for (const blocked of [null, 'exclusion_lists']) {
        rows.push(row(`c-${status}`, status, !!(mask & 1), !!(mask & 2), !!(mask & 4), blocked))
      }
    }
  }
  const { totals, byCampaign } = summarizeOutboundEmails(rows)
  for (const counts of [totals, ...byCampaign]) {
    assert(counts.delivered <= counts.sent, `delivered > sent: ${JSON.stringify(counts)}`)
    assert(counts.bounced <= counts.sent, `bounced > sent: ${JSON.stringify(counts)}`)
    assert(counts.complained <= counts.sent, `complained > sent: ${JSON.stringify(counts)}`)
  }
  // a failed row carrying a stray delivered_at (inconsistent data) still isn't counted
  assertEquals(summarizeOutboundEmails([row('x', 'failed', true)]).totals.delivered, 0)
})

Deno.test('no outbound rows -> zeros, no campaigns', () => {
  assertEquals(summarizeOutboundEmails([]), { totals: { sent: 0, delivered: 0, bounced: 0, complained: 0, blocked: 0 }, byCampaign: [] })
})
