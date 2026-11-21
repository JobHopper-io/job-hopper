-- Growth Day 2 (intent radar): fields for classifying and reviewing prospects found in
-- public "looking for work" posts, plus locking down the unused outreach_leads table.

-- ---------------------------------------------------------------------------
-- outreach_leads: exists only on the hosted DB (no migration, nothing in the repo writes or
-- reads it; origin unknown), so it is not dropped. Lock it to the service role and mark it
-- superseded. Guarded so this migration also runs where the table doesn't exist (local).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.outreach_leads') is not null then
    execute 'alter table public.outreach_leads enable row level security';
    execute 'revoke all on table public.outreach_leads from anon, authenticated';
    execute $c$comment on table public.outreach_leads is
      'Unused: not written or read by anything in the repo, origin unknown. Superseded by public.prospects + public.prospect_evidence (mapping in docs/growth/lead-system-design.md). Kept, not dropped, until its source is identified.'$c$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- prospect_evidence: what kind of signal a piece of evidence is
-- ---------------------------------------------------------------------------
alter table public.prospect_evidence
  add column signal_type text;

comment on column public.prospect_evidence.signal_type is
  'What the evidence shows, e.g. self_posted_seeking_work (the person posted that they want a job).';

-- ---------------------------------------------------------------------------
-- prospects: classification and human review
-- ---------------------------------------------------------------------------
alter table public.prospects
  add column segments text[],
  add column needs_sponsorship boolean,
  add column intent_score int check (intent_score is null or (intent_score >= 0 and intent_score <= 100)),
  add column intent_reason text,
  add column classified_at timestamptz,
  add column classifier_model text,
  add column review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null;

comment on column public.prospects.needs_sponsorship is
  'Classifier''s inference from the evidence. requires_us_sponsorship is the person''s own stated answer (mirrors profiles); the two can differ.';
comment on column public.prospects.review_status is
  'Human review of the classified prospect before any outreach: pending / approved / rejected.';

create index prospects_review_queue_idx on public.prospects (review_status, intent_score desc);
