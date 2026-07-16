# Real Sponsorship Data Engine (Phase 5, Days 31–60)

Working document for the Premium "Real Sponsorship Score" and Sponsor Watch features.
Covers: data sources, current-state audit, the scoring approach, a proposed data model,
and the revised day-by-day plan. Last updated 2026-07-15.

> **Positioning.** Today's sponsorship signal is a **heuristic** badge
> (`sponsorship_likelihood` = Low/Medium/High, inferred from posting metadata). The Premium
> layer replaces/augments it with a score grounded in **actual U.S. government filing data**.
> This is the headline Premium differentiator (see `docs/` pricing/tier notes and
> `src/views/Pricing.vue`).

---

## 1. Data sources (verified 2026-07-15)

Both sources are **free, public, no API key, U.S. government works (public domain — no license
restriction on reuse).** Acquisition is trivial; the work is normalization + entity resolution.

### 1a. DOL OFLC — LCA disclosure data (the "intent" signal)

- **What it is:** every **Labor Condition Application (LCA)** an employer files with the Dept. of
  Labor as a *precondition* to an H-1B / H-1B1 / E-3 petition. It captures **intent and volume**
  of sponsorship, not approvals.
- **Where:** DOL ETA Office of Foreign Labor Certification — Performance Data page:
  `https://www.dol.gov/agencies/eta/foreign-labor/performance`
  (also mirrored on data.gov: "OFLC Case Disclosure Data").
- **Format:** Microsoft Excel (`.xlsx`), one aggregate file per program per **federal fiscal
  year** (Oct 1 – Sep 30). ~**75+ columns**, hundreds of thousands of rows/year.
- **Cadence:** refreshed **quarterly** (cumulative within the FY). e.g. FY2025 Q1–Q4 already out;
  FY2026 Q1 released.
- **Record layout / data dictionary:** a per-quarter PDF, e.g.
  `https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Record_Layout_FY2024_Q4.pdf`
- **Key columns we care about** (names are stable-ish but drift across FYs — normalize per year):
  - `CASE_NUMBER`, `CASE_STATUS` (`Certified` / `Certified-Withdrawn` / `Denied` / `Withdrawn`)
  - `VISA_CLASS` (H-1B / H-1B1 Singapore / H-1B1 Chile / E-3)
  - `RECEIVED_DATE`, `DECISION_DATE`
  - `EMPLOYER_NAME`, `EMPLOYER_CITY`, `EMPLOYER_STATE`, `EMPLOYER_POSTAL_CODE` (+ address lines)
  - `SOC_CODE`, `SOC_TITLE`, `JOB_TITLE`
  - `TOTAL_WORKER_POSITIONS`
  - `WAGE_RATE_OF_PAY_FROM` / `_TO`, `WAGE_UNIT_OF_PAY`, `PREVAILING_WAGE`
  - `WORKSITE_CITY`, `WORKSITE_STATE`, `WORKSITE_POSTAL_CODE`
- **⚠️ No FEIN/EIN.** The LCA disclosure files identify employers by **name + address only** —
  there is **no employer tax ID**. (This corrects an earlier assumption that FEIN was the join
  key.) Entity resolution therefore cannot key-join and must rely on normalized name + address +
  domain + fuzzy/vector matching.

### 1b. USCIS — H-1B Employer Data Hub (the "outcome" signal)

- **What it is:** **actual petition decisions** (approvals/denials) at the **employer level**,
  aggregated per fiscal year. Confirms whether an employer's petitions actually get approved.
- **Where:** `https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub`
  (bulk files under `.../archive/h-1b-employer-data-hub-files`).
- **Format:** Excel or **CSV**. Coverage **FY2009 → FY2025 Q4** (updated ~annually/quarterly).
- **Queryable / columns:** fiscal year, **employer name, city, state, ZIP, NAICS code**, and
  counts of **Initial Approvals, Initial Denials, Continuing Approvals, Continuing Denials**.
- **✅ Partial tax ID:** USCIS identifies employers by the **last four digits of their tax ID** —
  a weak but real disambiguator (name + city + state + last-4 EIN narrows collisions).
- **Limits:** annual granularity, employer-aggregated (no job title / wage / worksite detail).

### 1c. Reality checks that shape the features

- **LCA = applications (intent); USCIS Hub = approvals (outcome).** A credible score wants both.
- **No live feed.** DOL is quarterly, USCIS ~annual → **Sponsor Watch = quarterly diff alerts,
  not real-time monitoring.** Copy must reflect this.
- **Schema drift** across fiscal years → a per-year column-normalization step is mandatory.
- **Third-party aggregators** (myvisajobs, h1bdata.info, h1bgrader) repackage this same DOL data.
  Fine for a validation prototype; **ToS/attribution risk** for a paid production feature — build
  on the primary government files for launch.

---

## 2. Current-state audit — what we have vs. not

| Phase 5 workstream | Status | Evidence in repo |
|---|---|---|
| **DOL/USCIS ingestion** (D31–35) | ❌ None | All gov-data mentions are marketing copy (`About.vue`, `FAQ.vue`, `chatbotKnowledge.ts`). No filing tables, no ingest job. |
| **Entity resolution** (D36–40) | 🟡 Partial, wrong shape | `scoreOrganizationCandidates` / `normalizeCompanyName` / `stripLegalSuffixes` (`_shared/apollo.ts`), `company_apollo_cache`, LLM+Brave `domain_resolution.py`. Resolves *posting → Apollo org*, not *filing → canonical employer*. **No canonical employer table, no pgvector.** |
| **Scoring/confidence** (D41–45) | 🟡 Heuristic already live | `_shared/infer-sponsorship-likelihood.ts` → Low/Med/High, stored in `job_hopper_live.sponsorship_likelihood`, resolved via `getEffectiveSponsorshipLikelihood`. No numeric score, no confidence, no rationale. |
| **Sponsorship UI** (D46–50) | 🟡 Badge + teaser done | `JobSponsorshipBadge.vue` (Low/Med/High + `locked` free-tier teaser). `profiles.requires_us_sponsorship` already feeds matching/filters. No numeric score, rationale tooltip, or Sponsor-Watch surface. |
| **Sponsor Watch** (D51–55) | ❌ None (infra exists) | No worker/route/page. But `scheduled_jobs` + pg_cron + `run-scheduled-jobs` and provider-agnostic `sendEmail` (`_shared/email.ts`) are ready to host it. |
| **Validation + launch** (D56–60) | ❌ N/A | — |

**Reusable today:** the `sponsorship_likelihood` column + enum, the heuristic scorer, the badge
component + `locked` teaser, the sponsorship user-preference, name-normalization helpers, the
scheduled-jobs/email plumbing.

---

## 3. Key decisions

1. **Contact-depth precedent (already shipped, related):** Premium Insights returns tier-driven
   contact counts (free 1 / core 2 / premium 3). See `docs/` note; not part of this engine but
   confirms the baseTier gating pattern we'll reuse for exposing the Real Score to Premium only.
2. **Entity resolution is fuzzy/vector, not key-join** — because LCA has no FEIN. Deterministic
   pieces (normalized name, city/state, domain, USCIS last-4 tax ID) narrow candidates; vector /
   fuzzy string handles the tail. (This reverses the earlier "deterministic-first via FEIN" plan.)
3. **The Real Score blends filings with the existing heuristic** — real filing-based score where
   an employer has filings; fall back to `inferSponsorshipLikelihood` where it doesn't; and
   **confidence reflects data coverage.** This is the honest UX for "top 300–500 employers first."
4. **Scope to the top 300–500 high-volume sponsors FIRST** — and move that scoping *earlier*, not
   just as the launch gate: for well-known big sponsors, name matching is near-trivial, so we get
   a real live score without solving long-tail entity resolution up front.
5. **Sponsor Watch = quarterly diff alerts** on existing cron + `sendEmail`, not net-new
   real-time workers. Set expectations in copy.
6. **OPEN:** Is the Real Score a **replacement** of the heuristic badge, or a **separate
   Premium-only score shown alongside** it? Drives whether D46–50 is "swap the badge's data
   source" or "add a second badge." **← needs a product decision before D46.**

---

## 4. Proposed data model (first concrete step)

New tables (service-role-written; read paths gated by tier for the Premium surface):

```
employers                      -- canonical employer identities
  id                uuid pk
  canonical_name    text
  normalized_name   text        -- for matching (lowercased, legal suffixes stripped)
  domain            text null    -- reuse domain_resolution.py / company_apollo_cache
  primary_naics     text null
  hq_city, hq_state text null
  tax_id_last4      text null    -- from USCIS Hub, disambiguator only
  created_at, updated_at

employer_name_aliases          -- every raw spelling we've seen -> employer
  id                uuid pk
  employer_id       uuid fk -> employers
  raw_name          text
  normalized_name   text
  source            text        -- dol_lca | uscis_hub | apollo | posting
  source_fiscal_year int null

lca_filings                    -- DOL OFLC LCA disclosure rows (H-1B/H-1B1/E-3)
  id                uuid pk
  case_number       text
  employer_id       uuid fk null   -- null until resolved
  employer_name_raw text
  case_status       text        -- Certified / Certified-Withdrawn / Denied / Withdrawn
  visa_class        text
  received_date, decision_date date
  soc_code, soc_title, job_title text
  total_worker_positions int
  wage_from, wage_to numeric, wage_unit text, prevailing_wage numeric
  worksite_city, worksite_state, worksite_postal_code text
  fiscal_year       int
  source_file       text

uscis_h1b_hub                  -- USCIS annual approvals/denials, employer-aggregated
  id                uuid pk
  employer_id       uuid fk null
  employer_name_raw text
  fiscal_year       int
  tax_id_last4      text null
  naics_code        text null
  city, state, zip  text
  initial_approvals, initial_denials,
  continuing_approvals, continuing_denials int

employer_sponsorship_scores    -- computed Real Sponsorship Score (Days 41–45)
  employer_id       uuid fk pk
  score             int          -- 0–100 (or A–F); TBD in scoring spec
  confidence        text         -- Low/Medium/High, from data coverage
  rationale         text         -- plain-text "why", for transparency
  data_coverage     jsonb        -- which sources/years contributed
  fiscal_years_used int[]
  algorithm_version text
  computed_at       timestamptz

sponsor_watch_subscriptions    -- Sponsor Watch (Days 51–55)
  id, profile_id fk, employer_id fk, created_at
sponsor_watch_events
  id, employer_id fk, event_type, delta, fiscal_period, detected_at, notified bool
```

Notes:
- `lca_filings.employer_id` / `uscis_h1b_hub.employer_id` start **null** and are populated by the
  entity-resolution pass — decouples ingestion from resolution.
- Score is per **employer**, then surfaced on a job by resolving the posting's company → employer
  (reusing existing Apollo/domain resolution), degrading to the heuristic on a miss.

---

## 5. Revised day-by-day plan

Overall arc **kept**; four scope changes marked **[CHANGED]**.

- **D31–35 — Ingest & clean.** *Stick.* Download DOL LCA `.xlsx` (per-FY) + USCIS Hub CSV; build
  a per-fiscal-year column-normalizer (handles schema drift); load into `lca_filings` /
  `uscis_h1b_hub` with `employer_id` null. True net-new; the real blocker.
- **D36–40 — Entity resolution.** **[CHANGED]** *De-scope.* Because there's no FEIN: normalize
  name + city/state + domain + USCIS last-4 tax ID to narrow candidates; fuzzy/vector for the
  tail. **Scope to the top 300–500 employers first** (names are easy), so this shrinks. pgvector
  only if the tail needs it.
- **D41–45 — Scoring/confidence.** **[CHANGED]** *Reframe.* Formula blends LCA volume/recency +
  USCIS approval ratios **with the existing `inferSponsorshipLikelihood` heuristic as fallback**;
  `confidence` = f(data coverage); emit plain-text `rationale`. Reuses live code.
- **D46–50 — Sponsorship UI.** **[CHANGED]** *Reduce.* Extend `JobSponsorshipBadge.vue` +
  `sponsorship_likelihood` surface rather than rebuild: numeric score, rationale tooltip, filters
  (`requires_us_sponsorship` already exists). **Blocked on decision #6** (replace vs. add badge).
- **D51–55 — Sponsor Watch.** **[CHANGED]** *Reframe.* Quarterly diff-alert worker on
  `scheduled_jobs` + pg_cron; alerts via `sendEmail`. Not real-time.
- **D56–60 — Validation + launch, Score v1.** *Stick.* Validate on the 300–500 set; spot-check
  against known sponsors; launch scoped, expand the employer universe after.

---

## 5a. Status — GO (decided 2026-07-16)

Phase 5 is approved to build, targeting Premium features **1 (Real Sponsorship Score)** and
**2 (Sponsor Watch)**. Nothing in the engine exists yet — Days 31–35 (ingest) is the blocker and
the first real work. Everything below in §4/§5 stands.

**Immediate next actions, in order:**
1. **Pick the employer scope** — pull the top 300–500 sponsors by LCA volume from the most recent
   FY file. Everything downstream is easier once this list exists.
2. **Build the per-fiscal-year column normalizer** for the DOL LCA `.xlsx` (schema drifts across
   FYs; this is unavoidable and gates all ingestion).
3. **Land the migration** for the §4 data model (`employers`, `employer_name_aliases`,
   `lca_filings`, `uscis_h1b_hub`, `employer_sponsorship_scores`, `sponsor_watch_*`).
4. **Ingest** LCA + USCIS Hub with `employer_id` null; resolve entities as a separate pass.
5. **Resolve decision #1 below before any UI work** (D46–50 is blocked on it).

**Where the code should live:** ingestion is a batch/ETL job over large files — the FastAPI
`job-processor-service/` is the natural host (it already does Apollo/web/LLM batch work and has
`domain_resolution.py`), not a Deno edge function. Scoring reads can be exposed to the frontend
via an edge function or a plain table read through `src/lib/`.

## 6. Open decisions to resolve before building

1. **Score presentation (#6 above):** replace the heuristic badge, or show a separate Premium
   Real Score alongside it?
2. **Score shape:** 0–100 numeric vs. A–F grade vs. High/Med/Low + confidence.
3. **Prototype vs. primary data:** use a third-party aggregator to validate scoring math fast,
   then swap to primary DOL/USCIS files for launch? (Recommended, with the ToS caveat.)
4. **pgvector:** commit to standing up embeddings now, or defer until the long-tail expansion
   past the first 300–500 employers?

---

## Sources

- DOL ETA OFLC Performance Data — https://www.dol.gov/agencies/eta/foreign-labor/performance
- OFLC LCA Record Layout (data dictionary, FY2024 Q4) — https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Record_Layout_FY2024_Q4.pdf
- data.gov — OFLC Case Disclosure Data — https://catalog.data.gov/dataset/office-of-foreign-labor-certification-oflc-case-disclosure-data
- USCIS H-1B Employer Data Hub — https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub
- USCIS H-1B Employer Data Hub Files — https://www.uscis.gov/archive/h-1b-employer-data-hub-files
