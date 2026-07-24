import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { deriveAcquisitionChannel } from '../acquisition-channel.ts'

Deno.test('utm_source present -> its own value, lowercased', () => {
  assertEquals(
    deriveAcquisitionChannel({ landing_path: null, utm_source: 'LinkedIn', referrer_host: null }),
    'linkedin',
  )
})

Deno.test('landing_path present, no utm_source -> seo', () => {
  assertEquals(
    deriveAcquisitionChannel({
      landing_path: '/jobs/nyc/software-engineer',
      utm_source: null,
      referrer_host: null,
    }),
    'seo',
  )
})

Deno.test('utm_source wins over landing_path', () => {
  assertEquals(
    deriveAcquisitionChannel({
      landing_path: '/jobs/nyc/software-engineer',
      utm_source: 'google',
      referrer_host: null,
    }),
    'google',
  )
})

Deno.test('referrer_host present, no utm_source/landing_path -> normalized organic label', () => {
  assertEquals(
    deriveAcquisitionChannel({ landing_path: null, utm_source: null, referrer_host: 'www.google.com' }),
    'google (organic)',
  )
})

Deno.test('landing_path wins over referrer_host', () => {
  assertEquals(
    deriveAcquisitionChannel({
      landing_path: '/jobs/nyc/software-engineer',
      utm_source: null,
      referrer_host: 'linkedin.com',
    }),
    'seo',
  )
})

Deno.test('unknown referrer host -> raw host, still labeled organic', () => {
  assertEquals(
    deriveAcquisitionChannel({ landing_path: null, utm_source: null, referrer_host: 'news.ycombinator.com' }),
    'news.ycombinator.com (organic)',
  )
})

Deno.test('nothing present -> direct', () => {
  assertEquals(
    deriveAcquisitionChannel({ landing_path: null, utm_source: null, referrer_host: null }),
    'direct',
  )
})
