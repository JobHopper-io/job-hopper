import type { PayType } from '@/types/database'

export function formatPayRange(payMin: number | null, payMax: number | null, payType: PayType | null): string | null {
  if ((payMin == null && payMax == null) || !payType) return null
  const fmt = (n: number) => (payType === 'year' ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`)
  const suffix =
    payType === 'hour' ? 'hr' : payType === 'month' ? 'mo' : payType === 'week' ? 'wk' : payType === 'day' ? 'day' : 'yr'
  if (payMin != null && payMax != null) return `${fmt(payMin)}–${fmt(payMax)}/${suffix}`
  if (payMin != null) return `${fmt(payMin)}+/${suffix}`
  return `Up to ${fmt(payMax as number)}/${suffix}`
}

/** First employment type only (e.g. "full_time" -> "full time") - kept to one chip's worth. */
export function formatEmploymentType(types: string[] | null | undefined): string | null {
  if (!types?.length) return null
  return types[0].replace(/_/g, ' ')
}
