# Apollo limits (`apollo_limits`)

This document describes how Job Hopper budgets **Apollo API credits** across independent backend processes.

## Purpose

- Each process that calls paid Apollo endpoints has a dedicated row in `public.apollo_limits`.
- **`usage`** counts credits consumed in the current **monthly period** (see [Reset schedule](#reset-schedule)).
- **`credit_limit`** is the maximum `usage` allowed for that process in the period. **`0` disables** that process (no paid Apollo calls should succeed the pre-check).
- **`name`** is a stable string key (e.g. `premium_insights`, `job_processor`). New consumers **must** add a row and document the key here.

Column `credit_limit` in the database maps to the product concept “limit” (the plan uses the word *limit*; SQL uses `credit_limit` to avoid the reserved word `limit`).

## Registry of process keys

| `name` | Description | Paid Apollo steps |
|--------|-------------|-------------------|
| `premium_insights` | User-triggered hiring-contact flow (`premium-insights` Edge Function) | 1 credit: `mixed_companies/search`; 1 credit: `people/match` (stepwise; see below) |
| `job_processor` | FastAPI raw-job pipeline (`job_processor` service) | 1 credit per `organizations/enrich` attempt |

## Consume / refund contract

All consumers **must**:

1. **Before** a paid Apollo call, invoke `try_consume_apollo_credits(name, amount)` via the Supabase service role.
   - The RPC locks the row (`SELECT … FOR UPDATE`) and increments `usage` only if `usage + amount <= credit_limit` and `credit_limit > 0`.
   - If it returns `ok = false`, the caller must **abort** without calling Apollo (and must not leak partial state).

2. **After** the Apollo call:
   - On **success**, leave `usage` as-is (already incremented).
   - On **failure** for that step (HTTP error, credit error, or business abort before the credit was “used”), call `refund_apollo_credits(name, amount)` for the **same** `amount` that was consumed for that step.

### Premium Insights (stepwise)

To avoid charging for a `people/match` when org resolution never succeeded:

1. `try_consume_apollo_credits('premium_insights', 1)` → org search → on failure, `refund_apollo_credits('premium_insights', 1)`.
2. `try_consume_apollo_credits('premium_insights', 1)` → `people/match` → on failure, `refund_apollo_credits('premium_insights', 1)`.

**Contact depth is tier-driven** (`resolveBaseTier`): **free → 1** contact, **core → up to 2**, **premium → up to 3** (seniority-ranked so the hiring manager/decision-maker surfaces first). The step-2 credit covers the **first** `people/match`; each **additional** contact consumes **one more** credit, refunded if that specific reveal returns no usable person or a credit error. So a single lookup costs up to `1 (org, cold only) + 1×N` credits, where `N` is the tier's contact count. If the budget runs out mid-loop, whatever contacts already resolved are returned as `complete`.

`mixed_companies/search` is called **by organization name only** (job posting location is not passed as Apollo’s HQ `organization_locations` filter, which would otherwise exclude valid subsidiaries and brands).

Before redeeming freemium or consuming credits, the function may short-circuit on **`company_apollo_search_miss`** (same `cache_key` as `company_apollo_cache`, TTL on the order of a week) when that company/region recently hit a definitive org/contact resolution failure, avoiding repeat spend.

When the **second-best** Apollo org score is still above **92%** of the best score (same ambiguity rule as org scoring), every org whose score is **above that 92% floor** is stored in **`job_hiring_contacts.org_disambiguation_options`** and the response is **`needs_org_choice`** so the user can pick an `apollo_organization_id` or decline; a follow-up request continues the pipeline without a second org-search credit.

`mixed_people/api_search` is **not** counted as a credit (Apollo documents it as non–credit-consuming for API search).

### Job processor

Before each `GET /organizations/enrich`, consume **1** credit. On credit/quota error or transport failure before a successful enrichment, refund **1**.

## Concurrency

`try_consume_apollo_credits` uses row-level locking so two concurrent requests cannot both pass a check when only one credit remains.

## Admin configuration

- Admins update **`credit_limit`** per row in **Admin → System Settings** (Apollo limits section).
- **`usage`** is **not** editable in the UI; it is advanced only by RPCs. Manual repair (if ever needed) is a service-role operation in the database.

## Reset schedule

- On the **10th of each month at 00:00 UTC**, pg_cron (when enabled and Vault secrets `project_url` + `cron_secret` are present) invokes the Edge Function **`reset-apollo-limits`**, which calls `reset_apollo_limits_usage()` and sets **`usage = 0`** for **all** rows.
- If cron is not configured in an environment, run the reset function manually or schedule it via your ops tooling.

## Frontend rule (Premium Insights)

Hide “Get hiring contacts” / similar CTAs when the `premium_insights` row would reject the **minimum** next operation (e.g. `usage + 2 > credit_limit` for a cold path that needs org search + match), or when `credit_limit = 0`.

## Adding a new Apollo consumer

1. Add a migration (or follow-up migration) inserting a new `apollo_limits` row with default `credit_limit`.
2. Call `try_consume_apollo_credits` / `refund_apollo_credits` around every **paid** Apollo call.
3. Document the row in the registry table above.
4. If the process runs outside Supabase, use the **service role** REST client or RPC with the service key.

## Debug logging (Premium Insights)

The `premium-insights` Edge Function and `_shared/apollo.ts` emit **structured JSON** lines via `console.log` (visible in Supabase **Edge Functions → Logs**).

| `fn` | When |
|------|------|
| `premium-insights` | Phases: `job_loaded`, `short_circuit_complete_row`, `company_cache_lookup`, `org_from_company_cache`, `org_resolved`, `people_step`, `complete`, `failure` (includes `code`). |
| `apollo:org-search` | After `mixed_companies/search` (by **company name only**; job location is not sent as Apollo HQ `organization_locations`, since that filter is headquarters-based and breaks many valid matches): query name, response JSON keys, raw vs filtered org counts, sample candidate ids/names. |
| `apollo:org-score` | After scoring: `outcome` (`no_candidates`, `below_threshold`, `ambiguous`, `picked`) and top rankings with per-component scores. |
| `apollo:people-search` | After `mixed_people/api_search`: org id, title sample, people count. |
| `apollo:people-match` | After `people/match`: person id, outcome (`has_person`, `credit_http`, etc.). |

Filter logs by `job_match_id` or grep for `fn":"premium-insights"` / `fn":"apollo:org-search"`.

## Related docs

- [`docs/db-schema-summary.md`](db-schema-summary.md) — entity relationships and RLS overview.
- [`docs/architecture.md`](architecture.md) — edge functions and scheduling conventions.
