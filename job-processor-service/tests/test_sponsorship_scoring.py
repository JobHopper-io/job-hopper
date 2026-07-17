from __future__ import annotations

from job_processor.sponsorship_scoring import (
    build_rationale,
    confidence_bucket,
    score_bucket,
)


def test_score_bucket_boundaries() -> None:
    assert score_bucket(0) == "Low"
    assert score_bucket(99) == "Low"
    assert score_bucket(100) == "Medium"
    assert score_bucket(192) == "Medium"
    assert score_bucket(193) == "High"
    assert score_bucket(73_890) == "High"


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
