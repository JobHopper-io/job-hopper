from __future__ import annotations

from job_processor.sponsorship_scoring import (
    build_rationale,
    capped_by_filing_floor,
    confidence_bucket,
    score_bucket,
)


def test_score_bucket_boundaries() -> None:
    # counted_filing_count comfortably clears MIN_CERTIFIED_FILINGS_FOR_HIGH here - this test is
    # about the position tertile boundaries, not the filing-count floor (see the dedicated test
    # below for that).
    assert score_bucket(0, 10) == "Low"
    assert score_bucket(99, 10) == "Low"
    assert score_bucket(100, 10) == "Medium"
    assert score_bucket(192, 10) == "Medium"
    assert score_bucket(193, 10) == "High"
    assert score_bucket(73_890, 10) == "High"


def test_score_bucket_high_requires_minimum_certified_filings() -> None:
    # D56-60: a single mega-filing (e.g. the real "Tavaro" case - 400 positions in one filing)
    # must not reach High on position volume alone. Capped at Medium, not Low - the position
    # volume is still real signal, just not enough independent filings to back a High claim.
    assert score_bucket(400, 1) == "Medium"
    assert score_bucket(400, 2) == "Medium"
    assert score_bucket(400, 3) == "High"
    assert score_bucket(73_890, 0) == "Medium"


def test_capped_by_filing_floor() -> None:
    # Mirrors test_score_bucket_high_requires_minimum_certified_filings' cases - this is the
    # signal build_rationale uses to decide whether to explain the cap in plain language.
    assert capped_by_filing_floor(400, 1) is True
    assert capped_by_filing_floor(400, 2) is True
    assert capped_by_filing_floor(400, 3) is False  # meets the floor, not capped
    assert capped_by_filing_floor(192, 1) is False  # Medium by position tertile alone, no cap involved
    assert capped_by_filing_floor(0, 0) is False


def test_confidence_bucket_boundaries() -> None:
    assert confidence_bucket(0.0) == "Low"
    assert confidence_bucket(0.499) == "Low"
    assert confidence_bucket(0.5) == "Medium"
    assert confidence_bucket(0.799) == "Medium"
    assert confidence_bucket(0.8) == "High"
    assert confidence_bucket(1.0) == "High"


def test_rationale_states_filing_intent_not_approval_outcome() -> None:
    text = build_rationale(
        counted_filing_count=138,
        counted_positions=140,
        total_filing_count=138,
        fiscal_years=[2026],
        recency_share=0.929,
        confidence="High",
    )
    assert "138 certified LCA filings in FY2026" in text
    assert "140 sponsored positions" in text
    assert "not H-1B petition approval outcomes" in text
    assert "93%" in text
    assert "High confidence" in text


def test_rationale_mentions_excluded_filings_when_status_filtered_out() -> None:
    text = build_rationale(
        counted_filing_count=90,
        counted_positions=100,
        total_filing_count=100,
        fiscal_years=[2026],
        recency_share=0.6,
        confidence="Medium",
    )
    assert "10 additional filings were withdrawn or denied" in text


def test_rationale_omits_exclusion_note_when_nothing_was_filtered() -> None:
    text = build_rationale(
        counted_filing_count=50,
        counted_positions=60,
        total_filing_count=50,
        fiscal_years=[2026],
        recency_share=1.0,
        confidence="High",
    )
    assert "withdrawn or denied" not in text


def test_rationale_explains_the_cap_when_capped_by_filing_floor() -> None:
    # The Tavaro shape: 400 positions from a single filing - would read High-by-volume with no
    # explanation otherwise. Real values from the live Tavaro row (D56-60).
    text = build_rationale(
        counted_filing_count=1,
        counted_positions=400,
        total_filing_count=3,
        fiscal_years=[2026],
        recency_share=1.0,
        confidence="High",
        capped_by_filing_floor=True,
    )
    assert "1 certified LCA filings in FY2026" in text
    assert "400 sponsored positions" in text
    assert "limited filing history" in text
    assert "fewer than 3 certified filings" in text


def test_rationale_omits_cap_note_when_not_capped() -> None:
    text = build_rationale(
        counted_filing_count=138,
        counted_positions=140,
        total_filing_count=138,
        fiscal_years=[2026],
        recency_share=0.929,
        confidence="High",
        capped_by_filing_floor=False,
    )
    assert "limited filing history" not in text


def test_rationale_zero_positions_is_still_honest() -> None:
    text = build_rationale(
        counted_filing_count=0,
        counted_positions=0,
        total_filing_count=7,
        fiscal_years=[2026],
        recency_share=0.2,
        confidence="Low",
    )
    assert "0 certified LCA filings" in text
    assert "0 sponsored positions" in text
    assert "7 additional filings were withdrawn or denied" in text
