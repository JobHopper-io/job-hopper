-- =============================================================================
-- Clean public.scraper_raw_jobs (status = 'pending') — parity with n8n "CLEAN DB"
--
-- 1) Dedupe: same composite key as the Code node (job_title, company_name,
--    apply_link). Null/empty parts use '' like the JS; non-null values use
--    JSON.stringify semantics via to_jsonb(...)::text. Keeps ONE row per group:
--    earliest date_scraped, then smallest id (n8n "first" row depended on API order).
--
-- 2) Remove pending rows that appear on exclusion_lists (company_name match)
--    OR match job_hopper_live on company_name + job_title AND either:
--      - (raw posted_date or "today") minus (live posted_date or live created_at)
--        is strictly less than 30 days — same signed day difference as SQL Server
--        DATEDIFF(day, live_ref, raw_ref) < 30
--      - apply_link equal (standard SQL: both NULL does NOT match)
--
-- Run in Supabase SQL Editor as postgres / service role (bypasses RLS).
-- Prefer: run the PREVIEW section first, then the TRANSACTION block.
--
-- Remote runs (n8n, curl, etc.): apply migration
--   supabase/migrations/20260512120000_clean_scraper_raw_jobs_n8n_parity_rpc.sql
-- then POST (service_role key only):
--   {{SUPABASE_URL}}/rest/v1/rpc/clean_scraper_raw_jobs_n8n_parity
--   Body: {}  Headers: apikey + Authorization: Bearer <service_role>
-- Returns JSON counts: duplicates_removed, exclusion_or_live_removed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PREVIEW (read-only): rows that would be removed in step 1 (duplicate groups)
-- -----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(to_jsonb(job_title)::text, ''),
        COALESCE(to_jsonb(company_name)::text, ''),
        COALESCE(to_jsonb(apply_link)::text, '')
      ORDER BY date_scraped ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.scraper_raw_jobs
  WHERE status = 'pending'
)
SELECT r.*
FROM public.scraper_raw_jobs r
INNER JOIN ranked x ON x.id = r.id
WHERE x.rn > 1;

-- -----------------------------------------------------------------------------
-- PREVIEW: pending rows that step 2 would delete (exclusion OR already live)
-- (Run after you mentally account for step 1, or run on a copy; this reads
--  current DB state without applying step 1.)
-- -----------------------------------------------------------------------------
SELECT r.*
FROM public.scraper_raw_jobs r
WHERE r.status = 'pending'
  AND (
    EXISTS (
      SELECT 1
      FROM public.exclusion_lists e
      WHERE r.company_name = e.company_name
    )
    OR EXISTS (
      SELECT 1
      FROM public.job_hopper_live j
      WHERE j.company_name = r.company_name
        AND j.job_title = r.job_title
        AND (
          (
            COALESCE(r.posted_date, CURRENT_TIMESTAMP)::date
            - COALESCE(j.posted_date, j.created_at)::date
          ) < 30
          OR r.apply_link = j.apply_link
        )
    )
  );

-- -----------------------------------------------------------------------------
-- APPLY (single transaction)
-- -----------------------------------------------------------------------------
BEGIN;

-- Step 1: delete duplicate pending rows (keep one per key)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(to_jsonb(job_title)::text, ''),
        COALESCE(to_jsonb(company_name)::text, ''),
        COALESCE(to_jsonb(apply_link)::text, '')
      ORDER BY date_scraped ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.scraper_raw_jobs
  WHERE status = 'pending'
)
DELETE FROM public.scraper_raw_jobs r
USING ranked x
WHERE r.id = x.id
  AND x.rn > 1;

-- Step 2: delete excluded companies + pending rows already represented live
DELETE FROM public.scraper_raw_jobs r
WHERE r.status = 'pending'
  AND (
    EXISTS (
      SELECT 1
      FROM public.exclusion_lists e
      WHERE r.company_name = e.company_name
    )
    OR EXISTS (
      SELECT 1
      FROM public.job_hopper_live j
      WHERE j.company_name = r.company_name
        AND j.job_title = r.job_title
        AND (
          (
            COALESCE(r.posted_date, CURRENT_TIMESTAMP)::date
            - COALESCE(j.posted_date, j.created_at)::date
          ) < 30
          OR r.apply_link = j.apply_link
        )
    )
  );

COMMIT;
