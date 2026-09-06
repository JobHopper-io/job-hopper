import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { GROWTH_SUMMARY_SYSTEM, growthSummaryUserMessage } from '../growth-summary-prompt.ts'

Deno.test('GROWTH_SUMMARY_SYSTEM names every known data gap so the LLM states them as gaps', () => {
  for (const gap of ['Reply rate', 'conversion', 'Visitors', 'Calls', 'Bulk-license', 'recovered', 'New PAID subscribers']) {
    assertEquals(GROWTH_SUMMARY_SYSTEM.includes(gap), true, `missing data-gap mention: ${gap}`)
  }
})

Deno.test('GROWTH_SUMMARY_SYSTEM forbids inventing numbers', () => {
  assertEquals(GROWTH_SUMMARY_SYSTEM.includes('MUST be backed by a number'), true)
  assertEquals(GROWTH_SUMMARY_SYSTEM.includes('not literally present'), true)
})

Deno.test('growthSummaryUserMessage embeds the report JSON verbatim', () => {
  const report = { acquisition: { totalLeads: 6870, emailsSent: 66 }, revenue: { churnedCount: 3 } }
  const msg = growthSummaryUserMessage(report)
  assertEquals(msg.includes('"totalLeads": 6870'), true)
  assertEquals(msg.includes('"churnedCount": 3'), true)
})
