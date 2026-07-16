"""Streams and normalizes DOL OFLC LCA disclosure `.xlsx` files.

These files are large (~1M rows, 75+ columns) and their column layout drifts across
fiscal years (columns get added/reordered - e.g. EMPLOYER_FEIN sits between
EMPLOYER_PHONE_EXT and NAICS_CODE in FY2026 Q2). Reading is done with the stdlib
`zipfile` + `xml.etree.ElementTree` (an `.xlsx` is a zip of XML parts) in streaming mode
so no third-party dependency (openpyxl/pandas) or full in-memory load is needed.

Column resolution is header-text-driven, not column-letter-driven: the header row is
read once to build {header_text: column_letter}, so a future FY that reorders columns
still works. `CANONICAL_FIELD_ALIASES` lets a future FY that *renames* a header be
supported by adding an alias, without touching the rest of the pipeline.
"""

from __future__ import annotations

import re
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
_EXCEL_EPOCH = date(1899, 12, 30)

# canonical_field -> raw header strings seen across fiscal years (order = preference).
# Seeded from a real FY2026 Q2 file; add a new alias tuple entry per field as later FYs
# turn up different header text. Matching is whitespace/case-insensitive (see _norm_header).
CANONICAL_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "case_number": ("CASE_NUMBER",),
    "case_status": ("CASE_STATUS",),
    "visa_class": ("VISA_CLASS",),
    "received_date": ("RECEIVED_DATE",),
    "decision_date": ("DECISION_DATE",),
    "employer_name": ("EMPLOYER_NAME",),
    "employer_fein": ("EMPLOYER_FEIN",),
    "employer_city": ("EMPLOYER_CITY",),
    "employer_state": ("EMPLOYER_STATE",),
    "employer_postal_code": ("EMPLOYER_POSTAL_CODE",),
    "soc_code": ("SOC_CODE",),
    "soc_title": ("SOC_TITLE",),
    "job_title": ("JOB_TITLE",),
    "total_worker_positions": ("TOTAL_WORKER_POSITIONS",),
    "wage_from": ("WAGE_RATE_OF_PAY_FROM",),
    "wage_to": ("WAGE_RATE_OF_PAY_TO",),
    "wage_unit": ("WAGE_UNIT_OF_PAY",),
    "prevailing_wage": ("PREVAILING_WAGE",),
    "worksite_city": ("WORKSITE_CITY",),
    "worksite_state": ("WORKSITE_STATE",),
    "worksite_postal_code": ("WORKSITE_POSTAL_CODE",),
}


@dataclass
class LcaFilingRecord:
    case_number: str | None
    case_status: str | None
    visa_class: str | None
    received_date: date | None
    decision_date: date | None
    employer_name: str | None
    employer_fein: str | None
    employer_city: str | None
    employer_state: str | None
    employer_postal_code: str | None
    soc_code: str | None
    soc_title: str | None
    job_title: str | None
    total_worker_positions: int | None
    wage_from: float | None
    wage_to: float | None
    wage_unit: str | None
    prevailing_wage: float | None
    worksite_city: str | None
    worksite_state: str | None
    worksite_postal_code: str | None
    fiscal_year: int
    source_file: str


def _norm_header(text: str) -> str:
    return re.sub(r"\s+", "", text).strip().upper()


def _col_letters(cell_ref: str) -> str:
    return "".join(c for c in cell_ref if c.isalpha())


def _load_shared_strings(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    with z.open("xl/sharedStrings.xml") as f:
        root = ET.parse(f).getroot()
    return ["".join(t.text or "" for t in si.findall(".//m:t", _NS)) for si in root.findall("m:si", _NS)]


def _stream_sheet_rows(xlsx_path: str | Path) -> Iterator[dict[str, str | None]]:
    """Yields each row (including the header row) as {column_letter: raw_cell_text}."""
    with zipfile.ZipFile(xlsx_path) as z:
        shared = _load_shared_strings(z)
        with z.open("xl/worksheets/sheet1.xml") as f:
            for _event, elem in ET.iterparse(f, events=("end",)):
                if not elem.tag.endswith("}row"):
                    continue
                row: dict[str, str | None] = {}
                for c in elem.findall("m:c", _NS):
                    col = _col_letters(c.get("r", ""))
                    cell_type = c.get("t")
                    if cell_type == "inlineStr":
                        is_el = c.find("m:is", _NS)
                        value = "".join(t.text or "" for t in is_el.findall(".//m:t", _NS)) if is_el is not None else None
                    else:
                        v = c.find("m:v", _NS)
                        value = v.text if v is not None else None
                        if cell_type == "s" and value is not None:
                            value = shared[int(value)]
                    row[col] = value
                yield row
                elem.clear()


def iter_raw_rows(xlsx_path: str | Path) -> Iterator[dict[str, str | None]]:
    """Streams data rows keyed by the literal header text found in the file.

    Reads row 1 as the header to build a {column_letter: header_text} map, then
    remaps every subsequent row's {column_letter: value} to {header_text: value}.
    Columns not present in the header are dropped; missing cells become None.
    """
    rows = _stream_sheet_rows(xlsx_path)
    try:
        header_row = next(rows)
    except StopIteration:
        return
    col_to_header = {col: text for col, text in header_row.items() if text}
    for row in rows:
        yield {header: row.get(col) for col, header in col_to_header.items()}


def _resolve(raw_row: dict[str, str | None], normalized_index: dict[str, str], canonical_field: str) -> str | None:
    for alias in CANONICAL_FIELD_ALIASES[canonical_field]:
        header = normalized_index.get(_norm_header(alias))
        if header is not None:
            return raw_row.get(header)
    return None


def _clean_str(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def _parse_int(value: str | None) -> int | None:
    cleaned = _clean_str(value)
    if cleaned is None:
        return None
    return int(float(cleaned))


def _parse_float(value: str | None) -> float | None:
    cleaned = _clean_str(value)
    if cleaned is None:
        return None
    return float(cleaned)


def _parse_excel_date(value: str | None) -> date | None:
    cleaned = _clean_str(value)
    if cleaned is None:
        return None
    serial = int(float(cleaned))
    return _EXCEL_EPOCH + timedelta(days=serial)


def normalize_row(raw_row: dict[str, str | None], *, fiscal_year: int, source_file: str) -> LcaFilingRecord:
    """Maps a raw {header_text: value} row (from iter_raw_rows) to a typed record."""
    normalized_index = {_norm_header(header): header for header in raw_row}

    def get(field: str) -> str | None:
        return _resolve(raw_row, normalized_index, field)

    return LcaFilingRecord(
        case_number=_clean_str(get("case_number")),
        case_status=_clean_str(get("case_status")),
        visa_class=_clean_str(get("visa_class")),
        received_date=_parse_excel_date(get("received_date")),
        decision_date=_parse_excel_date(get("decision_date")),
        employer_name=_clean_str(get("employer_name")),
        employer_fein=_clean_str(get("employer_fein")),
        employer_city=_clean_str(get("employer_city")),
        employer_state=_clean_str(get("employer_state")),
        employer_postal_code=_clean_str(get("employer_postal_code")),
        soc_code=_clean_str(get("soc_code")),
        soc_title=_clean_str(get("soc_title")),
        job_title=_clean_str(get("job_title")),
        total_worker_positions=_parse_int(get("total_worker_positions")),
        wage_from=_parse_float(get("wage_from")),
        wage_to=_parse_float(get("wage_to")),
        wage_unit=_clean_str(get("wage_unit")),
        prevailing_wage=_parse_float(get("prevailing_wage")),
        worksite_city=_clean_str(get("worksite_city")),
        worksite_state=_clean_str(get("worksite_state")),
        worksite_postal_code=_clean_str(get("worksite_postal_code")),
        fiscal_year=fiscal_year,
        source_file=source_file,
    )


def iter_normalized_rows(xlsx_path: str | Path, *, fiscal_year: int) -> Iterator[LcaFilingRecord]:
    source_file = Path(xlsx_path).name
    for raw_row in iter_raw_rows(xlsx_path):
        yield normalize_row(raw_row, fiscal_year=fiscal_year, source_file=source_file)
