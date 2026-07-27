/** Curated course-platform search links for Skills Gap's "what to go learn" section.
 *
 * No course-catalog API is wired up, and letting the LLM name specific course titles/URLs
 * risks hallucinated links - so instead of one specific "course," each topic links out to a
 * search on a handful of well-known platforms, split into real Free vs. Paid tabs. Every
 * search URL pattern below was verified against a real headless browser (not just a raw
 * fetch, since freeCodeCamp/Khan Academy/Coursera are client-rendered SPAs).
 */

export type CourseTier = 'free' | 'paid'

export interface CoursePlatform {
  name: string
  tier: CourseTier
  /** FontAwesome icon tuple - a real brand icon where free-brands-svg-icons has one, a
   * generic fallback otherwise. Framed identically (small badge) so the mix reads as
   * intentional rather than inconsistent. */
  icon: [string, string]
  buildUrl: (query: string) => string
}

const PLATFORMS: CoursePlatform[] = [
  {
    name: 'YouTube',
    tier: 'free',
    icon: ['fab', 'youtube'],
    buildUrl: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} tutorial`)}`,
  },
  {
    name: 'freeCodeCamp',
    tier: 'free',
    icon: ['fab', 'free-code-camp'],
    buildUrl: (q) => `https://www.freecodecamp.org/news/search/?query=${encodeURIComponent(q)}`,
  },
  {
    name: 'Khan Academy',
    tier: 'free',
    icon: ['fas', 'graduation-cap'],
    buildUrl: (q) => `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(q)}`,
  },
  {
    name: 'Coursera',
    tier: 'paid',
    icon: ['fas', 'graduation-cap'],
    buildUrl: (q) => `https://www.coursera.org/search?query=${encodeURIComponent(q)}`,
  },
  {
    name: 'Udemy',
    tier: 'paid',
    icon: ['fas', 'graduation-cap'],
    buildUrl: (q) => `https://www.udemy.com/courses/search/?q=${encodeURIComponent(q)}`,
  },
  {
    name: 'LinkedIn Learning',
    tier: 'paid',
    icon: ['fab', 'linkedin'],
    buildUrl: (q) => `https://www.linkedin.com/learning/search?keywords=${encodeURIComponent(q)}`,
  },
]

export function coursePlatformsForTier(tier: CourseTier): CoursePlatform[] {
  return PLATFORMS.filter((p) => p.tier === tier)
}
