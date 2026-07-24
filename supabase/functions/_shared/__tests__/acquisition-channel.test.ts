import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { deriveAcquisitionChannel } from '../acquisition-channel.ts'

Deno.test('landing_path present -> seo', () => {
  assertEquals(
    deriveAcquisitionChannel({ landing_path: '/jobs/nyc/software-engineer', utm_source: null }),
    'seo',
  )
})

Deno.test('utm_source present, no landing_path -> paid', () => {
  assertEquals(deriveAcquisitionChannel({ landing_path: null, utm_source: 'facebook' }), 'paid')
})

Deno.test('both present -> seo wins', () => {
  assertEquals(
    deriveAcquisitionChannel({ landing_path: '/jobs/nyc/software-engineer', utm_source: 'facebook' }),
    'seo',
  )
})

Deno.test('neither present -> direct', () => {
  assertEquals(deriveAcquisitionChannel({ landing_path: null, utm_source: null }), 'direct')
})
