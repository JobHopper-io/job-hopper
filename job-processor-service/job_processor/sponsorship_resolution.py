"""Entity resolution for the sponsorship data engine (D36-40).

D36: seed `employers` + `employer_name_aliases` from the FEINs already present in `lca_filings`,
and backfill `lca_filings.employer_id`. FEIN is a direct key here - no fuzzy matching
(docs/sponsorship-data-engine.md §3 decision 2).

D37 (reduced scope, §3 decision 7): apply the human-reviewed decisions from
data/review_merge_candidates.csv and data/review_umbrella_feins.csv.
- Merge: fold the FEINs of a confirmed multi-entity brand (Goldman's 3, Amazon's 5, ...) into
  one `employers` row. Re-points employer_name_aliases + lca_filings.employer_id; the merged-away
  employers rows are deleted. Raw filing rows are never rewritten - only employer_id moves.
- Flag: genuine umbrella FEINs (one FEIN, many distinct orgs - e.g. SUNY) get
  `employers.excluded_from_scoring = true` instead of being split. No splitting logic here -
  that's future work if ever revisited.
These are NOT auto-detected. The CSVs are a human decision transcribed into a file; this module
only reads and applies them. Detection code lives in the (uncommitted) review-CSV builder script,
deliberately kept separate from the applier.

Model (§3 decision 5): `employers` is BRAND-level; filer identity (FEIN) lives on
`employer_name_aliases`. Raw filing rows are never rewritten - only `employer_id` is filled in.

Deliberately NOT here:
- Systematic merge/split detection across the full 400, or a durable override store - deferred
  to v2 alongside D38-40 (§3 decision 7). This module applies a fixed, already-reviewed list.
- The LCA<->USCIS join (D38-39) - `uscis_h1b_hub` is untouched.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path
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


# --------------------------------------------------------------------------------------- D37


async def _fein_to_employer_id(db: SupabaseRest, feins: list[str]) -> dict[str, str]:
    """Live lookup, not cached - callers run this fresh before AND after mutating so a merge
    step's re-pointing is reflected before the exclusion step reads FEINs it shares."""
    out: dict[str, str] = {}
    for i in range(0, len(feins), 200):  # keep the `in.(...)` filter to a sane URL length
        chunk = feins[i : i + 200]
        offset, page = 0, 1000
        while True:
            rows = await db.select(
                "employer_name_aliases",
                select="employer_fein,employer_id",
                params=[
                    ("employer_fein", f"in.({','.join(chunk)})"),
                    ("order", "id"),
                    ("limit", str(page)),
                    ("offset", str(offset)),
                ],
            )
            if not rows:
                break
            for row in rows:
                out[row["employer_fein"]] = row["employer_id"]
            offset += len(rows)
            if len(rows) < page:
                break
    return out


async def _fein_position_sums(db: SupabaseRest, feins: list[str]) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for i in range(0, len(feins), 200):
        chunk = feins[i : i + 200]
        offset, page = 0, 1000
        while True:
            rows = await db.select(
                "lca_filings",
                select="employer_fein,total_worker_positions",
                params=[
                    ("employer_fein", f"in.({','.join(chunk)})"),
                    ("order", "id"),
                    ("limit", str(page)),
                    ("offset", str(offset)),
                ],
            )
            if not rows:
                break
            for row in rows:
                out[row["employer_fein"]] += row.get("total_worker_positions") or 0
            offset += len(rows)
            if len(rows) < page:
                break
    return dict(out)


class MergeGroupResult(TypedDict):
    brand: str
    feins: list[str]
    already_merged: bool
    primary_fein: str
    primary_employer_id: str
    other_employer_ids: list[str]
    aliases_repointed: int
    filings_repointed: int
    employers_deleted: int


class MergeApplyCounts(TypedDict, total=False):
    merge_rows_in_csv: int
    brands: int
    brands_already_merged: int
    brands_merged_now: int
    employers_before: int
    employers_deleted: int
    employers_after: int
    aliases_repointed: int
    filings_repointed: int


def _read_merge_decisions(csv_path: str | Path) -> dict[str, list[str]]:
    """{brand_display_name: [feins]} for rows decided MERGE. Raises if a row's decision isn't
    exactly MERGE or REJECT, or a MERGE row has no target brand - a blank/typo'd decision column
    should fail loudly here, not be silently skipped."""
    by_brand: dict[str, list[str]] = defaultdict(list)
    with Path(csv_path).open(newline="") as f:
        for row in csv.DictReader(f):
            decision = (row.get("your_decision__keep_reject") or "").strip().upper()
            if decision == "REJECT":
                continue
            if decision != "MERGE":
                raise ValueError(
                    f"unrecognized decision {decision!r} for FEIN {row.get('employer_fein')} "
                    f"(brand_cluster={row.get('brand_cluster')}) - expected MERGE or REJECT"
                )
            brand = (row.get("your_merge_target_brand") or "").strip()
            if not brand:
                raise ValueError(f"MERGE row for FEIN {row.get('employer_fein')} has no your_merge_target_brand")
            by_brand[brand].append(row["employer_fein"])
    return dict(by_brand)


async def apply_merge_decisions(db: SupabaseRest, merge_csv_path: str | Path, *, dry_run: bool) -> tuple[MergeApplyCounts, list[MergeGroupResult]]:
    by_brand = _read_merge_decisions(merge_csv_path)
    all_feins = [f for feins in by_brand.values() for f in feins]

    fein_to_eid = await _fein_to_employer_id(db, all_feins)
    missing = set(all_feins) - set(fein_to_eid)
    if missing:
        raise RuntimeError(f"FEINs in merge CSV not found in employer_name_aliases: {sorted(missing)}")

    fein_to_pos = await _fein_position_sums(db, all_feins)
    employers_before = await db.count_rows("employers")

    counts: MergeApplyCounts = {
        "merge_rows_in_csv": len(all_feins),
        "brands": len(by_brand),
        "brands_already_merged": 0,
        "brands_merged_now": 0,
        "employers_before": employers_before,
        "employers_deleted": 0,
        "aliases_repointed": 0,
        "filings_repointed": 0,
    }
    results: list[MergeGroupResult] = []

    for brand in sorted(by_brand):
        feins = sorted(by_brand[brand])
        eids = {fein_to_eid[f] for f in feins}

        if len(eids) <= 1:
            # Already merged (e.g. a re-run after a partial apply) - not an error, a no-op.
            counts["brands_already_merged"] += 1
            (only_eid,) = eids
            results.append({
                "brand": brand, "feins": feins, "already_merged": True,
                "primary_fein": feins[0], "primary_employer_id": only_eid,
                "other_employer_ids": [], "aliases_repointed": 0,
                "filings_repointed": 0, "employers_deleted": 0,
            })
            continue

        primary_fein = max(feins, key=lambda f: fein_to_pos.get(f, 0))
        primary_eid = fein_to_eid[primary_fein]
        other_eids = sorted(eids - {primary_eid})
        other_filter = [("employer_id", f"in.({','.join(other_eids)})")]

        # Count BEFORE mutating (or before dry_run's no-op) - this is the "would affect" number.
        aliases_n = await db.count_rows("employer_name_aliases", params=other_filter)
        filings_n = await db.count_rows("lca_filings", params=other_filter)

        counts["brands_merged_now"] += 1
        counts["employers_deleted"] += len(other_eids)
        counts["aliases_repointed"] += aliases_n
        counts["filings_repointed"] += filings_n
        results.append({
            "brand": brand, "feins": feins, "already_merged": False,
            "primary_fein": primary_fein, "primary_employer_id": primary_eid,
            "other_employer_ids": other_eids, "aliases_repointed": aliases_n,
            "filings_repointed": filings_n, "employers_deleted": len(other_eids),
        })

        if dry_run:
            continue

        await db.patch_rows("employer_name_aliases", {"employer_id": primary_eid}, params=other_filter, dry_run=False)
        await db.patch_rows("lca_filings", {"employer_id": primary_eid}, params=other_filter, dry_run=False)
        await db.patch_rows(
            "employers",
            {"canonical_name": brand, "normalized_name": normalize_employer_name(brand)},
            params=[("id", f"eq.{primary_eid}")],
            dry_run=False,
        )
        await db.delete_rows("employers", params=[("id", f"in.({','.join(other_eids)})")], dry_run=False)

    counts["employers_after"] = (
        employers_before - counts["employers_deleted"] if dry_run else await db.count_rows("employers")
    )
    return counts, results


class ExclusionApplyCounts(TypedDict, total=False):
    umbrella_rows_in_csv: int
    excluded_true: int
    excluded_false: int


def _read_umbrella_decisions(csv_path: str | Path) -> tuple[list[str], list[str]]:
    """(true_feins, false_feins). Fails loudly on a blank/unrecognized decision column."""
    true_feins, false_feins = [], []
    with Path(csv_path).open(newline="") as f:
        for row in csv.DictReader(f):
            decision = (row.get("your_decision__a_umbrella__b_typo__c_dba") or "").strip()
            if not decision:
                raise ValueError(f"FEIN {row.get('employer_fein')} has no decision")
            (true_feins if decision.lower().startswith("a_umbrella") else false_feins).append(row["employer_fein"])
    return true_feins, false_feins


async def apply_scoring_exclusions(db: SupabaseRest, umbrella_csv_path: str | Path, *, dry_run: bool) -> ExclusionApplyCounts:
    """Run AFTER apply_merge_decisions - a FEIN's employer_id may have changed by a merge, and
    the exclusion must land on the current (post-merge) row."""
    true_feins, false_feins = _read_umbrella_decisions(umbrella_csv_path)
    fein_to_eid = await _fein_to_employer_id(db, true_feins + false_feins)
    missing = set(true_feins + false_feins) - set(fein_to_eid)
    if missing:
        raise RuntimeError(f"FEINs in umbrella CSV not found in employer_name_aliases: {sorted(missing)}")

    true_eids = sorted({fein_to_eid[f] for f in true_feins})
    false_eids = sorted({fein_to_eid[f] for f in false_feins} - set(true_eids))

    if not dry_run:
        if true_eids:
            await db.patch_rows("employers", {"excluded_from_scoring": True}, params=[("id", f"in.({','.join(true_eids)})")], dry_run=False)
        if false_eids:
            await db.patch_rows("employers", {"excluded_from_scoring": False}, params=[("id", f"in.({','.join(false_eids)})")], dry_run=False)

    return {
        "umbrella_rows_in_csv": len(true_feins) + len(false_feins),
        "excluded_true": len(true_eids),
        "excluded_false": len(false_eids),
    }
