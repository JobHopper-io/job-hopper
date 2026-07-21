from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import typer

from job_processor import (
    sponsorship_domain_backfill,
    sponsorship_ingest,
    sponsorship_resolution,
    sponsorship_scope,
    sponsorship_scoring,
)
from job_processor.llm_ops import openai_client
from job_processor.settings import get_settings
from job_processor.supabase_client import SupabaseRest

app = typer.Typer(help="CLI for the job-processor FastAPI service")

sponsorship_app = typer.Typer(help="Sponsorship data engine: employer scope list + scoped DOL/USCIS ingestion")
app.add_typer(sponsorship_app, name="sponsorship")


@app.command("enqueue")
def enqueue(
    base_url: str = typer.Option(
        ...,
        "--base-url",
        envvar="JOB_PROCESSOR_BASE_URL",
        help="API root, e.g. http://127.0.0.1:8000",
    ),
    api_key: str = typer.Option(
        ...,
        "--api-key",
        envvar="JOB_PROCESSOR_API_KEY",
        help="Must match one of JOB_PROCESSOR_API_KEYS on the server",
    ),
    limit: int = typer.Option(50, "--limit", min=1),
    dry_run: bool = typer.Option(False, "--dry-run"),
    skip_domain: bool = typer.Option(False, "--skip-domain-resolution"),
    skip_apollo: bool = typer.Option(False, "--skip-apollo"),
    skip_enrich: bool = typer.Option(False, "--skip-enrichment"),
) -> None:
    """Start a run (returns immediately; pipeline runs in the API process)."""
    payload: dict[str, object] = {
        "limit": limit,
        "dry_run": dry_run,
        "skip_domain_resolution": skip_domain,
        "skip_apollo": skip_apollo,
        "skip_enrichment": skip_enrich,
    }
    r = httpx.post(
        f"{base_url.rstrip('/')}/v1/runs",
        headers={"X-API-Key": api_key},
        json=payload,
        timeout=60.0,
    )
    r.raise_for_status()
    typer.echo(json.dumps(r.json(), indent=2))


@app.command("sync")
def sync(
    base_url: str = typer.Option(..., "--base-url", envvar="JOB_PROCESSOR_BASE_URL"),
    api_key: str = typer.Option(..., "--api-key", envvar="JOB_PROCESSOR_API_KEY"),
    limit: int = typer.Option(10, "--limit", min=1),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    """Run inline (blocks until finished). Use small --limit to avoid HTTP timeouts."""
    payload: dict[str, object] = {"limit": limit, "dry_run": dry_run}
    r = httpx.post(
        f"{base_url.rstrip('/')}/v1/runs/sync",
        headers={"X-API-Key": api_key},
        json=payload,
        timeout=3600.0,
    )
    r.raise_for_status()
    typer.echo(json.dumps(r.json(), indent=2))


@app.command("status")
def run_status(
    run_id: str = typer.Argument(..., metavar="RUN_ID"),
    base_url: str = typer.Option(..., "--base-url", envvar="JOB_PROCESSOR_BASE_URL"),
    api_key: str = typer.Option(..., "--api-key", envvar="JOB_PROCESSOR_API_KEY"),
) -> None:
    r = httpx.get(
        f"{base_url.rstrip('/')}/v1/runs/{run_id}",
        headers={"X-API-Key": api_key},
        timeout=60.0,
    )
    r.raise_for_status()
    typer.echo(json.dumps(r.json(), indent=2))


@sponsorship_app.command("scope-list")
def sponsorship_scope_list(
    input_path: Path = typer.Option(..., "--input", exists=True, dir_okay=False, help="DOL LCA disclosure .xlsx"),
    output_path: Path = typer.Option(..., "--output", help="Where to write the scope CSV"),
    fiscal_year: int = typer.Option(..., "--fiscal-year", help="Fiscal year the file covers, e.g. 2026"),
    top_n: int = typer.Option(400, "--top-n", min=1, help="How many employers to keep (300-500 recommended)"),
) -> None:
    """Builds the top-N employer scope list, ranked by summed TOTAL_WORKER_POSITIONS."""
    rows = sponsorship_scope.build_scope_csv(input_path, output_path, fiscal_year=fiscal_year, top_n=top_n)
    typer.echo(f"Wrote {len(rows)} employers to {output_path}")
    typer.echo("Top 10 by volume:")
    for row in rows[:10]:
        typer.echo(f"  {row['total_positions']:>6}  {row['employer_name_raw']} ({row['filing_count']} filings)")


@sponsorship_app.command("ingest-lca")
def sponsorship_ingest_lca(
    input_path: Path = typer.Option(..., "--input", exists=True, dir_okay=False, help="DOL LCA disclosure .xlsx"),
    scope_path: Path = typer.Option(..., "--scope", exists=True, dir_okay=False, help="scope_top_sponsors.csv"),
    fiscal_year: int = typer.Option(..., "--fiscal-year"),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    """Loads scoped LCA filing rows into lca_filings (employer_id left null; resolution is a later pass)."""

    async def run() -> sponsorship_ingest.IngestCounts:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            db = SupabaseRest(settings, client)
            return await sponsorship_ingest.ingest_lca_filings(
                db, input_path, scope_path, fiscal_year=fiscal_year, dry_run=dry_run
            )

    typer.echo(json.dumps(asyncio.run(run()), indent=2))


@sponsorship_app.command("ingest-uscis")
def sponsorship_ingest_uscis(
    input_path: Path = typer.Option(
        ..., "--input", exists=True, dir_okay=False, help="USCIS H-1B Hub 'Employer Information' export (.xlsx)"
    ),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    """Loads the full USCIS H-1B Hub file into uscis_h1b_hub (employer_id left null).

    Unlike ingest-lca this takes no --scope: the file is small and the only available filter
    would be employer name, which is lossy. See sponsorship_ingest module docstring.
    """

    async def run() -> sponsorship_ingest.IngestCounts:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            db = SupabaseRest(settings, client)
            return await sponsorship_ingest.ingest_uscis_hub(db, input_path, dry_run=dry_run)

    typer.echo(json.dumps(asyncio.run(run()), indent=2))


@sponsorship_app.command("seed-employers")
def sponsorship_seed_employers(
    dry_run: bool = typer.Option(False, "--dry-run"),
    show_divergent: int = typer.Option(
        10, "--show-divergent", help="How many FEINs-with-divergent-names to print (0 = none)"
    ),
) -> None:
    """D36: seed employers + employer_name_aliases from the FEINs in lca_filings, then backfill
    lca_filings.employer_id. FEIN is a direct key - no fuzzy matching. Does NOT do brand grouping
    (D37), so Goldman stays 3 rows and Regeneron 2. Re-runnable: FEINs already seeded are skipped.
    """

    async def run() -> sponsorship_resolution.SeedPlan:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            db = SupabaseRest(settings, client)
            return await sponsorship_resolution.seed_employers_from_lca(db, dry_run=dry_run)

    plan = asyncio.run(run())
    typer.echo(json.dumps(plan["counts"], indent=2))

    divergent = plan["divergent"]
    if divergent and show_divergent:
        typer.echo(
            f"\n⚠️  {len(divergent)} FEINs cover MULTIPLE DISTINCT ORG NAMES (not spelling variants)."
            "\n   One employers row per FEIN means each of these gets ONE canonical_name that"
            "\n   mislabels the others. Not a merge problem (D37) - the inverse. Top offenders:"
        )
        for fein, modal, norms in sorted(divergent, key=lambda d: -len(d[2]))[:show_divergent]:
            typer.echo(f"\n   {fein}  ->  labelled {modal!r}")
            typer.echo(f"      but covers {len(norms)} distinct orgs, e.g.:")
            for n in norms[:4]:
                typer.echo(f"        - {n}")


@sponsorship_app.command("apply-d37-decisions")
def sponsorship_apply_d37_decisions(
    merge_csv: Path = typer.Option(
        Path("data/review_merge_candidates.csv"), "--merge-csv", exists=True, dir_okay=False
    ),
    umbrella_csv: Path = typer.Option(
        Path("data/review_umbrella_feins.csv"), "--umbrella-csv", exists=True, dir_okay=False
    ),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    """D37 (reduced scope, §3 decision 7): applies the human-reviewed decisions in the two CSVs.
    Merges confirmed multi-FEIN brands (Goldman, Amazon, ...) into one employers row each, and
    flags genuine umbrella FEINs (SUNY, NYC, ...) with excluded_from_scoring=true. Reads decisions
    from the CSVs - does not detect anything itself. Merges run before exclusions, since a FEIN's
    employer_id can change during a merge and the exclusion must land on the current row.
    """

    async def run() -> tuple[sponsorship_resolution.MergeApplyCounts, list[sponsorship_resolution.MergeGroupResult], sponsorship_resolution.ExclusionApplyCounts]:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            db = SupabaseRest(settings, client)
            merge_counts, merge_results = await sponsorship_resolution.apply_merge_decisions(db, merge_csv, dry_run=dry_run)
            excl_counts = await sponsorship_resolution.apply_scoring_exclusions(db, umbrella_csv, dry_run=dry_run)
            return merge_counts, merge_results, excl_counts

    merge_counts, merge_results, excl_counts = asyncio.run(run())

    typer.echo("=== merge ===")
    typer.echo(json.dumps(merge_counts, indent=2))
    typer.echo("\nper-brand:")
    for r in merge_results:
        status = "already merged" if r["already_merged"] else f"merging {len(r['other_employer_ids'])} into primary"
        typer.echo(
            f"  {r['brand']:<16} {len(r['feins'])} FEINs, primary={r['primary_fein']}"
            f"  [{status}]  aliases={r['aliases_repointed']:>4}  filings={r['filings_repointed']:>6}"
        )

    typer.echo("\n=== scoring exclusions ===")
    typer.echo(json.dumps(excl_counts, indent=2))


@sponsorship_app.command("compute-scores")
def sponsorship_compute_scores(
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    """D41-45 (§3 decision 7): scores every non-excluded employer Low/Medium/High from
    lca_filings alone (volume + recency) - no USCIS input. excluded_from_scoring=true employers
    get no row (fall back to the heuristic badge). Re-runnable: upserts on employer_id.
    """

    async def run() -> sponsorship_scoring.ScoreComputeCounts:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            db = SupabaseRest(settings, client)
            return await sponsorship_scoring.compute_and_write_scores(db, dry_run=dry_run)

    counts = asyncio.run(run())
    typer.echo(json.dumps(counts, indent=2))


@sponsorship_app.command("backfill-employer-domains")
def sponsorship_backfill_employer_domains(
    dry_run: bool = typer.Option(False, "--dry-run"),
    brave_only: bool = typer.Option(
        False,
        "--brave-only",
        help="Skip the LLM confirmation step and take Brave's top search result's domain "
        "directly. For use when no LLM key is available - only safe for well-known, "
        "unambiguous company names, not the long tail where disambiguation matters.",
    ),
    only_name: list[str] = typer.Option(
        [],
        "--only-name",
        help="Restrict to these canonical_name(s) (repeatable). For spot-checking a handful "
        "of employers before running the full backfill.",
    ),
) -> None:
    """D46-50 (§3 decision 11): resolves employers.domain for scored employers via the same
    resolve_company_domain used for job postings in pipeline.py (Brave + LLM, no Apollo credits),
    so job<->employer matching can go through domain equality instead of lossy name matching.
    Skips excluded_from_scoring=true and already-resolved employers. Re-runnable.
    """

    async def run() -> sponsorship_domain_backfill.DomainBackfillCounts:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            db = SupabaseRest(settings, client)
            oai = openai_client(settings)
            return await sponsorship_domain_backfill.backfill_employer_domains(
                db,
                settings=settings,
                http_client=client,
                oai=oai,
                model=settings.llm_model_domain,
                dry_run=dry_run,
                brave_only=brave_only,
                only_names=only_name or None,
            )

    counts = asyncio.run(run())
    typer.echo(json.dumps(counts, indent=2))


def main() -> None:
    app()


if __name__ == "__main__":
    main()
