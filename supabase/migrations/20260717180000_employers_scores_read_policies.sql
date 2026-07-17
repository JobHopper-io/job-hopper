-- D46-50 (§3 decision 11): employers and employer_sponsorship_scores were created with RLS
-- enabled and zero policies (20260716200000), so they were completely unreadable by the
-- frontend's anon/authenticated client - service role bypasses RLS, which is why this went
-- unnoticed through D36/D37/D41-45 (all service-role CLI writes).
--
-- Tier-gating for this feature is a UI-layer concern, not an RLS concern - same precedent as
-- job_hopper_live.sponsorship_likelihood, which is readable by any authenticated user and
-- gated entirely by baseTier checks in JobCard.vue/JobDetail.vue, not by RLS. Neither table
-- holds anything sensitive (both are derived from public DOL filing data), so a blanket
-- authenticated-read policy matches how other public reference tables in this schema are
-- exposed (dashboard_banner, roles, matching_algorithm_config).
--
-- employer_name_aliases, lca_filings, and uscis_h1b_hub deliberately do NOT get a policy here -
-- nothing in the frontend needs raw filing/alias rows, only the employers rollup + its score.

create policy "Authenticated can read employers"
on public.employers
for select
to authenticated
using (true);

create policy "Authenticated can read employer_sponsorship_scores"
on public.employer_sponsorship_scores
for select
to authenticated
using (true);
