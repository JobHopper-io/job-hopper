# Job Hopper Matching Rules (Not Too Tight / Not Too Loose)

**Source:** SOW and product principles. Implementation: `supabase/functions/_shared/job-matching-algorithm.ts` with phrase logic in `phrase-matching.ts`.

---

## Principles

- **Not too tight:** Don’t over-filter; avoid missing good opportunities.
- **Not too loose:** Don’t rank irrelevant jobs highly when the subscriber has clear title/industry intent.

---

## Score scale (0–100)

Every included job receives a **total score from 0 to 100**:

```
total = 100 × (
  w_phrase         × phrase_relevance       (0–1)
+ w_pay            × pay_quality            (0–1)
+ w_location       × location_quality       (0–1)
+ w_recency        × recency_quality        (0–1)
+ w_filter_matches × filter_matches_quality (0–1)
)
```

Category weights `w_*` sum to **1.0** and define how much each dimension can contribute at most (e.g. `w_phrase = 0.45` → phrase can contribute up to 45 points).

`minTotalScore` is on the same 0–100 scale (default **40**).

---

## Hard gates (exclude before scoring)

Jobs that fail any gate are **not ranked** and do not receive a score:

1. **Subscription tier** — job tier must match subscriber’s base plan product keys.
2. **Recency** — `posted_date` (else `created_at`) must not be older than `recency.maxAgeDays`.
3. **Remote opt-out** — remote jobs excluded when subscriber is not open to remote.
4. **Phrase gate** (when enabled) — if subscriber has title/industry intent, job must match at least one **primary** or **industry** phrase on any surface, or a **discriminating** (title-only) phrase on the job **title** surface. Description/briefing-only discriminating matches do not pass.
5. **Pay hard floor** (when enabled) — exclude jobs more than `pay.hardFloorFraction` below subscriber `pay_range_min`.
6. **Relocation gate** (when enabled) — exclude non-remote jobs **> 100 mi** from preferred locations when subscriber is not open to relocation.

There is **no** negative penalty added to the score; failed gates mean exclusion only.

---

## Phrase relevance (0–1)

### Profile building

- Input fields: **target job title** (else current title) and **current industry**, comma-separated **segments**.
- Each segment is normalized (`&` → `and`, hyphens → spaces, lowercase) and kept as a **full primary** phrase.
- **Sub-span primaries:** contiguous n-grams (length ≥ 2) from content after splitting on **connectors** (`and`, `of`, `for`, …) and peeling **seniority** tokens (`senior`, `vp`, `associate`, `director`, level numbers, …) from edges.
- **Discriminating unigrams:** single **content** tokens from peeled sub-segments (not generic occupation words like `engineer`, `analyst`, `manager`). Used for matching and gating on the job **title** only.
- **Industry** uses the same sub-span logic but does **not** emit discriminating unigrams (single content words become industry primaries).

Token classes: `CONNECTOR_TOKENS`, `SENIORITY_TOKENS`, `GENERIC_OCCUPATION_TOKENS` in `phrase-matching.ts`. Words in none of these sets are **content**.

### Matching

- Match with **word boundaries** on normalized job **title**, **description**, and **AI briefing**.
- Optional `match_synonyms` expand aliases for all tiers.
- Relevance scales by **matched word count ÷ longest subscriber primary phrase length**.
- **Tier factors** (default): primary 1.0, industry 0.7, secondary 0.4 (discriminating uses the secondary factor).
- **Surface weights** (default, sum to 1): title 0.6, description 0.3, briefing 0.1.

---

## Pay quality (0–1)

| Situation | Quality |
|-----------|---------|
| Overlaps subscriber range | 1.0 |
| Slightly above range (within `overToleranceFraction`) | `aboveRangeQuality` (default 0.7) |
| Slightly below range (within `underToleranceFraction`) | `nearRangeQuality` (default 0.5) |
| Far below range | 0.0 (may also trigger pay hard floor) |
| Missing salary | `missingSalaryQuality` (default 0.3) |

---

## Location quality (0–1)

When subscriber has preferred locations and coordinates are available:

1. Compute distance (miles) from the job to the nearest preferred location.
2. If `location_radius_miles` is set and distance **≤ radius**, location quality is **1.0** (full points anywhere inside the subscriber’s range).
3. If distance **> radius**, apply admin **distance bands** to **miles beyond the radius** (not absolute distance). Default band qualit
subscriber filters; today it only reflects **target role categories**.

- If the subscriber has **no** target roles → quality **1.0** (neutral).
- If the job’s `role_category` matches one of the subscriber’s target roles (case-insensitive) → **1.0**.
- Otherwise → **0.0** (the category contributes no points, but the job can still rank if other categories score well).

Target roles are set on the subscriber profile / admin test preferences, not in `matching_algorithm_config`.

---

## Configuration

Stored in `public.matching_algorithm_config` (one active row). Admins tune via **Admin → Job matching algorithm**: category sliders, min score, gates, and per-category expanders.

---

## Implementation note

Use one shared `matchJobs` / `matchJobsWithDebug` in the backend so behavior stays identical across `match-jobs`, scheduled matching, and admin `test-job-matching`.
