"""Entity resolution for the sponsorship data engine (D36-40).

D36 (this module, so far): seed `employers` + `employer_name_aliases` from the FEINs already
present in `lca_filings`, and backfill `lca_filings.employer_id`. FEIN is a direct key here -
no fuzzy matching (docs/sponsorship-data-engine.md §3 decision 2).

Model (§3 decision 5): `employers` is BRAND-level; filer identity (FEIN) lives on
`employer_name_aliases`. Raw filing rows are never rewritten - only `employer_id` is filled in.

Deliberately NOT here:
- Brand grouping (D37) - merging Goldman's 3 FEINs into one brand. Until that runs, one FEIN
  seeds one `employers` row, so Goldman is 3 rows and Regeneron is 2.
- The LCA<->USCIS join (D38-39) - `uscis_h1b_hub` is untouched.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, TypedDict
from uuid import uuid4

from job_processor.sponsorship_scope import normalize_employer_name
from job_processor.supabase_client import SupabaseRest


class SeedCounts(TypedDict, total=False):
    lca_rows_scanned: int
    distinct_feins: int
    feins_already_seeded: int
    employers_to_create: int
    aliases_to_create: int
    lca_rows_backfilled: int
    feins_with_multiple_spellings: int
    feins_with_divergent_names: int


class SeedPlan(TypedDict):
    employers: list[dict[str, Any]]
    aliases: list[dict[str, Any]]
    fein_to_employer_id: dict[str, str]
    counts: SeedCounts
    divergent: list[tuple[str, str, list[str]]]


async def _scan_lca_feins(db: SupabaseRest) -> tuple[dict[str, dict[str, int]], dict[str, int], int]:
    """Returns ({fein: {raw_name: count}}, {fein: fiscal_year}, rows_scanned)."""
    fein_names: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    fein_fy: dict[str, int] = {}
    scanned = 0
    offset, page = 0, 1000  # PostgREST caps responses at 1000
    while True:
        rows = await db.select(
            "lca_filings",
            select="employer_fein,employer_name_raw,fiscal_year",
            params=[("order", "id"), ("limit", str(page)), ("offset", str(offset))],
        )
        if not rows:
            break
        for row in rows:
            scanned += 1
            fein = row.get("employer_fein")
            name = row.get("employer_name_raw")
            if not fein or not name:
                continue
            fein_names[fein][name] += 1
            fein_fy.setdefault(fein, row.get("fiscal_year"))
        offset += len(rows)
        if len(rows) < page:
            break
    return fein_names, fein_fy, scanned


async def _existing_fein_map(db: SupabaseRest) -> dict[str, str]:
    """{fein: employer_id} for FEINs already seeded. Makes seeding re-runnable: `employers` has
    no natural unique key (it's brand-level, FEIN moved to the alias layer), so idempotency comes
    from employer_name_aliases.employer_fein, which IS unique."""
    out: dict[str, str] = {}
    offset, page = 0, 1000
    while True:
        rows = await db.select(
            "employer_name_aliases",
            select="employer_fein,employer_id",
            params=[("order", "id"), ("limit", str(page)), ("offset", str(offset))],
        )
        if not rows:
            break
        for row in rows:
            if row.get("employer_fein"):
                out[row["employer_fein"]] = row["employer_id"]
        offset += len(rows)
        if len(rows) < page:
            break
    return out


def build_seed_plan(
    fein_names: dict[str, dict[str, int]],
    fein_fy: dict[str, int],
    already_seeded: dict[str, str],
    *,
    scanned: int,
) -> SeedPlan:
    employers: list[dict[str, Any]] = []
    aliases: list[dict[str, Any]] = []
    fein_to_id: dict[str, str] = dict(already_seeded)
    divergent: list[tuple[str, str, list[str]]] = []
    multi_spelling = 0

    for fein in sorted(fein_names):
        names = fein_names[fein]
        if len(names) > 1:
            multi_spelling += 1
            # Spellings that normalize to *different* names aren't cosmetic variants - they're
            # distinct orgs sharing one tax ID (e.g. 22 SUNY campuses under 14-6013200). One
            # employers row per FEIN therefore mislabels them. Reported, not silently merged.
            norms = sorted({normalize_employer_name(n) for n in names})
            if len(norms) > 1:
                modal = max(names.items(), key=lambda kv: kv[1])[0]
                divergent.append((fein, modal, norms))

        if fein in already_seeded:
            continue

        employer_id = str(uuid4())  # client-side: `employers` has no FEIN column to map back by,
        # and two rows can share a canonical_name (Regeneron), so a
        # returned-row correlation would be ambiguous.
        fein_to_id[fein] = employer_id
        canonical = max(names.items(), key=lambda kv: kv[1])[0]
        employers.append(
            {
                "id": employer_id,
                "canonical_name": canonical,
                "normalized_name": normalize_employer_name(canonical),
            }
        )
        for raw_name in sorted(names):
            aliases.append(
                {
                    "employer_id": employer_id,
                    "raw_name": raw_name,
                    "normalized_name": normalize_employer_name(raw_name),
                    "employer_fein": fein,
                    "source": "dol_lca",
                    "source_fiscal_year": fein_fy.get(fein),
                }
            )

    counts: SeedCounts = {
        "lca_rows_scanned": scanned,
        "distinct_feins": len(fein_names),
        "feins_already_seeded": len(already_seeded),
        "employers_to_create": len(employers),
        "aliases_to_create": len(aliases),
        "feins_with_multiple_spellings": multi_spelling,
        "feins_with_divergent_names": len(divergent),
    }
    return {
        "employers": employers,
        "aliases": aliases,
        "fein_to_employer_id": fein_to_id,
        "counts": counts,
        "divergent": divergent,
    }


async def seed_employers_from_lca(db: SupabaseRest, *, dry_run: bool) -> SeedPlan:
    fein_names, fein_fy, scanned = await _scan_lca_feins(db)
    already = await _existing_fein_map(db)

    # Guard against the trap state a mid-run failure can leave behind: employers rows exist but
    # no aliases point at them. Idempotency is keyed off aliases, so a blind re-run would treat
    # those employers as absent and insert a second full set. Refuse instead of duplicating.
    if not already:
        orphans = await db.select("employers", select="id", params=[("limit", "1")])
        if orphans:
            raise RuntimeError(
                "employers has rows but no FEIN-bearing aliases reference them - a previous seed "
                "run likely failed partway. Delete the orphaned employers rows before re-seeding."
            )

    plan = build_seed_plan(fein_names, fein_fy, already, scanned=scanned)

    if dry_run:
        plan["counts"]["lca_rows_backfilled"] = 0
        return plan

    new_employer_ids = [row["id"] for row in plan["employers"]]
    if plan["employers"]:
        await db.insert_rows("employers", plan["employers"], dry_run=False)
    try:
        # Plain insert, not upsert: FEINs already seeded are skipped above, so there is nothing
        # to merge. (Upserting here would also fail outright - ON CONFLICT cannot target a
        # partial unique index without repeating its WHERE predicate, which PostgREST omits.)
        if plan["aliases"]:
            await db.insert_rows("employer_name_aliases", plan["aliases"], dry_run=False)
    except Exception:
        # No cross-request transaction over PostgREST, so undo by hand. Only the employers rows
        # this call created are removed - their ids are known because they're generated
        # client-side, so this can never touch pre-existing data.
        if new_employer_ids:
            await db.delete_rows(
                "employers",
                params=[("id", f"in.({','.join(new_employer_ids)})")],
                dry_run=False,
            )
        raise

    backfilled = 0
    for fein, employer_id in plan["fein_to_employer_id"].items():
        backfilled += await db.patch_rows(
            "lca_filings",
            {"employer_id": employer_id},
            params=[("employer_fein", f"eq.{fein}")],
            dry_run=False,
        )
    plan["counts"]["lca_rows_backfilled"] = backfilled
    return plan
