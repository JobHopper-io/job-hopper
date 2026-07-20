"""LCA-only sponsorship scoring (D41-45, §3 decision 7).

v1 is deliberately LCA-only - no USCIS input, because the LCA<->USCIS join (D38-40) is deferred
to v2 (no deterministic key bridges the two agencies). This module scores FILING INTENT ("does
this employer file a lot of LCAs, recently?"), not approval outcomes ("do their petitions get
approved?"). `rationale` says so explicitly on every row - do not let it imply otherwise.

Score (Low/Medium/High) - same scale as the existing inferSponsorshipLikelihood heuristic badge,
not a new 0-100/A-F system (no new scale to learn, and LCA-only data can't support false
precision). Computed from summed total_worker_positions across Certified + Certified-Withdrawn
lca_filings only - plain Withdrawn/Denied filings didn't result in a certified position, so they're
excluded from the sum (though they still count as filing activity for the recency signal below).
Bucketed into tertiles measured against the real 368-scored-employer distribution
(docs/sponsorship-data-engine.md D41-45 sizing pass, 2026-07-17):
    Low:    0-99      positions (bottom third)
    Medium: 100-192   positions (middle third)
    High:   193+      positions (top third)
Re-derive these from real data (don't guess round numbers) if the employer scope ever changes
materially - see the working principle in the doc.

High additionally requires >=MIN_CERTIFIED_FILINGS_FOR_HIGH certified filings (D56-60,
2026-07-20), not position volume alone. Found during validation: "Tavaro" reached High off a
single 400-position Truck Driver filing while two other same-day filings for similarly round,
atypical-for-H-1B position counts were Denied - a single filing's face-value volume doesn't match
the "broad, sustained hiring pattern" the High badge implies. Impact was measured before this was
added, not guessed: of the 123 employers that were High before this floor, exactly 1 (Tavaro)
drops out under >=3; across all 368 scored employers only 2 total have fewer than 3 certified
filings at all, so this is a narrow, targeted fix, not a broad recut of the distribution. An
employer that would be High by position volume alone but fails the floor is capped at Medium, not
Low - the position volume is still real signal, just not enough independent filings to back a
High-confidence "broad hiring pattern" claim.

Confidence (Low/Medium/High) reflects filing-data coverage/recency, NOT approval likelihood.
fiscal_year is uniformly 2026 in this scope (single-FY ingest), so there's no multi-year signal;
instead this uses the share of an employer's filings (any status - this is about activity volume,
not certified outcome) whose received_date falls within the file's own most recent
RECENCY_WINDOW_DAYS. The real distribution is heavily right-skewed (median share ~0.93): a small
tail (~3%) sits below 0.5, the bulk (~78%) sits at/above 0.8 - those are the thresholds, not
arbitrary round numbers:
    Low:    share < 0.5   (mostly-stale filing history despite scope-qualifying volume)
    Medium: 0.5 <= share < 0.8
    High:   share >= 0.8

excluded_from_scoring=true employers (§3 decision 6/7, the 6 umbrella FEINs) get NO row here -
skipped entirely, not a degraded score. A confidently-wrong score on "SUNY Stony Brook" (really
New York State + 21 campuses) is worse than no score - they fall back to the existing heuristic
badge untouched. Any pre-existing score row for a now-excluded employer is deleted, so re-running
this after an exclusion-flag change stays correct rather than leaving a stale row behind.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal, TypedDict

from job_processor.supabase_client import SupabaseRest

Bucket = Literal["Low", "Medium", "High"]

# Filings in these statuses count toward the position sum that drives `score`. Plain "Withdrawn"
# and "Denied" are real filing activity (they count toward `total_filing_count` / recency) but
# didn't result in a certified position, so they're excluded from the sum itself.
COUNTED_STATUSES = frozenset({"Certified", "Certified - Withdrawn"})

# Tertile boundaries measured against the 368 scored employers on 2026-07-17 (see module
# docstring for the exact distribution). Re-measure, don't guess, if the scope changes.
SCORE_LOW_MAX = 99
SCORE_MEDIUM_MAX = 192

# D56-60, 2026-07-20: minimum certified filings before position volume alone can reach High - see
# module docstring for the Tavaro case this catches and the measured impact (1 of 123 employers).
MIN_CERTIFIED_FILINGS_FOR_HIGH = 3

RECENCY_WINDOW_DAYS = 150  # ~5 months; matches the observed concentration in received_date
CONFIDENCE_LOW_MAX_SHARE = 0.5
CONFIDENCE_HIGH_MIN_SHARE = 0.8

ALGORITHM_VERSION = "lca_volume_recency_v1"


def score_bucket(counted_positions: int, counted_filing_count: int) -> Bucket:
    if counted_positions <= SCORE_LOW_MAX:
        return "Low"
    if counted_positions <= SCORE_MEDIUM_MAX:
        return "Medium"
    if counted_filing_count < MIN_CERTIFIED_FILINGS_FOR_HIGH:
        return "Medium"
    return "High"


def capped_by_filing_floor(counted_positions: int, counted_filing_count: int) -> bool:
    """True when position volume alone would reach High but MIN_CERTIFIED_FILINGS_FOR_HIGH caps
    the score at Medium instead (the Tavaro case, D56-60) - callers use this to make the rationale
    say so explicitly, rather than stating the raw numbers with no explanation for why the bucket
    doesn't match what the volume alone would suggest."""
    return counted_positions > SCORE_MEDIUM_MAX and counted_filing_count < MIN_CERTIFIED_FILINGS_FOR_HIGH


def confidence_bucket(recency_share: float) -> Bucket:
    if recency_share < CONFIDENCE_LOW_MAX_SHARE:
        return "Low"
    if recency_share < CONFIDENCE_HIGH_MIN_SHARE:
        return "Medium"
    return "High"


def build_rationale(
    *,
    counted_filing_count: int,
    counted_positions: int,
    total_filing_count: int,
    fiscal_years: list[int],
    recency_share: float,
    confidence: Bucket,
    capped_by_filing_floor: bool = False,
) -> str:
    fy_label = f"FY{fiscal_years[0]}" if len(fiscal_years) == 1 else f"FY{min(fiscal_years)}-FY{max(fiscal_years)}"
    parts = [
        f"{counted_filing_count} certified LCA filings in {fy_label}, covering {counted_positions} "
        f"sponsored positions.",
        "Reflects DOL filing activity only, not H-1B petition approval outcomes.",
    ]
    if total_filing_count > counted_filing_count:
        parts.insert(
            1,
            f"({total_filing_count - counted_filing_count} additional filings were withdrawn or "
            f"denied and are not counted toward the score.)",
        )
    if capped_by_filing_floor:
        parts.append(
            f"Medium (based on limited filing history — fewer than "
            f"{MIN_CERTIFIED_FILINGS_FOR_HIGH} certified filings) despite the position volume above."
        )
    parts.append(f"{recency_share:.0%} of filings are from the last {RECENCY_WINDOW_DAYS} days ({confidence} confidence).")
    return " ".join(parts)


class EmployerStats(TypedDict):
    counted_positions: int
    counted_filing_count: int
    total_filing_count: int
    recent_filing_count: int
    fiscal_years: list[int]


class ScoreComputeCounts(TypedDict, total=False):
    employers_total: int
    employers_excluded: int
    lca_rows_scanned: int
    employers_scored: int
    stale_excluded_scores_removed: int
    scores_written: int
    score_distribution: dict[str, int]
    confidence_distribution: dict[str, int]


async def _fetch_employers(db: SupabaseRest) -> tuple[dict[str, bool], list[str]]:
    """Returns ({employer_id: excluded_from_scoring}, [all employer_ids])."""
    excluded_by_id: dict[str, bool] = {}
    ids: list[str] = []
    offset, page = 0, 1000
    while True:
        rows = await db.select(
            "employers",
            select="id,excluded_from_scoring",
            params=[("order", "id"), ("limit", str(page)), ("offset", str(offset))],
        )
        if not rows:
            break
        for row in rows:
            excluded_by_id[row["id"]] = bool(row.get("excluded_from_scoring"))
            ids.append(row["id"])
        offset += len(rows)
        if len(rows) < page:
            break
    return excluded_by_id, ids


async def _scan_lca_filings(db: SupabaseRest) -> tuple[dict[str, EmployerStats], int]:
    """One full pass over lca_filings, computing everything scoring needs per employer_id.

    Two-pass would be simpler to read but doubles the ~103-page scan over 102k+ rows; the max
    received_date (needed to define the recency window) isn't known until the whole file is
    seen, so filings are buffered in memory (single FY, ~100k rows - fine) and the recency count
    applied in a second in-memory loop, not a second DB scan.
    """
    stats: dict[str, EmployerStats] = defaultdict(
        lambda: {
            "counted_positions": 0,
            "counted_filing_count": 0,
            "total_filing_count": 0,
            "recent_filing_count": 0,
            "fiscal_years": [],
        }
    )
    fiscal_years_seen: dict[str, set[int]] = defaultdict(set)
    buffered: list[dict] = []
    max_received = date.min

    offset, page = 0, 1000
    scanned = 0
    while True:
        rows = await db.select(
            "lca_filings",
            select="employer_id,total_worker_positions,case_status,received_date,fiscal_year",
            params=[("order", "id"), ("limit", str(page)), ("offset", str(offset))],
        )
        if not rows:
            break
        for row in rows:
            if not row.get("employer_id"):
                continue
            buffered.append(row)
            d = row.get("received_date")
            if d:
                parsed = date.fromisoformat(d)
                if parsed > max_received:
                    max_received = parsed
        scanned += len(rows)
        offset += len(rows)
        if len(rows) < page:
            break

    window_start = max_received - timedelta(days=RECENCY_WINDOW_DAYS)

    for row in buffered:
        eid = row["employer_id"]
        s = stats[eid]
        s["total_filing_count"] += 1
        if row.get("case_status") in COUNTED_STATUSES:
            s["counted_filing_count"] += 1
            s["counted_positions"] += row.get("total_worker_positions") or 0
        d = row.get("received_date")
        if d and date.fromisoformat(d) >= window_start:
            s["recent_filing_count"] += 1
        fy = row.get("fiscal_year")
        if fy is not None:
            fiscal_years_seen[eid].add(fy)

    for eid, years in fiscal_years_seen.items():
        stats[eid]["fiscal_years"] = sorted(years)

    return dict(stats), scanned


async def compute_and_write_scores(db: SupabaseRest, *, dry_run: bool) -> ScoreComputeCounts:
    excluded_by_id, all_ids = await _fetch_employers(db)
    stats, scanned = await _scan_lca_filings(db)

    scored_rows: list[dict] = []
    score_dist: dict[str, int] = defaultdict(int)
    conf_dist: dict[str, int] = defaultdict(int)
    now = datetime.now(tz=timezone.utc).isoformat()

    for eid in all_ids:
        if excluded_by_id.get(eid):
            continue
        s = stats.get(eid)
        if s is None:
            # Every employer was seeded from an LCA FEIN (D36), so this shouldn't happen - but
            # skip rather than crash or write a fabricated zero score if it ever does.
            continue

        recency_share = s["recent_filing_count"] / s["total_filing_count"] if s["total_filing_count"] else 0.0
        score = score_bucket(s["counted_positions"], s["counted_filing_count"])
        confidence = confidence_bucket(recency_share)
        rationale = build_rationale(
            counted_filing_count=s["counted_filing_count"],
            counted_positions=s["counted_positions"],
            total_filing_count=s["total_filing_count"],
            fiscal_years=s["fiscal_years"] or [0],
            recency_share=recency_share,
            confidence=confidence,
            capped_by_filing_floor=capped_by_filing_floor(s["counted_positions"], s["counted_filing_count"]),
        )
        score_dist[score] += 1
        conf_dist[confidence] += 1

        scored_rows.append(
            {
                "employer_id": eid,
                "score": score,
                "confidence": confidence,
                "rationale": rationale,
                "data_coverage": {
                    "v1_scope": "lca_only",
                    "counted_statuses": sorted(COUNTED_STATUSES),
                    "total_filing_count": s["total_filing_count"],
                    "counted_filing_count": s["counted_filing_count"],
                    "recency_window_days": RECENCY_WINDOW_DAYS,
                    "recency_share": round(recency_share, 4),
                },
                "fiscal_years_used": s["fiscal_years"],
                "algorithm_version": ALGORITHM_VERSION,
                "computed_at": now,
            }
        )

    excluded_ids = [eid for eid in all_ids if excluded_by_id.get(eid)]
    stale_removed = 0
    if excluded_ids:
        # Cleanup: if an employer was scored in a prior run and later flagged
        # excluded_from_scoring, its old score row must not linger.
        stale_removed = await db.count_rows(
            "employer_sponsorship_scores",
            params=[("employer_id", f"in.({','.join(excluded_ids)})")],
            select="employer_id",
        )
        if not dry_run and stale_removed:
            await db.delete_rows(
                "employer_sponsorship_scores",
                params=[("employer_id", f"in.({','.join(excluded_ids)})")],
                dry_run=False,
            )

    written = await db.upsert_rows(
        "employer_sponsorship_scores", scored_rows, on_conflict="employer_id", dry_run=dry_run
    )

    return {
        "employers_total": len(all_ids),
        "employers_excluded": len(excluded_ids),
        "lca_rows_scanned": scanned,
        "employers_scored": len(scored_rows),
        "stale_excluded_scores_removed": stale_removed,
        "scores_written": written if not dry_run else len(scored_rows),
        "score_distribution": dict(score_dist),
        "confidence_distribution": dict(conf_dist),
    }
