# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Job-Hopper is a Vue 3 + Vite SPA with a Supabase backend (Postgres, Auth, Storage, Edge Functions). The frontend runs on port 5173 and connects to local Supabase services.

### Services

| Service | Command | Port | Notes |
|---|---|---|---|
| Vite dev server | `npm run dev` | 5173 | Vue 3 SPA with HMR |
| Supabase local stack | `npx supabase start` | 54431 (API), 54432 (DB), 54433 (Studio), 54434 (Mailpit) | Requires Docker; runs Postgres, Auth, Edge Functions, Storage, Realtime |

### Starting the dev environment

1. Ensure Docker daemon is running (`sudo dockerd` if needed; see Docker-in-Docker notes below).
2. `npx supabase start` — starts the full Supabase local stack. First run pulls images (~1-2 min).
3. Create `.env.local` at repo root with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `npx supabase status -o json` (`API_URL` and `ANON_KEY` fields).
4. `npm run dev` — starts Vite on port 5173.

### Lint / Type-check / Build

- **Lint**: `npx eslint .` (the repo has 18 pre-existing lint errors in views and edge functions; these are not regressions)
- **Type-check**: `npx vue-tsc --build`
- **Build**: `npm run build` (runs type-check + vite build in parallel)

### Docker-in-Docker (Cloud Agent VMs)

The Cloud Agent VM is itself a container inside Firecracker. To run Docker (required by `supabase start`):

- Docker CE must be installed with fuse-overlayfs storage driver and iptables-legacy.
- Daemon config at `/etc/docker/daemon.json`: `{"storage-driver": "fuse-overlayfs"}`.
- Start with `sudo dockerd &>/tmp/dockerd.log &` and `sudo chmod 666 /var/run/docker.sock`.

### Auth flow (local dev)

- Email confirmations are enabled. Registration sends a confirmation email captured by Mailpit at `http://127.0.0.1:54434`.
- After confirming, users land on `/onboarding` (4-step flow).
- Phone number validation rejects test-range numbers (555 prefix); use realistic area codes (e.g. 212).

### Edge functions

Supabase Edge Functions (Deno 2) live in `supabase/functions/`. They auto-serve when `supabase start` runs. Stripe-related functions require `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` secrets set via `supabase secrets set` for payment flows to work end-to-end.

### Pre-commit hook

The repo has a pre-commit hook at `.githooks/pre-commit-supabase-types` that regenerates `src/types/supabase.ts`. To enable: `git config core.hooksPath .githooks`. This requires a running local Supabase instance. Cloud agents should skip this hook setup unless specifically needed.
