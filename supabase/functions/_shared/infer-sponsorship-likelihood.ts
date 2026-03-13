/**
 * Infers sponsorship likelihood from job metadata when sponsorship_likelihood is N/A.
 * Uses job title, industry keywords, location, company size (employee count),
 * and posting language to compute a Low / Medium / High classification.
 */

export type SponsorshipLikelihoodInferred = 'Low' | 'Medium' | 'High'

export interface JobDataForInference {
  title: string | null
  companyName: string | null
  roleCategory: string | null
  location: string | null
  description: string | null
  aiBriefing: string | null
  employeeCount: number | null
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim()
}

function combinedText(job: JobDataForInference): string {
  const parts = [
    job.title,
    job.companyName,
    job.location,
    job.description,
    job.aiBriefing,
  ].filter(Boolean) as string[]
  return parts.map(normalizeText).join(' ')
}

function containsAny(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

function countMatches(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase()
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length
}

// --- Job title keywords: LOW sponsorship likelihood ---
// Hands-on, production-floor, and non-degree roles
const TITLE_LOW: readonly string[] = [
  'operator',
  'operators',
  'technician',
  'technicians',
  'machinist',
  'machinists',
  'assembler',
  'assemblers',
  'assembly',
  'fabricator',
  'fabricators',
  'welder',
  'welders',
  'grinder',
  'grinders',
  'press operator',
  'cnc operator',
  'machine operator',
  'production operator',
  'production worker',
  'warehouse',
  'forklift',
  'material handler',
  'packer',
  'inspector',
  'quality inspector',
  'line worker',
  'shop floor',
  'floor technician',
  'maintenance technician',
  'electromechanical technician',
  'field service technician',
  'installer',
  'installers',
  'mechanic',
  'mechanics',
  'tool and die',
  'toolmaker',
  'die maker',
  'lathe',
  'mill operator',
  'set-up',
  'setup technician',
  'production associate',
  'manufacturing associate',
  'entry level',
  'entry-level',
]

// --- Job title keywords: HIGH sponsorship likelihood ---
// Engineering and specialized roles historically tied to H-1B
const TITLE_HIGH: readonly string[] = [
  'mechanical engineer',
  'electrical engineer',
  'automation engineer',
  'robotics engineer',
  'industrial engineer',
  'software engineer',
  'controls engineer',
  'process engineer',
  'manufacturing engineer',
  'systems engineer',
  'design engineer',
  'quality engineer',
  'reliability engineer',
  'test engineer',
  'validation engineer',
  'firmware engineer',
  'embedded engineer',
  'machine learning engineer',
  'data engineer',
  'devops engineer',
  'solutions architect',
  'technical lead',
  'principal engineer',
  'staff engineer',
  'research engineer',
  'r&d engineer',
  'phd',
  'postdoc',
  'scientist',
  'researcher',
  'architect',
]

// --- Industry keywords: LOW sponsorship likelihood ---
const INDUSTRY_LOW: readonly string[] = [
  'basic fabrication',
  'contract manufacturing',
  'machine shop',
  'machine shops',
  'job shop',
  'job shops',
  'small machine shop',
  'metal fabrication',
  'sheet metal',
  'stamping',
  'die casting',
  'forging',
  'grinding shop',
  'welding shop',
  'assembly line',
  'distribution center',
  'warehouse',
  'logistics',
  'third-party',
  'temp agency',
  'staffing',
  'contract labor',
  'oem supplier',
  'tier 2 supplier',
  'tier 3 supplier',
  'mom and pop',
  'family owned',
  'local shop',
  'regional manufacturer',
]

// --- Industry keywords: HIGH sponsorship likelihood ---
const INDUSTRY_HIGH: readonly string[] = [
  'semiconductor',
  'semiconductors',
  'chip manufacturing',
  'wafer',
  'lithography',
  'robotics',
  'automation',
  'aerospace',
  'defense',
  'automotive engineering',
  'ev ',
  'electric vehicle',
  'battery technology',
  'advanced manufacturing',
  'additive manufacturing',
  '3d printing',
  'photonics',
  'biotech',
  'biotechnology',
  'pharmaceutical',
  'medical device',
  'cleanroom',
  'nanotechnology',
  'artificial intelligence',
  'machine learning',
  'software company',
  'saas',
  'technology company',
  'tech company',
  'research and development',
  'r&d',
  'innovation',
  'automotive oem',
  'tier 1',
  'original equipment manufacturer',
]

// --- Location: higher sponsorship hubs (weaker signal) ---
const LOCATION_HIGH: readonly string[] = [
  'austin',
  'san jose',
  'san francisco',
  'detroit',
  'seattle',
  'boston',
  'raleigh',
  'durham',
  'research triangle',
  'phoenix',
  'chandler',
  'tempe',
  'portland',
  'denver',
  'boulder',
  'ann arbor',
  'dearborn',
  'troy',
  'warren',
  'michigan',
  'silicon valley',
  'bay area',
  'dallas',
  'fort worth',
  'houston',
  'chicago',
  'minneapolis',
  'san diego',
  'los angeles',
  'irvine',
  'santa clara',
  'sunnyvale',
  'mountain view',
  'palo alto',
  'cupertino',
  'fremont',
  'milpitas',
  'san antonio',
]

// --- Posting language: POSITIVE indicators (explicit sponsorship) ---
const POSTING_POSITIVE: readonly string[] = [
  'visa sponsorship',
  'visa sponsorship available',
  'h-1b',
  'h1b',
  'h-1b transfer',
  'h1b transfer',
  'h-1b transfers welcome',
  'h1b transfers welcome',
  'sponsorship available',
  'will sponsor',
  'open to sponsorship',
  'green card',
  'tn visa',
  'work authorization sponsorship',
  'immigration sponsorship',
]

// --- Posting language: NEGATIVE indicators (explicit no sponsorship) ---
const POSTING_NEGATIVE: readonly string[] = [
  'must be authorized to work',
  'authorized to work in the us',
  'authorized to work in the united states',
  'no sponsorship',
  'no sponsorship available',
  'does not sponsor',
  'do not sponsor',
  'will not sponsor',
  'cannot sponsor',
  'unable to sponsor',
  'us citizenship required',
  'u.s. citizenship required',
  'citizenship required',
  'security clearance',
  'secret clearance',
  'top secret',
  'no visa',
  'no h-1b',
  'no h1b',
]

/** Company size bands by employee count (from user guidance) */
function companySizeScore(employeeCount: number | null): number {
  if (employeeCount == null || employeeCount <= 0) return 0
  if (employeeCount < 50) return -2 // Very low
  if (employeeCount < 500) return 0 // Occasional
  if (employeeCount < 5000) return 1 // Moderate
  return 2 // 5000+ High
}

/** Role category from DB enum: engineering tends higher, operations/maintenance lower */
function roleCategoryScore(roleCategory: string | null): number {
  if (!roleCategory) return 0
  const lower = roleCategory.toLowerCase()
  if (lower === 'engineering') return 2
  if (lower === 'management' || lower === 'executive') return 1
  if (lower === 'operations' || lower === 'maintenance') return -2
  return 0 // other
}

/**
 * Infers sponsorship likelihood from job data.
 * Returns 'Low', 'Medium', or 'High'.
 */
export function inferSponsorshipLikelihood(job: JobDataForInference): SponsorshipLikelihoodInferred {
  const text = combinedText(job)

  // Explicit posting language overrides everything
  const posCount = countMatches(text, POSTING_POSITIVE)
  const negCount = countMatches(text, POSTING_NEGATIVE)
  if (posCount > 0 && negCount === 0) return 'High'
  if (negCount > 0) return 'Low'

  let score = 0

  // Company size (strong signal)
  score += companySizeScore(job.employeeCount)

  // Role category (strong signal)
  score += roleCategoryScore(job.roleCategory)

  // Job title keywords
  const titleLow = countMatches(text, TITLE_LOW)
  const titleHigh = countMatches(text, TITLE_HIGH)
  score -= titleLow
  score += titleHigh

  // Industry keywords (from description, briefing, company)
  const industryLow = countMatches(text, INDUSTRY_LOW)
  const industryHigh = countMatches(text, INDUSTRY_HIGH)
  score -= industryLow
  score += industryHigh

  // Location (weaker signal)
  if (containsAny(normalizeText(job.location), LOCATION_HIGH)) {
    score += 1
  }

  // Clamp and map to category
  if (score <= -2) return 'Low'
  if (score >= 3) return 'High'
  return 'Medium'
}

export type StoredSponsorshipLikelihood = 'Low' | 'Medium' | 'High' | 'N/A'

/**
 * Returns the effective sponsorship likelihood: stored value if not N/A,
 * otherwise the inferred value.
 */
export function getEffectiveSponsorshipLikelihood(
  stored: StoredSponsorshipLikelihood | null | undefined,
  job: JobDataForInference,
): SponsorshipLikelihoodInferred {
  if (stored && stored !== 'N/A') {
    return stored
  }
  return inferSponsorshipLikelihood(job)
}
