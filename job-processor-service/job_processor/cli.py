from __future__ import annotations

import json

import httpx
import typer

app = typer.Typer(help="CLI for the job-processor FastAPI service")


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


def main() -> None:
    app()


if __name__ == "__main__":
    main()
