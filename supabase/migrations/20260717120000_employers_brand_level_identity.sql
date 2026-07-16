-- §3 decision 5 (decided 2026-07-17, Nick/Syed): `employers` is a BRAND-level identity.
-- See docs/sponsorship-data-engine.md.
--
-- A job seeker who sees "Goldman Sachs" or "Regeneron" on a posting gets ONE combined score,
-- not per-legal-entity scores. But a brand and a legal filer are not 1:1 in either direction,
-- which the schema from 20260716200000 could not represent:
--
--   one brand -> many FEINs:  GOLDMAN SACHS & CO. LLC      13-5108880
--                             GOLDMAN SACHS BANK USA       13-3571598
--                             GOLDMAN SACHS SERVICES LLC   13-3937419
--   one name  -> many FEINs:  Regeneron Pharmaceuticals, Inc.  46-4073600 and 13-3444607
--                             (byte-identical name, two legally separate filers)
--
-- 20260716200000 put `employer_fein` on `employers` with a UNIQUE index, which asserts
-- "one FEIN => one employers row" - i.e. the entity-level model itself. A brand-level Goldman
-- row can hold only one of its three FEINs, and there was nowhere to record the other two:
-- `employer_name_aliases` had names but no FEIN column.
--
-- Fix: FEIN identifies a FILER, so filer identity moves DOWN to the alias layer. Resolution
-- becomes two hops: filing -> FEIN -> alias -> employer_id (brand).
--
-- Raw filing tables are deliberately untouched: `lca_filings` / `uscis_h1b_hub` keep their true
-- per-filer identity (`employer_name_raw`, `employer_fein`) for audit accuracy. Brand-level is
-- only the `employers` rollup, reached via `employer_id`. That is what keeps this decision
-- reversible - entity-level detail can be exposed later without re-ingesting anything.
--
-- Safe as a plain drop/add: `employers` and `employer_name_aliases` are both 0 rows (no
-- resolution pass has run). Doing this now rather than at D36 avoids a real data migration.

-- Filer identity moves to the alias layer.
alter table public.employer_name_aliases
  add column employer_fein text,
  add column tax_id_last4 text;

-- One FEIN = one filer = belongs to exactly one brand. This is the deterministic key D36-40
-- resolves on. (No unique on tax_id_last4: only 4 digits, collisions are expected by design -
-- it is a narrowing hint for the USCIS side, which has no full FEIN.)
create unique index employer_name_aliases_employer_fein_key
  on public.employer_name_aliases (employer_fein)
  where employer_fein is not null;

create index employer_name_aliases_tax_id_last4_idx
  on public.employer_name_aliases (tax_id_last4)
  where tax_id_last4 is not null;

-- `employers` is now a brand: it has no single FEIN or tax ID. Dropping rather than keeping a
-- "representative" value on purpose - a representative FEIN would reintroduce exactly the
-- entity/brand ambiguity this decision resolves. (Dropping the columns drops
-- employers_employer_fein_key with them.)
alter table public.employers
  drop column employer_fein,
  drop column tax_id_last4;
