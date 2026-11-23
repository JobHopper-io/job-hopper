import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkCustomerOwnership } from '../stripe-customer-ownership.ts'

const me = { id: 'profile-me', auth_user_id: 'auth-me', email: 'Me@Example.com' }

Deno.test('current customers: supabase_profile_id must match', () => {
  assertEquals(checkCustomerOwnership({ metadata: { supabase_profile_id: 'profile-me', supabase_user_id: 'auth-me' } }, me), { ok: true, via: 'profile_id' })
  assertEquals(checkCustomerOwnership({ metadata: { supabase_profile_id: 'profile-victim', supabase_user_id: 'auth-me' } }, me).ok, false)
})

Deno.test('license billing customers (profile id only) are matched on profile id', () => {
  assertEquals(checkCustomerOwnership({ metadata: { supabase_profile_id: 'profile-me', org_account: 'true' } }, me).ok, true)
})

Deno.test('pre-2026-02-23 customers (user id only) are matched on the auth user id', () => {
  assertEquals(checkCustomerOwnership({ metadata: { supabase_user_id: 'auth-me', subscription_id: 'x' } }, me), { ok: true, via: 'user_id' })
  assertEquals(checkCustomerOwnership({ metadata: { supabase_user_id: 'auth-victim' } }, me).ok, false)
  assertEquals(checkCustomerOwnership({ metadata: { supabase_user_id: 'auth-me' } }, { ...me, auth_user_id: null }).ok, false)
})

Deno.test('no ownership metadata: exact email match (case/whitespace-insensitive) only', () => {
  assertEquals(checkCustomerOwnership({ email: ' me@example.COM ', metadata: {} }, me), { ok: true, via: 'email' })
  assertEquals(checkCustomerOwnership({ email: 'victim@example.com', metadata: {} }, me).ok, false)
  assertEquals(checkCustomerOwnership({ email: null, metadata: null }, me).ok, false)
  assertEquals(checkCustomerOwnership({ email: '', metadata: {} }, { ...me, email: '' }).ok, false)
})

Deno.test('a mismatched id never falls back to email', () => {
  assertEquals(checkCustomerOwnership({ email: 'me@example.com', metadata: { supabase_profile_id: 'profile-victim' } }, me).ok, false)
  assertEquals(checkCustomerOwnership({ email: 'me@example.com', metadata: { supabase_user_id: 'auth-victim' } }, me).ok, false)
})

Deno.test('deleted customers are refused', () => {
  assertEquals(checkCustomerOwnership({ deleted: true, metadata: { supabase_profile_id: 'profile-me' } }, me).ok, false)
})
