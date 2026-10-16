import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PERIOD_LABELS, periodLabel, periodSince, type PeriodKey } from '@/lib/partnerPortal'

/**
 * Reporting period for partner dashboards, kept in the URL (?period=&since=) so a
 * shared link or the printable report opens on the same view. Defaults to the current
 * academic year — the frame a career-services office reports in.
 */
export function usePartnerPeriod() {
  const route = useRoute()
  const router = useRouter()

  const initial = route.query.period as string | undefined
  const period = ref<PeriodKey>(initial && initial in PERIOD_LABELS ? (initial as PeriodKey) : 'academic_year')
  const customSince = ref<string>((route.query.since as string | undefined) ?? '')

  const since = computed(() => periodSince(period.value, customSince.value))
  const label = computed(() => periodLabel(period.value, customSince.value))
  const query = computed(() => ({
    period: period.value,
    ...(period.value === 'custom' && customSince.value ? { since: customSince.value } : {}),
  }))

  watch(query, (q) => {
    const rest = { ...route.query }
    delete rest.period
    delete rest.since
    void router.replace({ query: { ...rest, ...q } })
  })

  return { period, customSince, since, label, query }
}
