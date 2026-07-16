from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import typer

from job_processor import sponsorship_ingest, sponsorship_scope
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


def main() -> None:
    app()


if __name__ == "__main__":
    main()
