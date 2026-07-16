"""Ingestion of DOL LCA filings and USCIS H-1B Hub rows into Supabase.

employer_id is left null on every row - entity resolution is a separate, later pass (D36-40).

Scoping differs per source, deliberately (docs/sponsorship-data-engine.md §5a action 4):
- LCA is filtered to the sponsorship_scope.py employer list. The source file is ~1M rows and
  the filter keys on EMPLOYER_FEIN, which is exact.
- USCIS is loaded in full. Its file is only ~36k rows, so scoping buys no tractability, and the
  only filter available would be employer *name* (USCIS has no full FEIN, just last-4) - which
  is lossy: DOL writes "&" where USCIS writes "and", so a name filter silently drops major
  sponsors (Goldman Sachs, JPMorgan, McKinsey...). Loading everything defers employer matching
  to D36-40, where FEIN/fuzzy/vector belongs, with all rows already present.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, TypedDict

from job_processor.lca_normalizer import LcaFilingRecord, iter_normalized_rows, iter_raw_rows
from job_processor.sponsorship_scope import scope_key
from job_processor.supabase_client import SupabaseRest


class IngestCounts(TypedDict, total=False):
    rows_seen: int
    rows_matched_scope: int
    rows_valid: int
    rows_upserted: int
    rows_after_dedupe: int


def load_scope_keys(scope_csv_path: str | Path) -> set[str]:
    """FEIN-or-normalized-name keys, matching sponsorship_scope.scope_key exactly.
    Used to filter LCA rows, which do carry EMPLOYER_FEIN."""
    keys: set[str] = set()
    with Path(scope_csv_path).open(newline="") as f:
        for row in csv.DictReader(f):
            fein = (row.get("employer_fein") or "").strip() or None
            name = row.get("employer_name_raw") or ""
            if name:
                keys.add(scope_key(fein, name))
    return keys


def _lca_record_to_row(record: LcaFilingRecord) -> dict[str, Any]:
    return {
        "case_number": record.case_number,
        "employer_name_raw": record.employer_name,
        "employer_fein": record.employer_fein,
        "case_status": record.case_status,
        "visa_class": record.visa_class,
        "received_date": record.received_date.isoformat() if record.received_date else None,
        "decision_date": record.decision_date.isoformat() if record.decision_date else None,
        "soc_code": record.soc_code,
        "soc_title": record.soc_title,
        "job_title": record.job_title,
        "total_worker_positions": record.total_worker_positions,
        "wage_from": record.wage_from,
        "wage_to": record.wage_to,
        "wage_unit": record.wage_unit,
        "prevailing_wage": record.prevailing_wage,
        "worksite_city": record.worksite_city,
        "worksite_state": record.worksite_state,
        "worksite_postal_code": record.worksite_postal_code,
        "fiscal_year": record.fiscal_year,
        "source_file": record.source_file,
    }


async def ingest_lca_filings(
    db: SupabaseRest,
    xlsx_path: str | Path,
    scope_csv_path: str | Path,
    *,
    fiscal_year: int,
    dry_run: bool,
) -> IngestCounts:
    scope_keys = load_scope_keys(scope_csv_path)
    rows: list[dict[str, Any]] = []
    seen = 0
    matched = 0

    for record in iter_normalized_rows(xlsx_path, fiscal_year=fiscal_year):
        seen += 1
        if not record.employer_name or not record.case_number:
            continue
        if scope_key(record.employer_fein, record.employer_name) not in scope_keys:
            continue
        matched += 1
        rows.append(_lca_record_to_row(record))

    sent = await db.upsert_rows("lca_filings", rows, on_conflict="case_number", dry_run=dry_run)
    return {"rows_seen": seen, "rows_matched_scope": matched, "rows_upserted": sent}


def _int_or_none(value: str | None) -> int | None:
    cleaned = (value or "").strip()
    return int(cleaned) if cleaned else None


def _str_or_none(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None


# Real header from the USCIS "Employer Information" (Line-by-line) FY2026 export - confirmed by
# parsing the actual file, not assumed. Note "Fiscal Year" has trailing whitespace in the source
# (row-key stripping below handles that); it's the 6-category breakdown, not a 4-bucket summary -
# see Correction #2 in docs/sponsorship-data-engine.md. Column order in the real file:
#   Line by line, Fiscal Year, Employer (Petitioner) Name, Tax ID, Industry (NAICS) Code,
#   Petitioner City, Petitioner State, Petitioner Zip Code, New Employment Approval/Denial,
#   Continuation Approval/Denial, Change with Same Employer Approval/Denial,
#   New Concurrent Approval/Denial, Change of Employer Approval/Denial, Amended Approval/Denial
_USCIS_COUNT_HEADER_TO_FIELD = {
    "New Employment Approval": "new_employment_approvals",
    "New Employment Denial": "new_employment_denials",
    "Continuation Approval": "continuation_approvals",
    "Continuation Denial": "continuation_denials",
    "Change with Same Employer Approval": "change_same_employer_approvals",
    "Change with Same Employer Denial": "change_same_employer_denials",
    "New Concurrent Approval": "new_concurrent_approvals",
    "New Concurrent Denial": "new_concurrent_denials",
    "Change of Employer Approval": "change_employer_approvals",
    "Change of Employer Denial": "change_employer_denials",
    "Amended Approval": "amended_approvals",
    "Amended Denial": "amended_denials",
}


def _uscis_row_to_record(row: dict[str, str | None]) -> dict[str, Any] | None:
    stripped = {(header or "").strip(): value for header, value in row.items()}
    employer = _str_or_none(stripped.get("Employer (Petitioner) Name"))
    fiscal_year = _int_or_none(stripped.get("Fiscal Year"))
    if not employer or fiscal_year is None:
        return None
    record: dict[str, Any] = {
        "employer_name_raw": employer,
        "fiscal_year": fiscal_year,
        "tax_id_last4": _str_or_none(stripped.get("Tax ID")),
        "naics_code": _str_or_none(stripped.get("Industry (NAICS) Code")),
        "city": _str_or_none(stripped.get("Petitioner City")),
        "state": _str_or_none(stripped.get("Petitioner State")),
        "zip": _str_or_none(stripped.get("Petitioner Zip Code")),
    }
    for header, field in _USCIS_COUNT_HEADER_TO_FIELD.items():
        record[field] = _int_or_none(stripped.get(header))
    return record


_USCIS_NATURAL_KEY_FIELDS = ("fiscal_year", "employer_name_raw", "tax_id_last4", "city", "state", "zip", "naics_code")
_USCIS_COUNT_FIELDS = tuple(_USCIS_COUNT_HEADER_TO_FIELD.values())


def _dedupe_uscis_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """USCIS Hub's own export sometimes has >1 row for an identical natural key, even
    including naics_code (confirmed on the real FY2023 file, e.g. Accenture LLP/Chicago
    appears twice with different counts). The table can only hold one row per key, so
    sum the count fields rather than letting upsert silently drop one row's data."""
    merged: dict[tuple, dict[str, Any]] = {}
    for record in records:
        key = tuple(record[field] for field in _USCIS_NATURAL_KEY_FIELDS)
        if key not in merged:
            merged[key] = dict(record)
            continue
        for field in _USCIS_COUNT_FIELDS:
            merged[key][field] = (merged[key].get(field) or 0) + (record.get(field) or 0)
    return list(merged.values())


async def ingest_uscis_hub(
    db: SupabaseRest,
    xlsx_path: str | Path,
    *,
    dry_run: bool,
) -> IngestCounts:
    """Loads the whole USCIS file - no employer scoping. See the module docstring for why.

    xlsx_path: the USCIS "Employer Information" (Line-by-line) export - the real-world file is
    .xlsx, not the plain annual-aggregate .csv originally assumed. Reuses lca_normalizer's
    header-driven xlsx reader (iter_raw_rows), which has no LCA-specific logic - it just streams
    any .xlsx by {header_text: value} per row.
    """
    rows: list[dict[str, Any]] = []
    seen = 0

    for raw_row in iter_raw_rows(xlsx_path):
        seen += 1
        record = _uscis_row_to_record(raw_row)
        if record is None:  # blank employer name or unparseable fiscal year
            continue
        rows.append(record)

    valid = len(rows)
    rows = _dedupe_uscis_records(rows)

    sent = await db.upsert_rows(
        "uscis_h1b_hub",
        rows,
        on_conflict="fiscal_year,employer_name_raw,tax_id_last4,city,state,zip,naics_code",
        dry_run=dry_run,
    )
    return {"rows_seen": seen, "rows_valid": valid, "rows_after_dedupe": len(rows), "rows_upserted": sent}
