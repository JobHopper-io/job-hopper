# Real Sponsorship Data Engine (Phase 5, Days 31–60)

Working document for the Premium "Real Sponsorship Score" and Sponsor Watch features.
Covers: data sources, current-state audit, the scoring approach, a proposed data model,
and the revised day-by-day plan. Last updated 2026-07-20.

**Status: D31–35 (ingest) DONE. D36 (seed) DONE — 400 employers → 374 post-merge. D37 (reduced)
DONE — 16 brands merged, 6 umbrella FEINs flagged `excluded_from_scoring`. D41–45 (scoring) DONE
— 368 employers scored Low/Medium/High, live in `employer_sponsorship_scores`. §3 decision 11
(Real Score replaces the badge's value; tier-gated tooltip reveals detail) DECIDED 2026-07-17.
D46–50 (UI wiring) DONE 2026-07-18, browser-verified against an isolated local stack — see §5a.
Real-world coverage still depends on the `employers.domain` backfill, **not yet run** (needs a
real `BRAVE_SEARCH_API_KEY`; blocked on that, not on code).

**D51–55 (Sponsor Watch) BUILT 2026-07-20 — migrations/edge function written, NOT pushed/deployed
to production yet (pending explicit go-ahead), and the recurring cron is NOT seeded.** Threshold
decided with Nick/Syed (2026-07-20): alert on score-bucket crossing OR >=25% relative change in
summed `total_worker_positions` — see §5 D51–55 for the full reasoning, the measured real
distribution (367 employers, 62 to 73,690 positions, ~1,189x spread), and why the 25% guard is a
starting estimate, not a measured one (no historical quarter-over-quarter data exists yet).

**D56–60 (Validation) DONE 2026-07-20 — score/confidence distributions and known-sponsor
spot-checks all correct against real data; zero mismatches on independent re-derivation.** One
data-quality edge case found (Tavaro - High score driven by a single 400-position filing); a
≥3-certified-filing floor was proposed, impact measured before applying (dropped exactly 1 of 123
currently-High employers), and **APPLIED to production 2026-07-20** — `compute-scores` re-run,
live distribution confirmed `High 122 / Medium 124 / Low 122` (368 total), Tavaro confirmed
`High → Medium` and nothing else changed. See §5 D56–60. Launch remains blocked on D46–50's
domain backfill and D51–55's deploy, independent of validation/scoring being done.

**🔻 SCOPE: Phase 5 v1 is LCA-ONLY (decided 2026-07-17, §3 decision 7).** D38–40 — the LCA↔USCIS
join and its verification — are **cut from v1 and deferred to a v2 enrichment**. v1 ships a
**filing-intent** score (volume + recency), **not** an approval-outcome score. `uscis_h1b_hub`
keeps its 36,624 ingested rows untouched and ready: **a scope cut, not a rollback.** D38–39's
design is kept verbatim in §5 — **v2 should start from it, not re-derive it.**

> **⚠️ Read this before trusting anything below.** Three of this doc's original claims turned out
> to be false when checked against the real files. They're struck in place, not deleted, so the
> mistake stays visible. **The file — not this doc — is the source of truth.** Verify against the
> actual data before relying on any assertion here.
>
> | # | What it says | Where |
> |---|---|---|
> | **Correction #1** | `EMPLOYER_FEIN` **is** present + populated in LCA (doc said "no FEIN"). FEIN is now the primary resolution key. | §1a |
> | **Correction #2** | USCIS export is **`.xlsx` with 6 category pairs / 12 count columns** (doc said 4-column CSV). Also NAICS is a descriptive string, not a bare code. | §1b, §4 |
> | **Correction #3** | ~~"for well-known big sponsors, name matching is near-trivial"~~ — **false, and backwards.** Big names are the *hardest* (`&`, multi-entity, cross-agency spelling). | §3 decision 9 |
> | **Known future risk #1** | `uscis_h1b_hub.naics_code` format is unnormalized **and part of the natural key** → a second FY in the other format = silent duplicate rows. Deliberately not fixed. | §1c |
>
> Decisions made while building, worth reading before D37: **§3 decision 3** (USCIS loaded
> unscoped, on purpose), **§3 decision 4** (`&`-vs-`and` name-matching trap, measured),
> **§3 decision 5** (brand ≠ legal filer — **decided: merge to brand**; `employers` is
> brand-level, filer identity lives on `employer_name_aliases`, raw filings stay entity-level),
> **§3 decision 6** (**umbrella FEINs** — 52 of 400 tax IDs cover *many* distinct orgs, e.g. one
> FEIN = New York State + 21 SUNY campuses), and **§3 decision 7** (**v1 is LCA-only** — D38–40
> cut/deferred; D37 reduced to confirmed merges + flagging the 52 via `excluded_from_scoring`
> rather than splitting them).
>
> **✅ The brand-level migration is applied** (`20260717120000`, plus `…130000`/`…140000` fixing
> the alias uniqueness constraint — see §3 decision 5, which is worth reading as a cautionary
> tale: the constraint was reasoned about twice and wrong twice before being *measured*).

---

### 🔬 Working principle: spot-check every detection pass against known-obvious cases

**Applies to every automated detection/matching/clustering step in this pipeline — name
normalization, prefix clustering, fuzzy matching, whatever comes next. Not tied to one finding.**

Before trusting any such pass, **run it against a handful of cases whose answer you already
know** and check it gets them right. Then look at what it *didn't* return, not just what it did.

**Why this is a rule and not a nicety: every one of these bugs was found this way, and none of
them threw an error.** They returned plausible numbers and exit code 0:

| Bug | What it looked like | How it was actually caught |
|---|---|---|
| `&` vs `and` normalization | `rows_matched_scope: 742` — a perfectly reasonable number | Asking *how many of the 400 scope employers appeared?* → 61 missing, incl. Goldman, JPMorgan, McKinsey, EY |
| `.com` breaks prefix clustering | An "amazon" cluster of 4 FEINs / 14,238 positions | Knowing Amazon.com Services (the **#2 employer**, 33,464) *must* be in it — `amazoncom` ≠ `amazon` |
| One name → many FEINs (Regeneron) / one brand → many names (Goldman) | A 400-row scope list | Noticing it held only **399 distinct names** |
| Alias uniqueness constraint | Inserts "worked" for two wrong index designs | Counting rows the constraint *permits* (400, then 517) vs. rows actually needed (642) |
| `max()` similarity mislabelling umbrellas | Sensible-looking a/b/c label distribution | Checking SUNY/NYC/UMass specifically → all three mislabelled as "typos". With 22 names there are 231 pairs, so *some* pair is always ≥0.75 similar and `max()` always fires |
| RLS policy with no underlying `GRANT` (D46–50) | `npm run build` green, page rendered fine, badge showed a value — looked like the ordinary "no match, fell back to heuristic" path | Only caught by an actual authenticated browser request: PostgREST 403'd the query outright. `create policy ... using (true)` was live and correct, but Postgres requires the base `GRANT SELECT` before a policy is even evaluated — RLS filters rows an *already-permitted* operation returns, it doesn't itself grant the permission. `employers`/`employer_sponsorship_scores` were readable by literally nobody (service role only) from `20260717180000` until this was caught and fixed in `20260718120000`, in production. Neither `npm run build` nor `npm run type-check` can catch this class of bug — nothing about it is a type error. |
| `sponsor-watch-check` manual auth test 401'd with a "confirmed-valid" key (D51–55) | `{"error":"Unauthorized"}` on every attempt, including a fresh key pasted straight from `job-processor-service/.env` — looked exactly like a code bug in `isAuthorized()` or a broken/corrupted platform auto-injection | A length-only diagnostic log (never the secret itself) showed the deployed function's live `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` is **41 characters**, not the **~219-character** legacy JWT sitting in `.env`. Adding the same log to the already-working `reconcile-subscriptions` confirmed it *also* reports 41 — proving this is project-wide and current (Supabase's newer `sb_secret_...` key format), not corrupted and not specific to the new function. `.env` held a stale legacy-format key. Production's real cron path (pg_cron → `run-scheduled-jobs` → target function) was never affected: both sides always read the *live* auto-injected value fresh at request time and never touch `.env`, so they're self-consistent by construction regardless of which format is current. Only manual hand-testing with a stale copied credential surfaced this. |

**⚠️ Manual hand-testing a service-role-gated edge function must pull the current key from Supabase
Dashboard → Project Settings → API, not from `job-processor-service/.env`.** That file is a
manually-maintained snapshot and can silently go stale relative to whatever Supabase currently
auto-injects as `SUPABASE_SERVICE_ROLE_KEY` — as it did here. A `===` comparison against a stale
copy fails exactly like a broken function even when nothing is broken.

**The pattern is identical every time: the failure is silent and the output is plausible.** A
number that looks about right is the characteristic *symptom*, not evidence of correctness. Green
tests and a zero exit code prove nothing about a matcher.

**So:** pick cases you can verify independently (a known-big employer, a known-duplicate, a known
count), assert against them, and report the number rather than asserting it's fine. Prefer
measuring the real data over reasoning about what it probably contains — **reasoning has lost
every time it was checked** in this project.

> **Positioning.** Today's sponsorship signal is a **heuristic** badge
> (`sponsorship_likelihood` = Low/Medium/High, inferred from posting metadata). The Premium
> layer replaces/augments it with a score grounded in **actual U.S. government filing data**.
> This is the headline Premium differentiator (see `docs/` pricing/tier notes and
> `src/views/Pricing.vue`).

---

## 0. Premium features roadmap status (2026-07-20)

This doc is Phase 5's working doc for features 1–2 only; no other doc tracks all five Premium
features in one place, so status for the other three is summarized here for visibility. Feature
list/order follows the user-facing table in `src/views/Pricing.vue:99-103` (all five still show
"Coming soon" there — Premium itself isn't purchasable yet, `available_for_purchase=false`, so
that copy is still accurate regardless of individual feature status).

| # | Feature | Status |
|---|---|---|
| 1 | Real Sponsorship Score | ✅ Done, launch blocked on the `employers.domain` backfill (see D46–50 below) |
| 2 | Sponsor Watch | 🟡 Built, not deployed to production (see D51–55 below) |
| 3 | Apply Intelligence | ⛔ Not started |
| 4 | Hiring Manager Contact | ✅ **Done and verified 2026-07-20** |
| 5 | Ghost Listing Detector | ❌ **Investigated 2026-07-20, not viable as scoped** — closed, not shelved (see below) |

**Hiring Manager Contact was substantially pre-existing, not net-new** — built via
`premium-insights` (`supabase/functions/premium-insights/index.ts`) + `job_hiring_contacts`,
predating this Phase 5 engine entirely. It does a live Apollo people-search per request (not a
stored/cached contact list), tier-gated by `baseTier` (free 1 / core 2 / premium 3 contacts,
seniority-ranked for Premium via `pickTopPeople` in `_shared/apollo.ts`). That tier-depth logic
was added 2026-07-16 but hadn't been verified against a real execution until today: a fresh
production run against a Premium test account returned 3 real, seniority-ranked contacts for
Goleta Sanitary District (Peter Regis, Laura Romano, Robert Hidalgo), matching what was stored in
`job_hiring_contacts` exactly — that live result is itself confirmation `premium-insights` and
`_shared/apollo.ts`'s tier logic are deployed (a real production execution can't succeed against
undeployed code). Still open: overall `job_hiring_contacts` data quality/reliability at scale
beyond this one spot-check.

**Ghost Listing Detector is closed, not shelved for later.** The schema cannot distinguish a
genuine refill from a ghost repost — both produce an identical row signature (same
`company_name`+`job_title`, new `apply_link`, roughly periodic recurrence in `job_hopper_live`,
which is append-only with no status/expiry column). The one thing that actually differs between
them — whether anyone was ever hired — isn't tracked anywhere in this pipeline (no ATS
integration, no hire/outcome feedback). Confirmed empirically against the live table, not
assumed: the top 30 real `company_name`+`job_title` recurrence pairs (up to 36 postings each)
were **30/30 legitimate high-turnover retail/warehouse/hospitality roles** — Foot Locker, ALDI,
Marriott, Costco, FedEx, Walmart, etc. — not ghost-job candidates. A naive recurrence-count
signal would flag exactly the wrong postings first, and even role-category-based noise reduction
only narrows false positives, it can't produce a real positive signal, since the underlying
real-world behavior (a role gets re-advertised) looks the same either way. **Reopening this
requires a real outcome signal that doesn't exist today** — ATS integration or equivalent hire
feedback — not a smarter heuristic on existing data.

**Net: 2 of 5 Premium features remain to build** (Apply Intelligence not started; Ghost Listing
Detector closed as not viable with current data — see above). 3 of 5 done: Real Sponsorship
Score, Sponsor Watch, Hiring Manager Contact.

*(A related but separate finding surfaced during this investigation — matched jobs going stale
in a user's own feed/saved list with no re-check — is a data-hygiene/UX gap affecting all users,
not a Premium feature. Documented in `docs/architecture.md` instead of here.)*

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
  Leidos). **FEIN is now the primary employer-resolution key**; normalized name + address + domain
  + fuzzy/vector matching is the **fallback**, used only where FEIN is genuinely missing. Coverage
  in older FYs hasn't been checked — don't assume FEIN is universal across every fiscal year
  without re-verifying on that year's actual file.
  **Refined 2026-07-17 by §3 decision 5:** FEIN identifies a **filer**, not a brand, so it keys
  the **alias** layer — `employer_name_aliases.employer_fein`, *not* `employers.employer_fein`
  (that column was dropped in `20260717120000`; Goldman has 3 FEINs, one brand row can't hold them).
  `lca_filings.employer_fein` stays as the raw captured value. Resolution: `filing → FEIN → alias
  → employer_id (brand)`.

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
| **Entity resolution** (D36–40) | ✅ **D36–37 done 2026-07-17 (LCA-only, reduced scope)** | `employers` (374, brand-level) + `employer_name_aliases` (642) live. `job_processor/sponsorship_resolution.py`, CLI `job-processor sponsorship {seed-employers,apply-d37-decisions}`. Systematic merge/split + `uscis_h1b_hub` join still D38–40, deferred to v2. |
| **Scoring/confidence** (D41–45) | ✅ **DONE 2026-07-17, LCA-only** (§3 decision 7) | `employer_sponsorship_scores` populated for 368/374 employers (Low/Medium/High score **and** confidence, same scale as the heuristic — no numeric score). `job_processor/sponsorship_scoring.py`, CLI `job-processor sponsorship compute-scores`. Old heuristic (`_shared/infer-sponsorship-likelihood.ts`) untouched — still the fallback for the 6 `excluded_from_scoring` employers and for any company outside this 374-employer scope. |
| **Sponsorship UI** (D46–50) | ✅ **Wiring DONE 2026-07-18**, 0% live coverage until domain backfill runs | `JobSponsorshipBadge.vue` Premium-only data-source swap + rationale tooltip, domain-based job↔employer matching (`job_hopper_live.company_domain` ↔ `employers.domain`), browser-verified. See §5a D46–50. Still needed: run the domain backfill against prod, Sponsor-Watch surface. |
| **Sponsor Watch** (D51–55) | 🟡 **Built 2026-07-20, not deployed** | Migrations (`20260720130000`, `20260720140000`), `sponsor-watch-check` edge function, `sponsor_watch_alert` email template, `SponsorWatchToggle.vue` wired into `JobCard.vue`/`JobDetail.vue` all written. Not pushed to production DB, edge function not deployed, no `scheduled_jobs` seed row (cron not started) — pending go-ahead. See §5 D51–55. |
| **Validation + launch** (D56–60) | 🟡 **Validation + scoring fix done 2026-07-20, launch pending** | Spot-checked score/confidence for all 368 scored employers against known sponsors and against independently re-derived source numbers - zero mismatches. One real data-quality edge case found (Tavaro, single-filing-driven High) - fix (≥3 certified-filing floor) measured, applied, and confirmed in production. Feature launch itself still blocked on D46–50's domain backfill + D51–55's deploy. See §5 D56–60. |
| **LCA↔USCIS join** (D38–40) | ⛔ **CUT from v1 → v2** | `uscis_h1b_hub` stays ingested (36,624 rows, `employer_id` null), untouched and ready. Design kept in §5. **Scope cut, not rollback** (§3 decision 7). |

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
5. **✅ DECIDED 2026-07-17 (Nick/Syed) — `employers` is a BRAND-level identity. Merge to brand.**
   **The finding:** a brand and a legal filer are not 1:1, in *either* direction. This is correct
   data, not dirty data — no cleaning step resolves it, it needed a product call:
   - **One name → many FEINs.** `Regeneron Pharmaceuticals, Inc.` appears **twice**, spelled
     byte-identically, under two tax IDs (`46-4073600`, 586 positions; `13-3444607`, 251) — two
     legally separate companies, one trade name. This is why the 400-row scope list has 399
     distinct names.
   - **One brand → many names+FEINs.** `GOLDMAN SACHS & CO. LLC` (`13-5108880`) / `GOLDMAN SACHS
     BANK USA` (`13-3571598`) / `GOLDMAN SACHS SERVICES LLC` (`13-3937419`) — three names, three
     FEINs, three separate top-10 scope entries (14,585 / 14,178 / 14,090), one brand everyone
     calls "Goldman Sachs."

   **The decision:** a job seeker seeing "Goldman Sachs" or "Regeneron" on a posting gets **one
   combined score**, not per-legal-entity scores.
   - `employers` = **canonical brand identity** (one row for Goldman Sachs).
   - `employer_name_aliases` = **every legal name + FEIN variant → one `employer_id`** (all three
     Goldman entities, both Regeneron FEINs).
   - **`lca_filings` / `uscis_h1b_hub` stay entity-level, unchanged** — raw filing records keep
     their true filer identity for audit accuracy. Only the `employers` rollup is brand-level.
     Nothing is destroyed or collapsed; the brand view is a layer *on top of* faithful records.

   **Why:** matches the existing single-badge UX (`JobSponsorshipBadge.vue` shows one badge per
   posting, not three); avoids showing "Goldman Sachs" three times with three different scores;
   and it's **reversible** — because raw filings keep entity identity, entity-level detail can be
   exposed later as an expansion without re-ingesting anything. Resolves the
   `sponsor_watch_subscriptions.employer_id` ambiguity too: it points at a **brand**, so watching
   "Goldman Sachs" covers all three filers.

   **⚠️ This DOES require a schema change — the "no schema change needed" assumption was wrong.**
   `employer_name_aliases` already supports many-aliases→one-employer, but the §4 schema as built
   (migration `20260716200000`) bakes in *entity*-level assumptions that actively block
   brand-level:
   1. **`employers.employer_fein` is UNIQUE** (`employers_employer_fein_key`, partial where not
      null). A brand-level Goldman row can hold only **one** of its three FEINs — and the unique
      index asserts "one FEIN ⇒ one `employers` row", which is the entity-level model itself.
   2. **`employer_name_aliases` has no FEIN column** — only `raw_name` / `normalized_name`. There
      is nowhere to record "FEIN `13-5108880` belongs to the Goldman brand."
   3. **`employers.tax_id_last4`** has the same one-value-per-brand problem.

   **Required shape** (see §4): move FEIN identity **down to the alias layer** —
   `employer_name_aliases.employer_fein` — and **drop `employer_fein` + `tax_id_last4` from
   `employers`** (a brand has no single FEIN; keeping a "representative" one invites exactly the
   entity/brand confusion this decision resolves). Done in migration `20260717120000`, while both
   tables were still empty.

   **⚠️ Uniqueness on the alias table: `(employer_fein, raw_name)`, and getting there took three
   migrations.** `20260717120000` first shipped `unique (employer_fein)` — reasoning "one FEIN =
   one filer = one brand" straight into a constraint. That is wrong: it enforces *one FEIN = one
   **row***, which contradicts the alias table's purpose (record every spelling a filer uses).
   `20260717130000` tried `(employer_fein, normalized_name)` — also wrong. Only measuring against
   the real 642 (FEIN, raw_name) pairs settled it (`20260717140000`):
   | candidate | max rows | needed | verdict |
   |---|---|---|---|
   | `(employer_fein)` | 400 | 642 | ❌ discards 242 spellings |
   | `(employer_fein, normalized_name)` | 517 | 642 | ❌ discards 125 spellings (`Charter Communications, Inc` vs `Inc.` collapse) |
   | `(employer_fein, raw_name)` | 642 | 642 | ✅ |
   Both wrong versions would have **silently dropped** real spellings. **The invariant "all aliases
   for one FEIN share one `employer_id`" is NOT expressible as a unique index** and is enforced in
   code (`sponsorship_resolution.build_seed_plan`) — verified holding across all 400 after seeding.
   DB-level enforcement would need a separate `employer_feins (employer_fein pk → employer_id)`
   table; deliberately deferred.

   Note this refines §3 decision 2: FEIN is still near-deterministic, but it deterministically
   identifies a **filer**, which is now the *alias* key, not the `employers` key. Resolution is
   two hops: `filing → FEIN → alias → employer_id (brand)`.
6. **✅ DECIDED 2026-07-17 — D37 covers BOTH directions: merge *and* split. Umbrella FEINs are
   real.** Scope change, not an open question. Found during the D36 seed (measured on the real
   400 FEINs now in `lca_filings`, not theorised).

   Decision 5 established that brand↔filer is many-to-many, but its evidence and its fix only
   covered **one direction** — many FEINs → one brand (Goldman, Regeneron), i.e. *merging*. The
   D36 seed surfaced the **inverse**: **one FEIN → many genuinely distinct organisations**, i.e.
   *splitting*. **52 of 400 FEINs (13%)** carry names that normalise to more than one distinct
   org. These are state/city **umbrella tax IDs**, not spelling noise:
   - **`14-6013200` → 22 distinct orgs.** Modal spelling is `State University of New York at
     Stony Brook`, so that becomes the `canonical_name` — but the same row also covers
     **`New York State`**, `New York State Office of Mental Health`, and SUNY **Albany /
     Buffalo / Binghamton**. A University at Albany posting currently resolves to a badge
     reading "Stony Brook."
   - **`13-6400434` → 7 orgs.** Labelled `New York City Department of Education`; also covers
     the **Department of Correction**, **Health & Mental Hygiene**, the **Chief Medical
     Examiner**, and City Planning.
   - **`04-6002284` → 7 orgs.** Labelled `University of Massachusetts Chan Medical School`; also
     covers **Bridgewater State**, **Framingham State**, UMass Amherst/Boston, and
     **`Commonwealth of Massachusetts/Office of the Governor`**.

   **What's wrong, precisely.** The *score* is defensible — New York State really is one legal
   filer, and sponsorship is decided at filer level, so SUNY-wide filing history is a real signal
   for any SUNY campus. The **label is not**: one `canonical_name` per FEIN mislabels the other
   21. For `13-6400434` even score-sharing is doubtful — Education, Correction and the Medical
   Examiner are not one employer to a job seeker.

   **Nothing is lost today.** All 642 raw spellings are alias rows pointing at the correct
   `employer_id`, so the evidence needed to split is already in the DB and re-seeding is cheap.
   This is deliberately left as-is from D36 (one `employers` row per FEIN) rather than
   half-fixed.

   **D37 scope, as decided:** handle merge **and** split. **The split side reuses the same
   manual-review/override mechanism already planned for merging — do not build a second bespoke
   process.** Both are the same shape of problem: an algorithm proposes a grouping, a human
   confirms or overrides it, the override is recorded durably. One review pass over the top 400,
   one override store, two directions. Like merging, the split boundary is **not inferable from
   the filing data** (nothing in either file says Stony Brook and Albany are different employers
   but Goldman's three entities are one) — it needs domain/Apollo signals plus human judgement.
7. **✅ DECIDED 2026-07-17 — Phase 5 v1 is LCA-ONLY. D38–40 cut and deferred to a v2 enrichment.**
   Approved scope change. **A cut, not a rollback:** `uscis_h1b_hub` keeps its 36,624 ingested
   rows, untouched, `employer_id` null — available the moment the join gets built.

   **What v1 ships:** a score from **LCA filings only — volume + recency**. That is a
   **filing-intent** signal ("does this employer file a lot of LCAs, recently?"). It is **not** an
   **approval-outcome** signal ("do their petitions actually get approved?"). Both were in the
   original pitch; only the first survives v1, and the copy must not blur them.

   **Why:** D38–39 (the LCA↔USCIS join) was **the single highest-risk, least-proven step in the
   plan** — the only one with **no deterministic key** to lean on. Everywhere else FEIN carries
   us (§3 decision 2; D36 hit 100% on it). Across agencies there is no FEIN bridge at all: USCIS
   publishes last-4 only, and name matching is *measured* broken (§3 decision 4 — 61/399 missed,
   naive fix recovers 24). Its success rate was unknowable until built. **Cutting it trades the
   biggest schedule risk for a real-but-partial v1.**

   **Knock-on scope cuts:**
   - **D37 reduced** to applying the *already-confirmed* merges (Goldman 3→1, Regeneron 2→1) and
     **flagging** the 52 umbrella FEINs via a new `employers.excluded_from_scoring` boolean —
     rather than splitting them properly. Systematic merge/split detection across all 400, and the
     durable override store, defer to v2 with D38–40. §3 decision 6's design stands; it just isn't
     v1. Still review-then-apply, just smaller.
   - **D40 cut** — it existed only to verify the D38–39 join. LCA-side backfill is already done
     and verified (D36: 102,821/102,821).
   - **D41–45 reduced** — no USCIS input; `confidence` must **explicitly** state the score
     reflects filing activity only, not approval outcomes.
   - **`excluded_from_scoring = true` ⇒ no score at all.** Not degraded, not low-confidence, not a
     guess — nothing, falling back to the existing heuristic badge (which already works and
     doesn't need this feature). A confidently-wrong score on "SUNY Stony Brook" — really New York
     State plus 21 campuses — is worse than no score.

   **For whoever picks up v2:** D38–39's design in §5 is **kept verbatim, not deleted**. Start
   there; don't re-derive it. The hard-won facts (no FEIN bridge, `&`-vs-`and`, 61/399 baseline)
   are still true and still the starting point.
8. **The Real Score blends filings with the existing heuristic** — real filing-based score where
   an employer has filings; fall back to `inferSponsorshipLikelihood` where it doesn't; and
   **confidence reflects data coverage.** This is the honest UX for "top 300–500 employers first."
9. **Scope to the top 300–500 high-volume sponsors FIRST** — and move that scoping *earlier*, not
   just as the launch gate, so we get a real live score without solving long-tail entity
   resolution up front. ~~for well-known big sponsors, name matching is near-trivial~~ —
   **✅ CORRECTION #3 (2026-07-16): struck, this premise was false.** Being well-known is exactly what makes an
   employer's name *harder*: big firms have ampersands, multiple legal entities, and
   inconsistent spellings across agencies (see decision 4 — the name filter missed Goldman
   Sachs, JPMorgan, McKinsey, EY). Scoping still holds, but it's justified by **file
   tractability + FEIN being exact**, *not* by names being easy. Done: FY2026 LCA scoped via
   FEIN, 102,821 filings across the top 400.
10. **Sponsor Watch = quarterly diff alerts** on existing cron + `sendEmail`, not net-new
   real-time workers. Set expectations in copy.
11. **✅ DECIDED 2026-07-17 — Real Score replaces the badge's underlying value; it is not a second
   badge.** Unblocks D46–50.

   **The tension.** Decision 5 already committed to one badge per posting, not one per legal
   entity. Decision 8 said the Real Score should blend with the heuristic where filing data is
   thin. Left open was the UI shape of that blend: does Premium get a visually distinct *second*
   badge next to the existing one, or does the existing badge itself become tier-aware?

   **The decision:**
   - **Free/Core** see exactly today's badge — Low/Medium/High, sourced from
     `inferSponsorshipLikelihood` — pixel-for-pixel unchanged.
   - **Premium**, for the 368 scored employers, sees the **same badge component and the same
     Low/Medium/High value** — just sourced from `employer_sponsorship_scores.score` instead of
     the heuristic — and tapping/hovering reveals the real backing data: confidence + a plain-text
     rationale, e.g. *"High confidence, 127 filings, 586 positions, FY2026"* vs. *"Low confidence,
     thin filing history."*
   - **`excluded_from_scoring = true` employers** (the 6 umbrella FEINs) always show the existing
     heuristic badge, **silently** — no visual marker, no "estimated" label, nothing that signals
     this posting is on the fallback path.

   **Why replace, not add:**
   - **Consistent with decision 5's single-badge UX.** A second Premium-only badge next to the
     existing one reintroduces the exact "three Goldman badges" problem decision 5 eliminated —
     just at the free/premium seam instead of the entity seam — and invites the same "which one do
     I trust" confusion.
   - **Matches the tier-depth precedent already shipped** (decision 1, Premium Insights: same UI,
     `baseTier`-gated depth — free 1 contact / core 2 / premium 3, not a separate premium-only
     panel). The Real Score follows the same shape: same surface, deeper detail behind the gate.
   - **The rationale/confidence tooltip *is* the Premium value**, not the badge itself. That's what
     makes "upgrade to see the real backing data" a legible pitch instead of a second signal
     competing with the first.
   - **Silence on the fallback path is deliberate, not an oversight.** The 6 excluded employers are
     excluded for an *identity* reason (one FEIN, many distinct orgs — decision 6), not a
     *data-quality* reason a user could act on ("try again later," "we don't have enough data
     yet"). There is no actionable difference from the user's side, so no UI difference is
     warranted — this mirrors decision 7's framing: the badge shown for these six is not degraded,
     it's the same heuristic that already works and needs no caveat.

   **What D46–50 now means, concretely:**
   1. **The data-source switch is Premium-only**, not tied to `!isFree`/Core-and-up like the rest of
      the badge's visibility gating. Free and Core keep the exact `inferSponsorshipLikelihood`
      value they see today — *unchanged*, not just "no tooltip." Only for `baseTier === 'premium'`
      does `JobSponsorshipBadge.vue` swap to `employer_sponsorship_scores.score` (when a row exists
      and `excluded_from_scoring` is false, else it falls back to the heuristic same as Free/Core).
      Same Low/Medium/High enum either way, so the swap is invisible at the value level — but the
      *gate* on whether the swap happens at all is `baseTier`, not data availability.
   2. A tooltip/popover, Premium only, surfacing `rationale` + `confidence` whenever the badge is
      real-score-backed. Free/Core get no tooltip (same as today - the badge is presentational
      only for them).
   3. No new visual state for `excluded_from_scoring` postings — that code path is identical to a
      company with no LCA data at all.
   3a. **⚠️ Discovered during implementation, not anticipated by this doc: there is no existing
      link from a job posting to `employers`.** `job_hopper_live.company_name` is freeform scraped
      text; naive normalized-name matching against it is measurably lossy the same way §3 decision
      4 found across DOL/USCIS — tested against the live 16,415-row table and it missed real top-374
      sponsors (`'McKinsey & Company'` didn't match `employers.canonical_name` = `"McKinsey &
      Company, Inc. United States"`; `'JPMorgan Chase Bank, N.A.'` didn't match `"JPMorgan Chase &
      Co."`). **Fix: domain-based matching, not name matching.**
      `job_processor/pipeline.py::process_one_job` already resolves a company domain for every
      ingested job via `resolve_company_domain` (Brave + LLM, no Apollo credits) but silently
      discarded it before the `job_hopper_live` insert (`_normalize_fields` computed
      `company_domain`, `insert_row` never included it). Fixed to persist it. `employers.domain`
      (null since D36 seeding) is backfilled for the 374 scored employers the same way. Matching is
      then exact `job_hopper_live.company_domain = employers.domain` — sidesteps the whole
      freeform-name trap entirely. **Deliberately NOT backfilling domains for the existing
      16,415/8,366-distinct-name job postings** — real Brave+LLM cost across thousands of lookups
      for postings that may already be stale. Coverage grows organically as the scraper pipeline
      re-ingests with the fix in place; until then, unmatched postings fall back to the heuristic
      exactly as `excluded_from_scoring` ones do (3a is a data-coverage gap, not a defect - no UI
      difference, no user-facing signal that a match wasn't found).
   4. `requires_us_sponsorship` filtering is unaffected — still boolean, independent of the
      score/badge value.

---

## 4. Proposed data model (first concrete step)

New tables (service-role-written; read paths gated by tier for the Premium surface):

```
employers                      -- canonical BRAND identity, one row per brand (§3 decision 5).
                                -- "Goldman Sachs" = 1 row, not 3. NOT a legal filer.
  id                uuid pk
  canonical_name    text        -- the brand as a job seeker knows it, e.g. "Goldman Sachs"
  normalized_name   text        -- for matching (lowercased, legal suffixes stripped)
  domain            text null   -- reuse domain_resolution.py / company_apollo_cache
  primary_naics     text null
  hq_city, hq_state text null
  created_at, updated_at
  excluded_from_scoring boolean  -- ⚠️ TO ADD (D37, §3 decision 7). true => show NO score at all,
                                 -- fall back to the inferSponsorshipLikelihood heuristic badge.
                                 -- Set on the 52 umbrella FEINs (§3 decision 6) whose one row
                                 -- wrongly covers many orgs. NOT a degraded/low-confidence score
                                 -- - nothing. A confident wrong score is worse than no score.
  -- ✅ Brand-level as of 20260717120000: employer_fein + tax_id_last4 were dropped from here and
  -- moved to employer_name_aliases (§3 decision 5). A brand has no single FEIN.
  -- ⚠️ AS SEEDED (D36, 2026-07-17) this is NOT yet brand-level in practice: one row per FEIN, so
  -- Goldman is 3 rows and Regeneron 2. D37 merges those. D37 must ALSO split the 52 umbrella
  -- FEINs where one row wrongly covers many orgs (§3 decision 6). Current canonical_name = the
  -- modal raw spelling for that FEIN, which mislabels those 52 (e.g. 14-6013200 is titled
  -- "SUNY Stony Brook" but also covers New York State + 21 other orgs).

employer_name_aliases          -- every legal name + FEIN variant we've seen -> ONE brand.
                                -- This is where FILER identity lives (§3 decision 5).
                                -- All 3 Goldman entities + both Regeneron FEINs -> 1 employer_id.
  id                uuid pk
  employer_id       uuid fk -> employers      -- the BRAND this filer rolls up to
  raw_name          text
  normalized_name   text
  employer_fein     text null   -- ✅ added 20260717120000. THE deterministic resolution key.
  tax_id_last4      text null   -- ✅ added. USCIS-side disambiguator (no full FEIN there)
  source            text        -- dol_lca | uscis_hub | apollo | posting
  source_fiscal_year int null
  -- UNIQUE (employer_fein, raw_name) where employer_fein is not null  [20260717140000]
  --   NOT unique(employer_fein): one filer files under many names (642 rows / 400 FEINs).
  --   NOT unique(employer_fein, normalized_name): distinct raw spellings collapse when
  --   normalized ("Charter Communications, Inc" vs "Inc."), which would discard 125 real
  --   spellings. Both were tried and were wrong - see §3 decision 5.
  -- ⚠️ INVARIANT NOT ENFORCED BY THE DB: "all aliases sharing a FEIN share one employer_id".
  --   No unique index can express it; sponsorship_resolution.build_seed_plan enforces it in
  --   code (verified holding across all 400 post-seed). DB enforcement would need a separate
  --   employer_feins (employer_fein pk -> employer_id) table - deferred, revisit in D37.
  -- Resolution is two hops: filing -> FEIN -> alias -> employer_id (brand).

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

employer_sponsorship_scores    -- computed Real Sponsorship Score (Days 41–45) ✅ DONE 2026-07-17
                                -- v1 IS LCA-ONLY (§3 decision 7): score = filing volume + recency
                                -- from Certified/Certified-Withdrawn lca_filings only. NO USCIS
                                -- input, so this is an INTENT signal, not an APPROVAL-OUTCOME
                                -- signal - rationale states that explicitly on every row.
                                -- ✅ `score` was `int` in the original migration (20260716200000);
                                -- altered to text + check (Low/Medium/High) by 20260717160000 to
                                -- match the decided scale (same as the heuristic badge, no new
                                -- 0-100/A-F system - see §6 item 2, now resolved).
  employer_id       uuid fk pk
  score             text         -- Low/Medium/High, tertile-bucketed on summed positions
  confidence        text         -- Low/Medium/High, from received_date recency share (0.5/0.8
                                  -- cutoffs measured against the real distribution, not guessed)
  rationale         text         -- plain-text "why", real numbers not vague language
  data_coverage     jsonb        -- v1_scope, counted_statuses, filing counts, recency_share
  fiscal_years_used int[]        -- currently always [2026] - single-FY scope
  algorithm_version text         -- "lca_volume_recency_v1"
  computed_at       timestamptz
                                -- 368/374 employers scored; the 6 excluded_from_scoring get NO
                                -- row (not a degraded score) and fall back to the heuristic badge.
                                -- Code: job_processor/sponsorship_scoring.py, CLI
                                -- `job-processor sponsorship compute-scores` (re-runnable: upserts
                                -- on employer_id, deletes any stale row for a since-excluded
                                -- employer). Tests: tests/test_sponsorship_scoring.py.

sponsor_watch_subscriptions    -- Sponsor Watch (Days 51–55)
  id, profile_id fk, employer_id fk, created_at
                                -- employer_id = BRAND (§3 decision 5): watching "Goldman Sachs"
                                -- covers all 3 of its filers. No schema change needed for this.
sponsor_watch_events
  id, employer_id fk, event_type, delta, fiscal_period, detected_at, notified bool
```

Notes:
- **Raw filing tables stay ENTITY-level, deliberately (§3 decision 5).** `lca_filings` and
  `uscis_h1b_hub` keep each row's true filer identity — `employer_name_raw` / `employer_fein` are
  never rewritten or merged. Brand-level is *only* the `employers` rollup, reached via
  `employer_id`. This is what makes the decision reversible: entity-level detail can be exposed
  later without re-ingesting. **Never collapse raw filing records to brand.**
- `lca_filings.employer_id` / `uscis_h1b_hub.employer_id` start **null** and are populated by the
  entity-resolution pass — decouples ingestion from resolution. Post-D36–40 they point at a
  **brand**, while `employer_fein` on the same row still identifies the **filer**. Both are true
  at once, on purpose.
- Score is per **employer**, then surfaced on a job by resolving the posting's company → employer
  (reusing existing Apollo/domain resolution), degrading to the heuristic on a miss.

---

## 5. Revised day-by-day plan

Overall arc **kept**; four scope changes marked **[CHANGED]**.

- **D31–35 — Ingest & clean.** *Stick.* Download DOL LCA `.xlsx` (per-FY) + USCIS Hub CSV; build
  a per-fiscal-year column-normalizer (handles schema drift); load into `lca_filings` /
  `uscis_h1b_hub` with `employer_id` null. True net-new; the real blocker.
- **D36–40 — Entity resolution.** **[CHANGED; CORRECTED 2026-07-16; re-planned 2026-07-17 after
  §3 decision 5]** *Next up — data is loaded and waiting (`employer_id` null on all 102,821
  `lca_filings` + 36,624 `uscis_h1b_hub` rows).* Target: **brand-level `employers`**, with filer
  identity in `employer_name_aliases`. Resolution is **two hops**: `filing → FEIN → alias →
  employer_id (brand)`. Merging happens **at the alias layer only** — raw filings are never
  collapsed. Revised day-by-day:
  - **D36 — schema + the deterministic 80%. ✅ DONE 2026-07-17.** Brand-level migration landed
    (`20260717120000`, + `…130000`/`…140000` fixing alias uniqueness — see §3 decision 5).
    Seeded from the 400 distinct LCA FEINs: **400 `employers`, 642 `employer_name_aliases`
    (every raw spelling, none discarded), 102,821 `lca_filings` backfilled — 100%, 0 orphans.**
    The FEIN key was exactly as deterministic as predicted; no fuzzy matching needed.
    `job_processor/sponsorship_resolution.py`, CLI `job-processor sponsorship seed-employers`
    (re-runnable: already-seeded FEINs are skipped; rolls back its own employers rows on a
    mid-run failure).
  - **D37 — grouping. [SCOPE CUT 2026-07-17 → see §3 decision 7]** *Reduced to the confirmed
    cases only; systematic detection deferred to v2 alongside D38–40.*
    - **Apply the already-confirmed merges only:** Goldman (3 FEINs → 1 brand), Regeneron (2 → 1),
      plus any equivalents surfaced in the review list. **Not** a systematic merge sweep of all
      400.
    - **Flag, don't split:** the **52 umbrella FEINs** (§3 decision 6) get
      `employers.excluded_from_scoring = true` (new column). We do **not** attempt to split
      `14-6013200` into New York State + 21 SUNY campuses. Splitting needs the full review
      mechanism; flagging needs a boolean.
    - **Still review-then-apply**, just smaller: produce the merge-candidate list + confirm the
      52-FEIN list is stable **before** any merge or flag is written.
    - **DEFERRED TO v2:** systematic merge/split detection across all 400, the durable override
      store, and the domain/Apollo-assisted grouping pass. Still the right design (§3 decision 6)
      — just not v1.
  - **D38–39 — LCA↔USCIS join. ⛔ CUT FROM v1, DEFERRED TO v2 (2026-07-17, §3 decision 7).**
    **Not cancelled, not obsolete — deliberately deferred. Do not rebuild this from scratch
    thinking it was never planned.** The design below stands and should be the starting point
    when v2 picks it up:
    > No FEIN on the USCIS side (last-4 only), and name matching is measurably broken (§3
    > decision 4: 61/399 missed; naive `&`→`and` recovers just 24). Plan: block on last-4 +
    > state/city, then fuzzy within block (rapidfuzz/trigram), then LLM adjudication for
    > survivors — the `domain_resolution.py` bounded-fan-out + single-LLM-call pattern fits.
    > **Measure recall against the 400 scope brands and report it** — do not ship this on vibes.

    **Why cut:** this was the single highest-risk, least-proven part of the plan — the one step
    with **no deterministic key to lean on** (the two agencies share no FEIN bridge), and the
    only one whose success rate was unknown until built. Cutting it removes the biggest schedule
    risk in exchange for a **real-but-partial v1**. **`uscis_h1b_hub` stays ingested and
    untouched** (36,624 rows, `employer_id` null) — the data is already there whenever the join
    gets built. **This is a scope cut, not a rollback.**
  - **D40 — backfill + verify. ⛔ CUT FROM v1, DEFERRED TO v2** (it only existed to verify the
    D38–39 join). LCA-side backfill is already done and verified — D36 hit 100% (102,821/102,821).
  - **pgvector: still unnecessary**, now more so — the fuzzy/vector work lived in the deferred
    D38–39.
- **D41–45 — Scoring/confidence. ✅ DONE 2026-07-17.** LCA-only per §3 decision 7. Score/confidence
  shape decided as **Low/Medium/High** (matching the heuristic scale, not 0–100/A–F — see §6 item
  2), which required altering `employer_sponsorship_scores.score` from its original `int` type to
  `text` (migration `20260717160000`; table had 0 rows, no backfill needed). Thresholds were
  measured against the real 368-employer distribution before being hardcoded, not guessed:
  - **Score** (tertiles of summed `total_worker_positions`, Certified + Certified-Withdrawn filings
    only): Low 0–99, Medium 100–192, High 193+. Roughly even thirds (122/123/123) by construction.
  - **Confidence** (share of an employer's filings, any status, with `received_date` in the file's
    most recent 150 days — `fiscal_year` turned out to be uniformly 2026 across the whole scope, so
    it couldn't carry a recency signal the way the original plan assumed; `received_date` could):
    Low <0.5, Medium 0.5–0.8, High ≥0.8. Distribution is heavily right-skewed (median share ≈0.93,
    only ~3% of employers below 0.5) — 0.5/0.8 sit at real gaps in the data, not round numbers.
  - Result: 368/374 employers scored (High 123 / Medium 123 / Low 122; confidence High 286 /
    Medium 71 / Low 11). Spot-checked against known cases before writing anything for real:
    Qualcomm/Amazon/Goldman → High/High; Honeywell/Perficient → Low score but High confidence
    (real sponsors, just smaller relative volume within this top-400 scope — "Low" here means
    "low relative to other major sponsors," not "barely sponsors anyone," and the rationale text
    says so); one employer found with 0% recent filings despite qualifying volume → Low/Low
    correctly. Verified post-write against the live DB, not just the run's own report: exactly 368
    rows, 0 rows leaked onto `excluded_from_scoring=true` employers, 0 nulls.
  - **Score from `lca_filings` only: volume + recency. No USCIS input**, because there is no join
    (D38–39 deferred). This is a **filing-intent** signal, not an approval-outcome signal.
  - **`confidence` must say so explicitly.** It reflects *filing activity only, not approval
    outcomes* — that sentence, or its meaning, has to reach the user. The v1 score answers "does
    this employer file a lot of LCAs, recently?" It does **not** answer "do their petitions get
    approved?" Do not let `confidence` imply otherwise.
  - **`excluded_from_scoring = true` ⇒ show NO score.** Not a degraded score, not a low-confidence
    score, not a guess — **nothing**. Fall back to the existing `inferSponsorshipLikelihood`
    heuristic badge, which already works and does not depend on this feature. A wrong score on
    "SUNY Stony Brook" (actually New York State + 21 campuses) is worse than no score.
  - Keeps: `inferSponsorshipLikelihood` as the fallback everywhere there's no real score; plain-text
    `rationale`. **`employer_sponsorship_scores.data_coverage`** should record that v1 = LCA-only,
    so v2 can tell v1 rows apart without guessing.
- **D46–50 — Sponsorship UI. [CHANGED] ✅ DONE 2026-07-18.** *Reduce.* Extended
  `JobSponsorshipBadge.vue` + `sponsorship_likelihood` surface rather than rebuilding:
  **Premium-only** swap of the badge's data source (real score when available and not excluded,
  else the existing heuristic — Free/Core stay on the heuristic unconditionally, unchanged from
  today), a Premium-only rationale tooltip (confidence is stated in the rationale text, no
  separate prop), filters (`requires_us_sponsorship` already exists, untouched). No numeric score,
  no second badge, no visual marker on the `excluded_from_scoring` fallback path — see decision 11
  for why. Grew to include domain-based job↔employer matching (not scoped originally — see §5a
  D46–50 for the full discovery + build writeup). Browser-verified; production coverage is 0%
  until the `employers.domain` backfill runs (blocked on a real Brave key, not on code).
- **D51–55 — Sponsor Watch.** **[CHANGED]** *Reframe.* Quarterly diff-alert worker on
  `scheduled_jobs` + pg_cron; alerts via `sendEmail`. Not real-time. **Built 2026-07-20** — see §5a.
- **D56–60 — Validation + launch, Score v1.** *Stick.* Validate on the 300–500 set; spot-check
  against known sponsors; launch scoped, expand the employer universe after. **Validation done
  2026-07-20** — see §5a. Launch itself still pending (production coverage is still 0% - see
  D46–50's open item on the `employers.domain` backfill - and Sponsor Watch isn't deployed yet -
  see D51–55).

---

## 5a. Status — D31–35, D36, D37, D41–45 all DONE; §3 decision 11 DECIDED 2026-07-17; D46–50 next

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
5. ~~STILL OPEN. Resolve §6 decision 1 (= §3 decision 11) before any UI work~~ **✅ RESOLVED
   2026-07-17** — see §3 decision 11. D46–50 is unblocked. All five original next-actions are
   now done.

### D36 — seed employers + aliases (DONE 2026-07-17)

Brand-level migration applied, then seeded from the FEINs in `lca_filings`. FEIN was exactly as
deterministic as §3 decision 2 predicted — no fuzzy matching involved.

| | |
|---|---|
| `employers` | **400** (one per distinct FEIN; **not yet brand-grouped** — Goldman is 3 rows, Regeneron 2) |
| `employer_name_aliases` | **642** (every distinct raw spelling; none discarded) |
| `lca_filings` backfilled | **102,821 / 102,821 = 100%**, 0 orphans |
| scope FEINs with no filings | **0** — the scope CSV's 400 FEINs match the seeded 400 exactly |
| `uscis_h1b_hub` | untouched (D38–39) |

Verified beyond the run's own report: counts re-queried from the DB, and the code-enforced
invariant *"all aliases for one FEIN share one `employer_id`"* confirmed holding across all 400.

Run it with `job-processor sponsorship seed-employers [--dry-run]`. Re-runnable (already-seeded
FEINs are skipped) and it rolls back its own `employers` rows if the alias insert fails.

### D37 — grouping (DONE 2026-07-17, reduced scope)

16 brands merged (42 FEINs → 16 rows: Qualcomm, Amazon, Goldman Sachs, CGI, Oracle, Deloitte, STV,
Samsung, Morgan Stanley, Regeneron, HCL, Mastech Digital, Capital One, Visa, CVS Health, Deutsche
Bank), 61 other candidates reviewed and rejected. 6 employers flagged `excluded_from_scoring=true`
(SUNY Stony Brook, UMass Chan, NYC DOE, UW System, UMD College Park, U Oklahoma) — fewer than the
52 originally estimated once the review CSVs were actually built and generic-token false positives
were filtered out. `employers` went 400 → 374. Decision CSVs committed as an audit trail:
`data/review_merge_candidates.csv`, `data/review_umbrella_feins.csv`. Run via
`job-processor sponsorship apply-d37-decisions`.

### D41–45 — scoring (DONE 2026-07-17, LCA-only)

368/374 employers scored Low/Medium/High (score + confidence), thresholds measured against the
real distribution rather than guessed — see §5 D41–45 for the full writeup (exact cutoffs, why
`fiscal_year` couldn't carry the recency signal and `received_date` did instead, spot-check
results). Run via `job-processor sponsorship compute-scores`.

**§3 decision 11 is DECIDED (2026-07-17): Real Score replaces the badge's value, tier-gated
tooltip reveals detail.**

### D46–50 — badge wiring (DONE 2026-07-18)

**Scope grew mid-implementation** — the original D46–50 estimate ("swap the badge's data source")
assumed a job posting could already be linked to `employers`. It couldn't (§3 decision 11's "what
D46–50 means, concretely" item 3a has the full discovery writeup). What actually shipped:

1. **Domain-based job↔employer matching**, not name matching. `job_hopper_live.company_domain`
   (new column, `20260717170000`) + `employers.domain` join on exact equality.
   `job_processor/pipeline.py::process_one_job` already resolved a domain per job via
   `resolve_company_domain` (Brave + LLM) but discarded it before the insert — one-line fix.
   `job_processor/sponsorship_domain_backfill.py` (CLI: `job-processor sponsorship
   backfill-employer-domains`) resolves `employers.domain` for the 368 scored employers the same
   way, so both sides of the join go through identical resolution logic.
2. **RLS.** `employers` and `employer_sponsorship_scores` had RLS enabled with zero policies since
   `20260716200000` — completely unreadable by the frontend (service role bypasses RLS, which is
   why D36/D37/D41–45's writes never surfaced this). Added `for select to authenticated using
   (true)` policies (`20260717180000`), same precedent as `sponsorship_likelihood` — tier-gating
   is a UI concern, not an RLS concern, and neither table holds sensitive data.
3. **`src/lib/jobs.ts`**: batches distinct `company_domain` values per page of matches, one query
   (`employers` embedding `employer_sponsorship_scores` via the FK) resolves all of them, mapped
   onto `MatchedJob.sponsorshipRealScore/RealConfidence/RealRationale` — `null` for everyone
   including Premium when there's no match, `excluded_from_scoring`, or no score row yet.
4. **Premium-only gating lives in the Vue layer, not `jobs.ts`.** `jobsAPI` returns the real-score
   fields for every tier alike (matches the existing pattern: `sponsorshipLikelihood` isn't tier-
   filtered by the API either). `JobCard.vue`/`JobDetail.vue` each get an `isPremium` computed
   (`baseTier === 'premium'`) that decides whether to *use* `sponsorshipRealScore` over
   `sponsorshipLikelihood`, and whether to pass `rationale` into the badge at all.
5. **`JobSponsorshipBadge.vue`** gained one prop, `rationale?: string | null` — its presence (not
   a separate boolean) is what shows an `InfoHint` (reused, not rebuilt) inside the badge. No
   `confidence` prop: the stored `rationale` string already states confidence in plain language
   ("...(High confidence)"), so a second prop would just be a second way to say the same thing.

**⚠️ Bug caught only by an actual authenticated browser request, not by `npm run build`:**
`20260717180000`'s RLS policies were live and correct, but nobody could read either table anyway —
Postgres requires the base `GRANT SELECT` *before* a policy is even evaluated, and that migration
never granted it. Compare `dashboard_banner` (`20260422140000`), which does both together and was
the tell. The symptom looked exactly like the designed fallback path (badge rendered, showed the
heuristic value) — nothing about it looked like an error unless you were watching network
requests. Fixed in `20260718120000`, pushed to remote. See the spot-check table above — this is
the same "silent failure, plausible symptom, only caught by testing known cases" pattern as every
entity-resolution bug this session, just in a different layer (infra permissions, not matching
logic).

**Browser-verified end-to-end** against an isolated local Supabase stack (Docker), not the
production project — a temporary Premium test user + Core test user + one seeded employer/score/
job posting, both `JobCard.vue` (dashboard) and `JobDetail.vue`. Confirmed: Premium sees the real
score value with a working tooltip showing the exact stored `rationale`; Core sees the heuristic
value with no tooltip at all (not a degraded tooltip — literally absent, matching decision 11);
zero console/network errors in either case. Local stack torn down after — no test data touches
production, which currently has 0 rows in `employer_sponsorship_scores` matched to any live
posting (the domain backfill hasn't run yet, see below).

**Still open:**
- **`employers.domain` backfill has not been run against production.** The CLI command exists and
  was dry-run verified (`attempted: 368, resolved: 0` — correctly resolves nothing without a real
  key), but this session's `BRAVE_SEARCH_API_KEY` is an unfilled placeholder. Until it runs, no
  production job posting can match a scored employer by domain, and everyone — Premium included —
  sees the heuristic badge. This is the designed fallback path working correctly, not a bug; it
  just means the feature has shipped with 0% real coverage until the backfill runs.
- Existing job postings (16,415 rows / 8,366 distinct company names) were deliberately **not**
  backfilled with `company_domain` — real Brave+LLM cost across thousands of lookups for postings
  that may already be stale. Coverage grows organically as the scraper pipeline re-ingests with
  the `pipeline.py` fix in place.
- D51–55 (Sponsor Watch) built (see below); not yet pushed/deployed to production.

### D51–55 — Sponsor Watch (BUILT 2026-07-20, not deployed to production yet)

**Threshold decision (Nick/Syed, 2026-07-20).** Sponsor Watch alerts fire when, at a quarterly
check, an employer's summed `total_worker_positions` (Certified/Certified-Withdrawn `lca_filings`
only, same rule as D41–45's `score`) either (a) crosses a score bucket (Low/Medium/High, reusing
the exact tertile boundaries already measured for D41–45 — 99/192) or (b) moves by **>=25%**
relative to the value recorded at the previous check.

**Why relative, not absolute, and why 25% is an estimate, not a measurement.** Queried the real
`lca_filings` data before proposing anything (367 currently-scored employers, umbrella-FEIN
exclusions already removed): summed positions range from **62 to 73,690**, median **137**, p75
**285**, p90 **1,241** — a ~1,189x spread, heavily right-skewed (mean 1,031 is 7.5x the median).
That skew rules out any flat absolute-position cutoff (meaningless noise for a 73,690-position
employer, would never fire for a 62-position one) — it has to be a percentage. But there is **no
historical quarter-over-quarter data yet** to measure real volatility against (only one FY has
ever been ingested), so 25% is a starting estimate grounded in the cross-sectional skew, not a
measured quantity the way the 99/192 tertile cutoffs are. **Revisit once the first real
quarter-over-quarter delta lands** (i.e. after someone re-ingests a second DOL quarterly file and
a watch check actually runs against it) — same "measure, don't guess" principle as the rest of
this doc, just not yet possible here for lack of a second data point.

**Why bucket-crossing alone isn't enough.** The `score_bucket` High band is open-ended (193+) and
in the real data spans 193 to 73,690 — a huge employer could lose thousands of positions and stay
"High" with bucket-crossing as the only signal, which is exactly the flagship "watch a big
well-known employer" case Sponsor Watch is for. Hence the OR: either signal alone is enough to
alert.

**Spot-checked against known cases before trusting it** (same working principle as every other
automated pass in this doc): top 10 employers by summed counted positions are Qualcomm (73,690),
Amazon (47,702), Goldman Sachs (42,850), Grandison Management, Cisco, Apple, CGI, NVIDIA, Infosys,
Meta — all recognizable major H-1B filers, not an artifact of a matching bug. 52 employers sit
within +/-10 positions of the 99 tertile boundary, confirming bucket-crossing is a real, densely
populated signal rather than a boundary nobody is ever near.

**What shipped:**
1. **Schema** (`20260720130000`, `20260720140000`): `sponsor_watch_alert` added to the
   `email_event_type` enum (its own migration file - `ALTER TYPE ... ADD VALUE` can't share a
   transaction with anything that reads the new value); `watch_last_checked_positions` /
   `watch_last_checked_score` / `watch_last_checked_at` added to `employer_sponsorship_scores`
   (chosen over a new table since watching is only ever offered for employers that already have a
   scores row, and the Python `compute-scores` upsert never includes these columns in its payload,
   so PostgREST's merge-duplicates upsert leaves them untouched on every rescore); a
   `sum_counted_lca_positions(uuid[])` SQL function + explicit `grant execute ... to service_role`
   (PostgREST can't express a `GROUP BY` over its REST interface — deliberately not repeating the
   D46-50 "policy without a GRANT" incident on the RPC path).
2. **`sponsor-watch-check` edge function**: self-enqueues its next run first (same resilience
   pattern as `reconcile-subscriptions` - recurrence survives a mid-run throw), checks only
   actively-watched employers (not the full 367-employer sweep the Python scorer does), skips
   profiles that have since downgraded off Premium (subscription row is left alone - re-upgrading
   just resumes watching) or globally unsubscribed
   (`notification_settings.email_unsubscribed_at`), writes a `sponsor_watch_events` row and emails
   every eligible subscriber on a meaningful change, and always advances the baseline to the
   current value after each check (matches "last-checked value" literally - not a cumulative
   drift tracker). First check for a newly-watched employer only establishes the baseline, no
   alert (nothing to compare to yet).
3. **Email** (`renderSponsorWatchAlert` in `_shared/email-templates.ts`): explicitly states this
   is quarterly DOL filing-VOLUME data, checked periodically, not real-time and not an H-1B
   approval-outcome signal — same disclaimer register as D41–45's `rationale` text.
4. **Frontend**: `employers.id` now flows through `src/lib/jobs.ts`'s `fetchRealScoresByDomain`
   onto `MatchedJob.sponsorshipEmployerId`, alongside a new `sponsorshipWatched` boolean sourced
   from one `sponsor_watch_subscriptions` query per page load (`fetchWatchedEmployerIds`) - same
   shape as the existing `savedMatchIds` pattern, not a query per card. `jobsAPI.watchEmployer` /
   `unwatchEmployer` mirror `saveJob`/`unsaveJob`. New `SponsorWatchToggle.vue` (self-contained,
   calls `jobsAPI` directly rather than emitting up - a per-employer toggle doesn't need the whole
   match list re-sorted the way saving does) wired into both `JobCard.vue` and `JobDetail.vue`,
   gated on the exact same condition as the real-score badge (`isPremium && job.sponsorshipRealScore
   && job.sponsorshipEmployerId`) - watching is only ever offered where there's a real score to
   watch.

**Deliberately NOT done yet, pending explicit go-ahead:**
- Migrations not pushed to the production DB (`supabase db push`).
- `sponsor-watch-check` not deployed (`supabase functions deploy sponsor-watch-check`).
- No `scheduled_jobs` seed row - the recurring quarterly cron has not been started. (The seed
  migration itself is intentionally not written yet either, so pushing migrations doesn't
  silently start the cron as a side effect - it needs its own deliberate step.)
- Not browser/integration-tested against a live stack the way D46–50 was (no isolated Docker
  Supabase run this time) - only the position-summing computation itself was verified, by running
  the identical Certified/Certified-Withdrawn summation logic client-side against real production
  `lca_filings` and confirming it lands on known-correct results (the spot-check above). The RPC
  function, the edge function's control flow (tier/unsubscribe gating, baseline bootstrap, email
  send), and the frontend toggle are all unexercised against a real request/response cycle.

### D56–60 — Validation (DONE 2026-07-20); launch still pending

Pulled the live `employer_sponsorship_scores` + `employers` data (368 scored, 6
`excluded_from_scoring`) and ran the spot-check working principle (§ top of doc) against it -
known-answer cases first, then looked for what a plausible-looking pass might have gotten wrong.

**Score distribution:**

| Score | Count | Share |
|---|---|---|
| High | 123 | 33.4% |
| Medium | 123 | 33.4% |
| Low | 122 | 33.2% |

Near-perfect tertiles, as expected - the 99/192 boundaries were derived from this exact
distribution, so this is a consistency check, not new information.

**Confidence distribution:**

| Confidence | Count | Share |
|---|---|---|
| High | 286 | 77.7% |
| Medium | 71 | 19.3% |
| Low | 11 | 3.0% |

Matches D41–45's predicted shape closely (~78% High, ~3% Low). Independently re-derived
`recency_share` from each row's stored `data_coverage` and re-bucketed against the documented
0.5/0.8 cutoffs - **zero mismatches** across all 368. Also independently re-summed
`total_worker_positions` straight from live `lca_filings` (bypassing the stored `score` bucket
entirely) and re-bucketed - **zero mismatches** there either. The stored scores are in sync with
current `lca_filings`, not stale.

**Known-heavy spot-check: correct.** Amazon, Goldman Sachs, Qualcomm, Cisco Systems, NVIDIA,
Apple, Meta, Google, Microsoft, JPMorgan Chase, Deloitte, Accenture, Infosys, Tata Consultancy
Services, Capital One, Morgan Stanley, Oracle, Intel, IBM, Cognizant, HCL, Wipro, Salesforce - all
High, all High/Medium confidence. Walmart has no matching `employers` row - not a bug, genuinely
outside the top-400-by-LCA-volume scope (IT-services/staffing firms dominate top LCA filers by a
wide margin; a retailer's H-1B volume is real but smaller by comparison). Bottom-of-distribution
spot-check (Tiger Analytics, Experis, Maplebear/Instacart, HubSpot, Auburn University, Perficient,
NetApp, ESRI, Pure Storage) - all correctly Low.

**⚠️ Self-correction caught mid-validation, worth naming explicitly:** the first spot-check pass
flagged "University of California, San Francisco" (Medium, 173 positions) and "Intellectt Inc"
(Medium, 119 positions) as suspicious non-matches against "Cisco"/"Intel." Both were false
positives from naive substring matching in the *validation script itself* - `"san franCISCO"` and
`"INTELlectt"` both contain the search string without being the company being searched for. Not a
real anomaly in the scoring system; both scores are correct and unsurprising for what these
employers actually are (a university medical center, a small IT staffing firm). Kept here on
purpose: the whole point of this working principle is not trusting a plausible-looking automated
pass at face value, including the validation pass's own tooling.

**Flagged for review:**

1. **Tavaro - High score driven by a single filing. FIXED and APPLIED 2026-07-20.** 3 total
   filings: one Certified for 400 "Truck Driver" positions (2026-02-01), two Denied - 350
   "Personal Care and Service Workers, All Other" and 400 "Non-medical care, cleaning, facility
   support, general labor," both also filed 2026-02-01. Three round-numbered, atypical-for-H-1B
   blue-collar job titles from one filer, one of which happened to certify. The algorithm did
   exactly what D41–45 specifies (sum certified positions, bucket by tertile) - this was not a
   code bug. It was a case where a single filing's face-value volume doesn't match the "broad,
   sustained hiring pattern" the High badge implies to a job seeker.
   - **Fix:** a minimum certified-filing-count floor (`MIN_CERTIFIED_FILINGS_FOR_HIGH = 3`) before
     an employer can reach High, added to `score_bucket()` in
     `job_processor/sponsorship_scoring.py`. An employer that would be High by position volume
     alone but fails the floor is capped at Medium, not Low - the position volume is still real
     signal, just not enough independent filings to back a High-confidence "broad hiring pattern"
     claim.
   - **Real impact, measured before committing** (same practice as the original tertile cutoffs -
     grounded in real numbers, not picked in the abstract): of the 123 then-currently-High
     employers, a ≥3 floor drops out **exactly 1 - Tavaro, and only Tavaro.** Even a ≥2 floor
     already isolated it alone; a ≥5 floor would have caught one additional employer. Across *all*
     368 scored employers (every bucket, not just High), only **2 total** have fewer than 3
     certified filings - a genuinely rare edge case, not a broad recut. For context,
     `counted_filing_count` across all 368 scored employers: p10=62, median=111 - the vast
     majority of employers have abundant filing counts, so a floor of 3 sits nowhere near normal
     legitimate volume; it targets the single-filing outlier case specifically, not a broad swath
     of small-but-real sponsors.
   - **Verified before writing, not just before deciding:** dry-ran `compute-scores --dry-run`
     first (aggregate distribution shifted exactly as predicted: High 123→122, Medium 123→124, Low
     unchanged). Then, before running for real, did a precise per-employer diff (current live
     scores vs. the new in-memory computation, not just aggregate counts) and confirmed the diff
     was the single Tavaro row and nothing else. Ran `compute-scores` for real, then re-confirmed
     against the live table directly (not the CLI's own summary): `Tavaro: High -> Medium`,
     distribution `High 122 / Medium 124 / Low 122`, 368 rows total, no other employer changed.
     Added `test_score_bucket_high_requires_minimum_certified_filings` to
     `tests/test_sponsorship_scoring.py` (7/7 tests pass) covering the Tavaro shape (400 positions,
     1 filing → Medium, not High) and the boundary (3 filings → High).
   - **Confirmed the right fix, not over-correction** - narrow, measured impact, exactly the
     pattern this validation pass was designed to catch.
   - **Rationale text updated to explain the cap, not just state raw numbers.** A user seeing "400
     sponsored positions" next to a Medium badge with no explanation would reasonably read that as
     inconsistent. `build_rationale()` gained a `capped_by_filing_floor` flag
     (`capped_by_filing_floor()` helper, same module) that inserts an explicit sentence when it
     applies. Live Tavaro rationale after re-running `compute-scores`: *"1 certified LCA filings in
     FY2026, covering 400 sponsored positions. (2 additional filings were withdrawn or denied and
     are not counted toward the score.) Reflects DOL filing activity only, not H-1B petition
     approval outcomes. Medium (based on limited filing history — fewer than 3 certified filings)
     despite the position volume above. 100% of filings are from the last 150 days (High
     confidence)."* Regression-checked against Amazon/Goldman Sachs/Qualcomm (real, uncapped High
     employers) directly against production - none picked up the new sentence. Two new tests
     (`test_capped_by_filing_floor`, `test_rationale_explains_the_cap_when_capped_by_filing_floor`,
     `test_rationale_omits_cap_note_when_not_capped` - 10/10 total pass).
2. **COIN & LIFE SAVING EXCHANGE - correct behavior, closed, no action.** 0 certified positions
   (both filings Denied), correctly Low with High confidence. "High confidence" paired with "0
   positions" reads unusual at a glance, but the rationale text is coherent on inspection -
   confidence answers "how current is this data," not "how much do they sponsor," and the
   generated rationale text already makes that distinction in plain language. Confirmed correct,
   closed out.

**No instances found of:** High score + Low confidence (a "used to file a lot, has gone quiet"
signal) - none of the 368 currently show this combination. Nothing to spot-check on that axis yet
with only one FY of data; revisit once a second quarter is ingested.

**Launch itself is still pending**, independent of this validation - blocked on the same two open
items already logged above: the `employers.domain` backfill (D46–50, 0% production coverage until
it runs) and Sponsor Watch not yet deployed (D51–55).

Systematic merge/split detection, the durable override store, the domain/Apollo grouping pass, and
the LCA↔USCIS join all still defer to v2 with D38–40. Their design (§3 decision 6, §5 D38–39) is
kept verbatim — start there, don't re-derive.

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

1. ~~**Score presentation (§3 decision 11):** replace the heuristic badge, or show a separate
   Premium Real Score alongside it?~~ **✅ RESOLVED 2026-07-17 — replaces the badge's value; no
   second badge.** Free/Core see today's badge unchanged; Premium sees the same badge sourced from
   the real score with a tooltip revealing rationale/confidence; `excluded_from_scoring` employers
   fall back to the heuristic silently. See §3 decision 11.
2. ~~**Score shape:** 0–100 numeric vs. A–F grade vs. High/Med/Low + confidence.~~ **✅ RESOLVED
   2026-07-17 — Low/Medium/High + confidence**, same scale as the existing heuristic badge. See
   §5 D41–45.
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
