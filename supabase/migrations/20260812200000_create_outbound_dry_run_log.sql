create table if not exists outbound_dry_run_log (
  id uuid primary key default gen_random_uuid(),
  lead_organization_name text not null,
  category text not null,
  rendered_subject text,
  rendered_body text,
  suppressed boolean not null default false,
  run_at timestamptz not null default now()
);
