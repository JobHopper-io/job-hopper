import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { ApolloPersonHit } from '../apollo.ts'
import { pickBestPerson } from '../apollo.ts'

Deno.test('pickBestPerson prefers engineering manager over generic recruiter for engineering roles', () => {
  const hits: ApolloPersonHit[] = [
    { id: '1', name: 'Pat Recruiter', title: 'Technical Recruiter' },
    { id: '2', name: 'Sam Lead', title: 'Engineering Manager' },
  ]
  const best = pickBestPerson(hits, 'engineering')
  assertEquals(best?.id, '2')
})

Deno.test('pickBestPerson returns first hit when titles are generic', () => {
  const hits: ApolloPersonHit[] = [
    { id: 'a', name: 'A', title: 'People Operations' },
    { id: 'b', name: 'B', title: 'Office Manager' },
  ]
  const best = pickBestPerson(hits, 'other')
  assertEquals(best?.id, 'a')
})
