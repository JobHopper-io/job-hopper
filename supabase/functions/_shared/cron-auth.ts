/**
 * True only for server-side callers: the scheduler / other edge functions (service-role
 * bearer) or pg_cron (x-cron-secret). The gateway's verify_jwt alone also admits the
 * public anon key, so system functions must check this themselves.
 */
export function isServiceCall(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) return true
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return !!serviceKey && req.headers.get('Authorization') === `Bearer ${serviceKey}`
}
