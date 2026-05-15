/** Best-effort role_category for Apollo title lists from pasted job text (BYO / teaser). */

export function inferRoleCategoryFromJobText(
  jobTitle: string,
  jobDescription: string | null | undefined,
): string | null {
  const combined = `${jobTitle}\n${jobDescription ?? ''}`.toLowerCase()
  if (!combined.trim()) return null

  const rules: { needles: string[]; category: string }[] = [
    { needles: ['maintenance technician', 'millwright', 'facilities maintenance'], category: 'maintenance' },
    { needles: ['maintenance', 'reliability engineer'], category: 'maintenance' },
    { needles: ['mechanical engineer', 'electrical engineer', 'software engineer', 'civil engineer'], category: 'engineering' },
    { needles: ['engineer', 'engineering'], category: 'engineering' },
    { needles: ['plant manager', 'operations manager', 'production manager', 'shift supervisor'], category: 'operations' },
    { needles: ['operations', 'logistics', 'warehouse'], category: 'operations' },
    { needles: ['ceo', 'coo', 'cfo', 'president', 'founder', 'owner'], category: 'executive' },
    { needles: ['director', 'vice president', ' vp ', 'general manager'], category: 'management' },
  ]

  for (const { needles, category } of rules) {
    for (const n of needles) {
      if (combined.includes(n)) return category
    }
  }

  return null
}
