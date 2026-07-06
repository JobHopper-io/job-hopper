# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System shape

Three separately-deployed parts:

1. **Frontend** — Vue 3 + Vite SPA in `src/`, built to `dist/` and deployed to **Netlify** (`netlify.toml`). Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only.
2. **Supabase** — Postgres + **25 Deno edge functions** in `supabase/functions/`. This is where the real backend/business logic lives. Secrets are set in the Supabase dashboard, not in the repo.
3. **job-processor-service** — a standalone **FastAPI** app in `job-processor-service/` (a port of former n8n job-processor workflows). It has no deploy config in the repo; the frontend/edge functions reach it via the `JOB_PROCESSOR_URL` Supabase secret, so **the host is not discoverable from the code**.

## Commands

### Frontend (repo root)
- `npm run dev` — Vite dev server
- `npm run build` — type-check (`vue-tsc`) **and** build; both must pass
- `npm run type-check` / `npm run lint` (lint auto-fixes)
- `npm run db:types` — regenerate `src/types/supabase.ts` from the remote schema (`db:types:local` for a local Supabase). Commit the result.
- There is **no frontend unit-test runner** (no `test` script).

### Edge function tests (Deno)
Shared matching/algorithm logic in `supabase/functions/_shared/` is unit-tested:
- All: `deno test supabase/functions/_shared/__tests__/`
- Single file: `deno test supabase/functions/_shared/__tests__/phrase-matching.test.ts`

### Supabase
- `supabase functions serve` / `supabase functions deploy <name>` / `supabase db push`

### Job processor (`job-processor-service/`)
- Setup: `python -m venv .venv && source .venv/bin/activate && pip install -e . && cp .env.example .env`
- Run API: `job-processor-api` (uvicorn on :8000, OpenAPI at `/docs`)
- CLI (`job-processor`): `enqueue`, `sync`, `status <run_id>` — all take `--base-url`/`--api-key`

## Architecture rules that span multiple files

Read `docs/architecture.md` before any change to data-access patterns, module boundaries, or service responsibilities. Key invariants:

- **Data-access layering (strict):** Views, stores, and composables **never import the `supabase` client directly**. They call API helpers in `src/lib/` — only `src/lib/` code touches `supabase` (`src/lib/supabase.ts`).
- **DB types:** `src/types/supabase.ts` is generated — **never hand-edit**. Write app code against the convenience aliases in `src/types/database.ts`. `docs/db-schema-summary.md` is the business/domain source of truth; consult it (not the migrations) for conceptual context. Use migrations only for historical questions.
- **User-editable column subsets:** to restrict which columns an API/form can update (e.g. never let callers change `role`/`organization_id`), define a narrowed `Pick<...>` type in `src/types/database.ts` and use that for the public API.
- **Async / fire-and-forget fulfillment:** several edge functions return `200` immediately and do the slow work in the background via `EdgeRuntime.waitUntil`. Resume advice/upgrade are fulfilled this way through **n8n webhooks** (`N8N_RESUME_ADVICE_WEBHOOK_URL` / `N8N_RESUME_UPGRADE_WEBHOOK_URL` in `_shared/n8n-resume-fulfillment.ts`) — the LLM is called by n8n, not by the edge function. The frontend polls the relevant table for a terminal status.
- **Scheduling:** table-driven `scheduled_jobs` + pg_cron invokes the `run-scheduled-jobs` edge function every ~15 min, which POSTs to target edge functions. Use it **only** for system/cron functions that accept service-role calls (no user JWT). The cron must be created manually.
- **Admin roles:** two DB-backed roles (`admin`, `super_admin`) via `roles`/`profile_roles`, with `super_admin ⇒ admin` enforced server-side. Access is checked in **both** the Vue router guard and the edge functions (RPC `current_user_has_role`); users cannot modify their own permissions. `super_admin` gates only admin-management. See `docs/architecture.md`.
- **Matching algorithm:** the phrase/location/pay/filter scoring lives in `supabase/functions/_shared/` (e.g. `phrase-matching.ts`, `filter-matching.ts`, `location-normalization.ts`, `job-matching-algorithm.ts`) and is admin-tunable via `matching_algorithm_config` (defaults merged with DB overrides). See `docs/job-matching-rules.md`.
- **Apollo credit budgeting:** per-process credit caps and Premium Insights accounting — see `docs/apollo-limits.md`.
- **Email:** transactional email goes through the provider-agnostic `sendEmail` in `supabase/functions/_shared/email.ts` → `email-provider.ts`, backed by Mailtrap. It degrades gracefully (returns `success: false`) when `MAILTRAP_API_TOKEN` is unset, so core flows still work locally. See README for the required secrets.
- **Job processor pipeline:** `POST /v1/runs` starts the pipeline as an in-process `asyncio` task (no Redis/worker) and returns immediately; poll `GET /v1/runs/{id}`. If the process restarts, in-flight work is lost — use `POST /v1/runs/sync` for short deterministic runs. LLM calls use an OpenAI-compatible client (`llm_ops.py`); `HTTP_TIMEOUT_SECONDS` applies to the general httpx clients (web/Apollo/Brave), **not** the LLM client.

## Conventions

- **Never disable ESLint** — not even a single line. Fix the underlying issue instead, and explicitly call out any existing `eslint-disable` you encounter.
- **Icons:** use the global `<font-awesome-icon>` only; register new icons in `src/plugins/fontawesome.ts`. No ad-hoc inline SVG or text-symbol icons. Loading spinner = shared `faSpinner` with the `spin` prop.
- **Supabase types pre-commit hook:** enable with `git config core.hooksPath .githooks`. It regenerates `src/types/supabase.ts` and fails the commit if the file changed but wasn't staged.
