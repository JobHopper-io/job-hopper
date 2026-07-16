# Real Sponsorship Data Engine (Phase 5, Days 31–60)

Working document for the Premium "Real Sponsorship Score" and Sponsor Watch features.
Covers: data sources, current-state audit, the scoring approach, a proposed data model,
and the revised day-by-day plan. Last updated 2026-07-16.

**Status: D31–35 (ingest) is DONE and loaded to the live project — see §5a. D36–40 (entity
resolution) is next.**

> **⚠️ Read this before trusting anything below.** Three of this doc's original claims turned out
> to be false when checked against the real files. They're struck in place, not deleted, so the
> mistake stays visible. **The file — not this doc — is the source of truth.** Verify against the
> actual data before relying on any assertion here.
>
> | # | What it says | Where |
> |---|---|---|
> | **Correction #1** | `EMPLOYER_FEIN` **is** present + populated in LCA (doc said "no FEIN"). FEIN is now the primary resolution key. | §1a |
> | **Correction #2** | USCIS export is **`.xlsx` with 6 category pairs / 12 count columns** (doc said 4-column CSV). Also NAICS is a descriptive string, not a bare code. | §1b, §4 |
> | **Correction #3** | ~~"for well-known big sponsors, name matching is near-trivial"~~ — **false, and backwards.** Big names are the *hardest* (`&`, multi-entity, cross-agency spelling). | §3 decision 7 |
> | **Known future risk #1** | `uscis_h1b_hub.naics_code` format is unnormalized **and part of the natural key** → a second FY in the other format = silent duplicate rows. Deliberately not fixed. | §1c |
>
> Decisions made while building, worth reading before D36–40: **§3 decision 3** (USCIS loaded
> unscoped, on purpose), **§3 decision 4** (`&`-vs-`and` name-matching trap, measured), and
> **🔴 §3 decision 5** (brand ≠ legal filer — **needs a product call from Nick/Syed**, blocks
> resolution *and* UI).

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
  - `EMPLOYER_NAME`, `EMPLOYER_FEIN`, `EMPLOYER_CITY`, `EMPLOYER_STATE`, `EMPLOYER_POSTAL_CODE` (+
    address lines)
  - `SOC_CODE`, `SOC_TITLE`, `JOB_TITLE`
  - `TOTAL_WORKER_POSITIONS`
  - `WAGE_RATE_OF_PAY_FROM` / `_TO`, `WAGE_UNIT_OF_PAY`, `PREVAILING_WAGE`
  - `WORKSITE_CITY`, `WORKSITE_STATE`, `WORKSITE_POSTAL_CODE`
- **✅ CORRECTION #1 (2026-07-16) — EMPLOYER_FEIN is present and populated.** A prior version of this
  doc asserted "no FEIN/EIN, name + address only" as a settled fact. That was wrong. Verified by
  parsing the real FY2026 Q2 file directly (not a description of it): `EMPLOYER_FEIN` is a real
  column, 0/20,000 blank in a sample, real EINs (`22-3524303` for LTIMindtree, `95-3630868` for
  Leidos). **FEIN is now the primary employer-resolution key** (`employers.employer_fein` /
  `lca_filings.employer_fein`, §4); normalized name + address + domain + fuzzy/vector matching is
  the **fallback**, used only where FEIN is genuinely missing. Coverage in older FYs hasn't been
  checked — don't assume FEIN is universal across every fiscal year without re-verifying on that
  year's actual file.

### 1b. USCIS — H-1B Employer Data Hub (the "outcome" signal)

- **What it is:** **actual petition decisions** (approvals/denials) at the **employer level**,
  aggregated per fiscal year. Confirms whether an employer's petitions actually get approved.
- **Where:** `https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub`
  (bulk files under `.../archive/h-1b-employer-data-hub-files`).
- **Format:** Excel or **CSV**. Coverage **FY2009 → FY2025 Q4** (updated ~annually/quarterly).
- **✅ Partial tax ID:** USCIS identifies employers by the **last four digits of their tax ID** —
  a weak but real disambiguator (name + city + state + last-4 EIN narrows collisions).
- **Limits:** annual granularity, employer-aggregated (no job title / wage / worksite detail).
- **✅ CORRECTION #2 (2026-07-16) — real export has 6 approval/denial category pairs, not 4.** A prior
  version of this doc described the columns as fiscal year + employer/city/state/ZIP/NAICS +
  **Initial Approvals/Denials, Continuing Approvals/Denials** (4 columns) — the shape of the old
  simple annual-aggregate archive file (`h1b_datahubexport-YYYY.csv`, still valid for years up to
  ~2023). The current "Employer Information" (Line-by-line) export USCIS actually serves is
  **`.xlsx`**, not CSV, and reports **12 count columns across 6 categories**: `New Employment`,
  `Continuation`, `Change with Same Employer`, `New Concurrent`, `Change of Employer`, `Amended`
  (each Approval + Denial). Real header, confirmed by parsing the file directly: `Line by line,
  Fiscal Year, Employer (Petitioner) Name, Tax ID, Industry (NAICS) Code, Petitioner City,
  Petitioner State, Petitioner Zip Code, New Employment Approval/Denial, Continuation
  Approval/Denial, Change with Same Employer Approval/Denial, New Concurrent Approval/Denial,
  Change of Employer Approval/Denial, Amended Approval/Denial`. `uscis_h1b_hub` (§4) stores all 12
  raw columns — collapsing them into a 4-bucket summary is a scoring-layer decision for later
  (D41–45), not something ingestion should decide by discarding data. `NAICS` here is the full
  descriptive string (e.g. `"54 - Professional, Scientific, and Technical Services"`), not a bare
  code like the old archive file's `"54"` — stored as-is, not reformatted.

### 1c. Reality checks that shape the features

- **LCA = applications (intent); USCIS Hub = approvals (outcome).** A credible score wants both.
- **No live feed.** DOL is quarterly, USCIS ~annual → **Sponsor Watch = quarterly diff alerts,
  not real-time monitoring.** Copy must reflect this.
- **Schema drift** across fiscal years → a per-year column-normalization step is mandatory.
- **⚠️ KNOWN FUTURE RISK #1 (logged 2026-07-16, deliberately NOT fixed) — `uscis_h1b_hub.naics_code`
  format is unnormalized and is part of the natural key.** The FY2026 export gives NAICS as a full
  descriptive string (`"54 - Professional, Scientific, and Technical Services"`); the older
  archive files (`h1b_datahubexport-YYYY.csv`, ~2023 and earlier) give a bare code (`"54"`). We
  store whatever the file says, verbatim. Because `naics_code` is part of
  `uscis_h1b_hub_natural_key` (§4), **the same employer + same NAICS would key differently across
  the two formats** — so ingesting a second FY whose export uses the other format yields *silent
  duplicate rows* (two rows for one employer/year/location) instead of a clean upsert. No error,
  no collision, just quietly wrong data feeding the score. **This is only latent while FY2026 is
  the only ingested year.** Whoever ingests a second FY must first decide the normalization
  (parse the leading code out into `naics_code` and keep the description separately, or normalize
  at read time) — and check the actual format of *that* year's file rather than assuming, since
  the format demonstrably changes. Same class of trap as Correction #1/#2: the file, not the doc,
  is the source of truth.
- **Third-party aggregators** (myvisajobs, h1bdata.info, h1bgrader) repackage this same DOL data.
  Fine for a validation prototype; **ToS/attribution risk** for a paid production feature — build
  on the primary government files for launch.

---

## 2. Current-state audit — what we have vs. not

| Phase 5 workstream | Status | Evidence in repo |
|---|---|---|
| **DOL/USCIS ingestion** (D31–35) | ✅ **Built + loaded 2026-07-16** | Schema: migrations `20260716200000` + `20260716210000` (both pushed). Code: `job-processor-service/job_processor/{lca_normalizer,sponsorship_scope,sponsorship_ingest}.py`, CLI `job-processor sponsorship {scope-list,ingest-lca,ingest-uscis}`. Data loaded to the live project: `lca_filings` (FY2026 Q1+Q2, scoped to top 400) + `uscis_h1b_hub` (FY2026, **full file**, 36,624 rows). `employer_id` null throughout — resolution is D36–40. Scope artifact: `job-processor-service/data/scope_top_sponsors.csv` (committed); raw source files are gitignored (`data/raw/`, 138MB). |
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
2. **Entity resolution keys on EMPLOYER_FEIN when present; fuzzy/vector is the fallback** — see
   the 2026-07-16 correction in §1a: LCA *does* carry a real, populated FEIN column, reversing the
   original "no FEIN" premise this decision used to rest on. FEIN match is now the primary,
   near-deterministic path (trivial for the top 300–500 scope); normalized name + city/state +
   domain + USCIS last-4 tax ID narrow candidates for whatever's left without a FEIN.
3. **USCIS is loaded UNSCOPED — scoping deliberately dropped, not fixed (decided 2026-07-16
   during ingest).** Scoping is now **per-source**, not global:
   - **LCA stays scoped** to the top-400 list (`data/scope_top_sponsors.csv`), filtered on
     `EMPLOYER_FEIN`. Justified: the file is ~1M rows (the filter earns its keep) and FEIN is an
     exact key (the filter is lossless).
   - **USCIS loads in full** — all **36,624** rows, no filter. `ingest-uscis` takes **no
     `--scope` flag**; passing one would be meaningless.

   **Why, and what we rejected.** USCIS has no full FEIN (last-4 only), so the only filter
   available is employer **name** — which is measurably lossy (decision 4: it silently dropped
   **Goldman Sachs, JPMorgan, McKinsey, Ernst & Young**, among 61 of 399 employers). The obvious
   move was to patch the matcher (`&`→`and`). **We rejected that:** it recovers only **24 of the
   61**; the remaining 37 need real fuzzy matching, i.e. D36–40 work being smuggled into D31–35
   under time pressure — the exact conditions that produce a half-right matcher nobody revisits.
   Meanwhile the entire prize for scoping USCIS was **~3MB and ~40 seconds**. So: negligible
   savings, bought with a silent-data-loss risk on our most important employers. **Correctness
   over premature optimization** — load everything, let D36–40 resolve matches with proper
   tooling against data that's already there.

   **Consequence to keep in mind:** `uscis_h1b_hub` contains the whole U.S. employer universe
   (36,624 rows), while `lca_filings` holds only the top 400. The two tables are deliberately
   *not* the same population. Don't "fix" this by trimming USCIS — join through resolved
   `employer_id` once D36–40 lands.
4. **⚠️ Name matching across the two sources is a trap — DOL writes `&`, USCIS writes `and`.**
   Measured, not theorized: filtering the USCIS file by normalized employer name dropped **61 of
   399** scope employers (15%), including **Goldman Sachs (#4 by LCA volume), JPMorgan, McKinsey,
   Ernst & Young, Deloitte, Morgan Stanley, AT&T**. `"GOLDMAN SACHS & CO. LLC"` → `goldman sachs
   co` vs USCIS `"GOLDMAN SACHS AND CO"` → `goldman sachs and`. Compounding variants: `U.S.` → `us`
   vs `U S` → `u s`; `Amazon.com` vs `Amazon com`. A naive `&`→`and` fix recovers only 24 of the
   61 — the rest need real fuzzy/vector matching. **D36–40 must not resolve employers on
   normalized-name equality.** Also note `sponsorship_scope.normalize_employer_name` is a
   deliberately crude helper for *grouping LCA rows by FEIN-or-name*, not a resolution primitive —
   don't promote it into one.
5. **🔴 PRODUCT DECISION NEEDED (not an engineering bug) — a brand and a legal filer are not
   1:1, in both directions. → Nick / Syed.** Found in the real FY2026 data while building the
   scope list. This is *correct* data, not dirty data; there is no cleaning step that resolves
   it, only a product choice:
   - **One name → many FEINs.** `Regeneron Pharmaceuticals, Inc.` appears **twice**, spelled
     byte-identically, under two different tax IDs (`46-4073600`, 586 positions; `13-3444607`,
     251 positions) — two legally separate companies filing under one trade name. This is why
     the 400-row scope list has only 399 distinct names.
   - **One brand → many names+FEINs.** `GOLDMAN SACHS & CO. LLC` / `GOLDMAN SACHS BANK USA` /
     `GOLDMAN SACHS SERVICES LLC` — three names, three FEINs, three separate top-10 scope
     entries (14,585 / 14,178 / 14,090 positions), one brand everyone calls "Goldman Sachs."

   So the mapping between *"a company as a job seeker thinks of it"* and *"a filer in government
   data"* is **many-to-many**. Any resolution that assumes either direction is 1:1 is wrong.

   **The questions D36–40 cannot answer alone — they're product, and they change what the UI can
   show, not just how resolution works:**
   - Someone searches **"Regeneron"** — one company or two? If we keep the entities separate,
     which score do we show? If we merge, we're asserting a corporate relationship the filing
     data doesn't state.
   - A posting says **"Goldman Sachs"** — do we sum all three entities' filings into one
     brand-level score (the number a job seeker probably means), or score only the specific
     legal entity that would sponsor them (the number that's literally true)? Summing inflates;
     not summing shows "Goldman Sachs" three times with three different scores.
   - Does **`sponsor_watch_subscriptions.employer_id`** point at a brand or a filer? Watching
     "Goldman Sachs" and only getting alerts for one of three entities is a broken feature; the
     schema currently has no brand concept at all (§4).

   **Decide the model before writing resolution code** — merging to brand-level needs a
   parent/brand layer in §4 (`employers` has no such column today) and is far cheaper to add now
   than to retrofit after scores exist. Note this cuts against §3 decision 2's "FEIN is
   near-deterministic": FEIN reliably identifies a *filer*, which is only the answer if a filer
   is what we mean to show.
6. **The Real Score blends filings with the existing heuristic** — real filing-based score where
   an employer has filings; fall back to `inferSponsorshipLikelihood` where it doesn't; and
   **confidence reflects data coverage.** This is the honest UX for "top 300–500 employers first."
7. **Scope to the top 300–500 high-volume sponsors FIRST** — and move that scoping *earlier*, not
   just as the launch gate, so we get a real live score without solving long-tail entity
   resolution up front. ~~for well-known big sponsors, name matching is near-trivial~~ —
   **✅ CORRECTION #3 (2026-07-16): struck, this premise was false.** Being well-known is exactly what makes an
   employer's name *harder*: big firms have ampersands, multiple legal entities, and
   inconsistent spellings across agencies (see decision 4 — the name filter missed Goldman
   Sachs, JPMorgan, McKinsey, EY). Scoping still holds, but it's justified by **file
   tractability + FEIN being exact**, *not* by names being easy. Done: FY2026 LCA scoped via
   FEIN, 102,821 filings across the top 400.
8. **Sponsor Watch = quarterly diff alerts** on existing cron + `sendEmail`, not net-new
   real-time workers. Set expectations in copy.
9. **OPEN:** Is the Real Score a **replacement** of the heuristic badge, or a **separate
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
  employer_fein     text null    -- PRIMARY resolution key when present (2026-07-16 correction,
                                  -- see §1a); unique where not null
  domain            text null    -- reuse domain_resolution.py / company_apollo_cache
  primary_naics     text null
  hq_city, hq_state text null
  tax_id_last4      text null    -- from USCIS Hub, secondary disambiguator (used with/without FEIN)
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
  case_number       text        -- unique
  employer_id       uuid fk null   -- null until resolved
  employer_name_raw text
  employer_fein     text null    -- raw captured value; primary resolution key (see §1a)
  case_status       text        -- Certified / Certified-Withdrawn / Denied / Withdrawn
  visa_class        text
  received_date, decision_date date
  soc_code, soc_title, job_title text
  total_worker_positions int
  wage_from, wage_to numeric, wage_unit text, prevailing_wage numeric
  worksite_city, worksite_state, worksite_postal_code text
  fiscal_year       int
  source_file       text

uscis_h1b_hub                  -- USCIS approvals/denials, employer-aggregated
  id                uuid pk
  employer_id       uuid fk null
  employer_name_raw text
  fiscal_year       int
  tax_id_last4      text null
  naics_code        text null    -- full descriptive string as USCIS gives it, e.g. "54 - ...",
                                  -- NOT a bare code. Part of the natural key below → format
                                  -- change across FYs = silent dupes. See the KNOWN FUTURE RISK
                                  -- in §1c before ingesting a second fiscal year.
  city, state, zip  text
  -- CORRECTED 2026-07-16, see §1b: real export has 6 category pairs (12 columns), not a
  -- 4-bucket initial/continuing summary. Landed via a follow-up migration (20260716210000)
  -- since 20260716200000 was already pushed with the old 4-column shape.
  new_employment_approvals, new_employment_denials int
  continuation_approvals, continuation_denials int
  change_same_employer_approvals, change_same_employer_denials int
  new_concurrent_approvals, new_concurrent_denials int
  change_employer_approvals, change_employer_denials int
  amended_approvals, amended_denials int
  -- unique on (fiscal_year, employer_name_raw, tax_id_last4, city, state, zip, naics_code).
  -- naics_code had to be in the key (verified against the real FY2023 file: ~2% of rows collide
  -- without it — same employer/location filed under >1 NAICS). Even with naics_code, a residual
  -- ~0.5% share an identical key with different counts (dupe rows in USCIS's own export) — those
  -- get summed, not overwritten, before upsert (see job_processor/sponsorship_ingest.py).

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
- **D36–40 — Entity resolution.** **[CHANGED, then CORRECTED 2026-07-16]** *Next up — the data is
  loaded and waiting (`employer_id` is null on all 102,821 `lca_filings` + 36,624 `uscis_h1b_hub`
  rows).* LCA rows carry a real, populated `EMPLOYER_FEIN` (see §1a) — resolution keys on FEIN
  first (near-deterministic for the scoped top 300–500); normalize name + city/state + domain +
  USCIS last-4 tax ID to narrow candidates only where FEIN is missing; fuzzy/vector for whatever's
  left. **⚠️ The LCA↔USCIS join is the hard part and it has no FEIN to lean on** — USCIS gives
  only last-4 tax ID, and matching on normalized name is measurably broken (§3 decision 4: misses
  15% of employers incl. Goldman Sachs/JPMorgan/McKinsey). Budget real effort here; this is where
  fuzzy/vector actually earns its place, not in the long tail. pgvector likely still unnecessary
  for FEIN-side resolution.
- **D41–45 — Scoring/confidence.** **[CHANGED]** *Reframe.* Formula blends LCA volume/recency +
  USCIS approval ratios **with the existing `inferSponsorshipLikelihood` heuristic as fallback**;
  `confidence` = f(data coverage); emit plain-text `rationale`. Reuses live code.
- **D46–50 — Sponsorship UI.** **[CHANGED]** *Reduce.* Extend `JobSponsorshipBadge.vue` +
  `sponsorship_likelihood` surface rather than rebuild: numeric score, rationale tooltip, filters
  (`requires_us_sponsorship` already exists). **Blocked on §3 decision 9** (replace vs. add badge).
- **D51–55 — Sponsor Watch.** **[CHANGED]** *Reframe.* Quarterly diff-alert worker on
  `scheduled_jobs` + pg_cron; alerts via `sendEmail`. Not real-time.
- **D56–60 — Validation + launch, Score v1.** *Stick.* Validate on the 300–500 set; spot-check
  against known sponsors; launch scoped, expand the employer universe after.

---

## 5a. Status — D31–35 (ingest) DONE 2026-07-16; D36–40 (resolution) is next

Phase 5 is approved and building, targeting Premium features **1 (Real Sponsorship Score)** and
**2 (Sponsor Watch)**. ~~Nothing in the engine exists yet — Days 31–35 (ingest) is the blocker~~ —
**ingest shipped 2026-07-16.** All five original next-actions below are done except the last:

1. ~~Pick the employer scope~~ → **done.** `data/scope_top_sponsors.csv`, top 400 by summed
   `TOTAL_WORKER_POSITIONS`, FY2026 Q1+Q2. Grouped on FEIN (not name — see §3 decision 2).
2. ~~Build the per-fiscal-year column normalizer~~ → **done.** `job_processor/lca_normalizer.py`,
   header-text-driven with an extensible `CANONICAL_FIELD_ALIASES` table; stdlib-only streaming
   (`zipfile` + `iterparse`), no openpyxl/pandas. Unit-tested against synthetic fixtures
   (`tests/test_lca_normalizer.py`, `pytest` is now a dev dep).
3. ~~Land the migration~~ → **done + pushed.** `20260716200000` (all 7 tables) and
   `20260716210000` (USCIS 12-column correction — see §1b).
4. ~~Ingest LCA + USCIS~~ → **done, loaded to the live project.** `lca_filings` = 102,821 rows
   (scoped, FEIN-matched; independently verified — equals `sum(filing_count)` in the scope CSV
   exactly). `uscis_h1b_hub` = 36,624 rows (**full file, unscoped** — §3 decision 3).
   `employer_id` is null on every row, by design.
5. **← STILL OPEN. Resolve §6 decision 1 before any UI work** (D46–50 is blocked on it).

**Next:** D36–40 entity resolution. Read §3 decisions 2 and 4 first — FEIN makes the LCA side
near-trivial, but the **LCA↔USCIS join has no FEIN** and name matching is measurably broken.

**Reproducing the ingest** (raw files are gitignored; `dol.gov` blocks automated download —
Akamai 403 — so the LCA `.xlsx` must be fetched by hand from the Disclosure Data tab):
```
job-processor sponsorship scope-list  --input data/raw/<LCA>.xlsx --output data/scope_top_sponsors.csv --fiscal-year 2026 --top-n 400   # ~14 min
job-processor sponsorship ingest-lca   --input data/raw/<LCA>.xlsx --scope data/scope_top_sponsors.csv --fiscal-year 2026 [--dry-run]   # ~15 min
job-processor sponsorship ingest-uscis --input "data/raw/Employer Information.xlsx" [--dry-run]                                          # ~1 min, no --scope
```
Both ingests are idempotent (upsert on `case_number` / the USCIS natural key), so re-running is
safe. `--dry-run` parses and counts but writes nothing.

**Where the code lives:** ingestion is a batch/ETL job over large files — the FastAPI
`job-processor-service/` is the natural host (it already does Apollo/web/LLM batch work and has
`domain_resolution.py`), not a Deno edge function. Note these are **local, human-triggered CLI
commands**, not the `/v1/runs` HTTP-and-poll pipeline: the multi-hundred-MB source files live
wherever a human downloaded them. Scoring reads can be exposed to the frontend via an edge
function or a plain table read through `src/lib/`.

## 6. Open decisions to resolve before building

1. **Score presentation (§3 decision 9):** replace the heuristic badge, or show a separate Premium
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
