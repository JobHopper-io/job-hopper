from __future__ import annotations

import zipfile
from datetime import date
from pathlib import Path

from job_processor.lca_normalizer import iter_raw_rows, normalize_row

_XLSX_HEADER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    "<sheetData>"
)
_XLSX_FOOTER = "</sheetData></worksheet>"


def _cell(ref: str, value: str | None, *, inline: bool) -> str:
    if value is None:
        return ""
    if inline:
        return f'<c r="{ref}" t="inlineStr"><is><t>{value}</t></is></c>'
    return f'<c r="{ref}"><v>{value}</v></c>'


def _write_minimal_xlsx(path: Path, header: list[str], rows: list[list[str | None]]) -> None:
    """Builds a bare xlsx (just xl/worksheets/sheet1.xml, inline strings) for testing.

    Numeric-looking values (float-parseable) are written as numeric cells (no t=);
    everything else as inlineStr, matching how a real sheet mixes cell types per-column.
    """
    body = [_XLSX_HEADER]
    col_letters = [chr(ord("A") + i) for i in range(len(header))]

    def row_xml(r: int, values: list[str | None]) -> str:
        cells = []
        for col, val in zip(col_letters, values):
            if val is None:
                continue
            is_numeric = False
            try:
                float(val)
                is_numeric = True
            except ValueError:
                pass
            cells.append(_cell(f"{col}{r}", val, inline=not is_numeric))
        return f'<row r="{r}">{"".join(cells)}</row>'

    body.append(row_xml(1, list(header)))
    for i, row in enumerate(rows, start=2):
        body.append(row_xml(i, row))
    body.append(_XLSX_FOOTER)

    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", "".join(body))


def test_reads_header_and_data_rows(tmp_path: Path) -> None:
    xlsx = tmp_path / "fy2026.xlsx"
    _write_minimal_xlsx(
        xlsx,
        header=["CASE_NUMBER", "CASE_STATUS", "EMPLOYER_NAME", "EMPLOYER_FEIN", "TOTAL_WORKER_POSITIONS"],
        rows=[
            ["I-200-1", "Certified", "Leidos, Inc.", "95-3630868", "1"],
            ["I-200-2", "Certified - Withdrawn", "Acme LLC", None, "3"],
        ],
    )

    rows = list(iter_raw_rows(xlsx))
    assert len(rows) == 2
    assert rows[0]["CASE_NUMBER"] == "I-200-1"
    assert rows[0]["EMPLOYER_FEIN"] == "95-3630868"
    assert rows[1]["EMPLOYER_FEIN"] is None


def test_normalize_row_maps_canonical_fields_and_coerces_types(tmp_path: Path) -> None:
    xlsx = tmp_path / "fy2026.xlsx"
    _write_minimal_xlsx(
        xlsx,
        header=[
            "CASE_NUMBER",
            "CASE_STATUS",
            "EMPLOYER_NAME",
            "EMPLOYER_FEIN",
            "RECEIVED_DATE",
            "TOTAL_WORKER_POSITIONS",
            "WAGE_RATE_OF_PAY_FROM",
        ],
        rows=[
            ["I-200-1", "Certified  -  Withdrawn", "Leidos, Inc.", "95-3630868", "46105", "1", "139000"],
        ],
    )

    raw_row = next(iter_raw_rows(xlsx))
    record = normalize_row(raw_row, fiscal_year=2026, source_file="fy2026.xlsx")

    assert record.case_number == "I-200-1"
    assert record.case_status == "Certified - Withdrawn"  # whitespace collapsed
    assert record.employer_name == "Leidos, Inc."
    assert record.employer_fein == "95-3630868"
    assert record.received_date == date(2026, 3, 24)  # excel serial 46105
    assert record.total_worker_positions == 1
    assert record.wage_from == 139000.0
    assert record.fiscal_year == 2026
    assert record.source_file == "fy2026.xlsx"


def test_normalize_row_handles_missing_fein_and_unrecognized_header(tmp_path: Path) -> None:
    xlsx = tmp_path / "fy2019.xlsx"
    # An older/renamed layout: no EMPLOYER_FEIN column at all, plus an unrelated extra
    # column that shouldn't break anything.
    _write_minimal_xlsx(
        xlsx,
        header=["CASE_NUMBER", "CASE_STATUS", "EMPLOYER_NAME", "SOME_FUTURE_COLUMN"],
        rows=[["I-100-1", "Denied", "Old Employer Inc", "whatever"]],
    )

    raw_row = next(iter_raw_rows(xlsx))
    record = normalize_row(raw_row, fiscal_year=2019, source_file="fy2019.xlsx")

    assert record.employer_fein is None
    assert record.case_status == "Denied"
    assert record.employer_name == "Old Employer Inc"


def test_header_driven_mapping_survives_column_reordering(tmp_path: Path) -> None:
    """The real FY2026 file has EMPLOYER_FEIN between EMPLOYER_PHONE_EXT and NAICS_CODE;
    a different FY could reorder columns entirely. Mapping is by header text, not position."""
    xlsx = tmp_path / "reordered.xlsx"
    _write_minimal_xlsx(
        xlsx,
        header=["EMPLOYER_FEIN", "EMPLOYER_NAME", "CASE_NUMBER"],
        rows=[["11-1111111", "Reordered Co", "I-200-9"]],
    )

    raw_row = next(iter_raw_rows(xlsx))
    record = normalize_row(raw_row, fiscal_year=2026, source_file="reordered.xlsx")

    assert record.case_number == "I-200-9"
    assert record.employer_name == "Reordered Co"
    assert record.employer_fein == "11-1111111"
