"""Builds the top-N employer scope list from a DOL LCA disclosure file.

Per docs/sponsorship-data-engine.md §5a action 1 / §3 decision 4: scope to the top
300-500 high-volume sponsors first, ranked by summed TOTAL_WORKER_POSITIONS. Grouping
prefers EMPLOYER_FEIN (a real, populated column as of FY2026 Q2 - see plan) since it's a
much cleaner dedup key than raw name; falls back to a locally-normalized name only when
FEIN is blank (older filings). This is intentionally NOT the full fuzzy/vector entity
resolution planned for D36-40 - just enough grouping to rank volume accurately.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import TypedDict

from job_processor.lca_normalizer import iter_normalized_rows

_LEGAL_SUFFIX_TOKENS = {
    "inc",
    "llc",
    "corp",
    "corporation",
    "co",
    "company",
    "ltd",
    "limited",
    "lp",
    "plc",
    "pc",
    "pllc",
}


class ScopeRow(TypedDict):
    employer_fein: str
    employer_name_raw: str
    total_positions: int
    filing_count: int


def normalize_employer_name(name: str) -> str:
    cleaned = re.sub(r"[^\w\s]", "", name.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    tokens = cleaned.split(" ")
    if tokens and tokens[-1] in _LEGAL_SUFFIX_TOKENS:
        tokens = tokens[:-1]
    return " ".join(tokens)


def scope_key(employer_fein: str | None, employer_name: str) -> str:
    """The grouping/matching key used both to build the scope list and to filter ingestion
    against it: FEIN when present (reliable dedup key), else a locally-normalized name."""
    if employer_fein:
        return f"fein:{employer_fein}"
    return f"name:{normalize_employer_name(employer_name)}"


def build_scope_rows(xlsx_path: str | Path, *, fiscal_year: int, top_n: int) -> list[ScopeRow]:
    groups: dict[str, dict] = {}

    for record in iter_normalized_rows(xlsx_path, fiscal_year=fiscal_year):
        if not record.employer_name:
            continue
        key = scope_key(record.employer_fein, record.employer_name)
        group = groups.setdefault(
            key,
            {"employer_fein": record.employer_fein, "name_counts": {}, "total_positions": 0, "filing_count": 0},
        )
        group["name_counts"][record.employer_name] = group["name_counts"].get(record.employer_name, 0) + 1
        group["total_positions"] += record.total_worker_positions or 0
        group["filing_count"] += 1

    rows: list[ScopeRow] = []
    for group in groups.values():
        raw_name = max(group["name_counts"].items(), key=lambda kv: kv[1])[0]
        rows.append(
            {
                "employer_fein": group["employer_fein"] or "",
                "employer_name_raw": raw_name,
                "total_positions": group["total_positions"],
                "filing_count": group["filing_count"],
            }
        )

    rows.sort(key=lambda r: r["total_positions"], reverse=True)
    return rows[:top_n]


def write_scope_csv(rows: list[ScopeRow], output_csv_path: str | Path) -> None:
    output_path = Path(output_csv_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["employer_fein", "employer_name_raw", "total_positions", "filing_count"])
        writer.writeheader()
        writer.writerows(rows)


def build_scope_csv(xlsx_path: str | Path, output_csv_path: str | Path, *, fiscal_year: int, top_n: int = 400) -> list[ScopeRow]:
    rows = build_scope_rows(xlsx_path, fiscal_year=fiscal_year, top_n=top_n)
    write_scope_csv(rows, output_csv_path)
    return rows
