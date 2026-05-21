import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { locationQualityFromDistance } from '../job-matching-algorithm.ts'

const bands = {
  d0to10: 1,
  d10to25: 0.85,
  d25to50: 0.65,
  d50to100: 0.35,
  dBeyond100: 0,
}

Deno.test('locationQualityFromDistance: inside subscriber radius is always 1.0', () => {
  const at5 = locationQualityFromDistance(5, 25, bands)
  assertEquals(at5.quality, 1)
  assertEquals(at5.withinRadius, true)

  const at25 = locationQualityFromDistance(25, 25, bands)
  assertEquals(at25.quality, 1)
  assertEquals(at25.withinRadius, true)
})

Deno.test('locationQualityFromDistance: bands apply to miles beyond radius', () => {
  // 30 mi total, 25 mi radius → 5 mi beyond → d0to10 band
  const justOutside = locationQualityFromDistance(30, 25, bands)
  assertEquals(justOutside.quality, bands.d0to10)
  assertEquals(justOutside.withinRadius, false)

  // 40 mi total, 25 mi radius → 15 mi beyond → d10to25 band
  const midOutside = locationQualityFromDistance(40, 25, bands)
  assertEquals(midOutside.quality, bands.d10to25)
  assertEquals(midOutside.withinRadius, false)
})

Deno.test('locationQualityFromDistance: no radius uses absolute distance for bands', () => {
  const at8 = locationQualityFromDistance(8, null, bands)
  assertEquals(at8.quality, bands.d0to10)
  assertEquals(at8.withinRadius, false)

  const at8zero = locationQualityFromDistance(8, 0, bands)
  assertEquals(at8zero.quality, bands.d0to10)
  assertEquals(at8zero.withinRadius, false)
})
