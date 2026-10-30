"""Unit tests for the pure rule core of the CareLoop detection engine.

Plain pytest, no database, no server.
"""

import pytest

from engine.config import (
    DUPLICATE_DEFINITE_HOURS,
    DUPLICATE_POSSIBLE_DAYS,
    RISK_DIVISOR,
    SEVERITY_RANK,
    WEIGHT_CONFLICT,
    WEIGHT_DUPLICATE,
    WEIGHT_MISSED,
    WEIGHT_OVERDUE,
)
from engine.rules import (
    classify_duplicate,
    find_conflicts,
    resolve_alerts,
    risk_score,
)


# ---------------------------------------------------------------------------
# Tests for find_conflicts
# ---------------------------------------------------------------------------


def test_find_conflicts_overlap_true():
    """Overlap true: new event partially overlaps with existing event."""
    new_event = {
        "event_id": "ev-new",
        "patient_id": "p-101",
        "type": "procedure",
        "title": "Ultrasound Scan",
        "start_time": "2026-10-28T09:10:00Z",
        "end_time": "2026-10-28T09:40:00Z",
        "status": "scheduled",
    }
    existing_events = [
        {
            "event_id": "ev-501",
            "patient_id": "p-101",
            "type": "lab_order",
            "title": "Comprehensive Metabolic Panel",
            "start_time": "2026-10-28T09:00:00Z",
            "end_time": "2026-10-28T09:30:00Z",
            "status": "scheduled",
        }
    ]
    conflicts = find_conflicts(new_event, existing_events)
    assert len(conflicts) == 1
    assert conflicts[0]["event_id"] == "ev-501"


def test_find_conflicts_overlap_false():
    """Overlap false: new event is completely disjoint from existing events."""
    new_event = {
        "event_id": "ev-new",
        "patient_id": "p-101",
        "type": "encounter",
        "title": "Doctor Visit",
        "start_time": "2026-10-28T11:00:00Z",
        "end_time": "2026-10-28T11:30:00Z",
        "status": "scheduled",
    }
    existing_events = [
        {
            "event_id": "ev-501",
            "patient_id": "p-101",
            "type": "lab_order",
            "title": "Comprehensive Metabolic Panel",
            "start_time": "2026-10-28T09:00:00Z",
            "end_time": "2026-10-28T09:30:00Z",
            "status": "scheduled",
        }
    ]
    conflicts = find_conflicts(new_event, existing_events)
    assert conflicts == []


def test_find_conflicts_touching_boundary_is_not_overlap():
    """Touching boundary (end == start) is strictly NOT an overlap."""
    # Case A: new ends exactly when existing starts
    new_event = {
        "event_id": "ev-new",
        "patient_id": "p-101",
        "type": "procedure",
        "title": "Quick Check",
        "start_time": "2026-10-28T08:30:00Z",
        "end_time": "2026-10-28T09:00:00Z",
        "status": "scheduled",
    }
    existing_events = [
        {
            "event_id": "ev-501",
            "patient_id": "p-101",
            "type": "lab_order",
            "title": "Comprehensive Metabolic Panel",
            "start_time": "2026-10-28T09:00:00Z",
            "end_time": "2026-10-28T09:30:00Z",
            "status": "scheduled",
        }
    ]
    assert find_conflicts(new_event, existing_events) == []

    # Case B: new starts exactly when existing ends
    new_event_after = {
        "event_id": "ev-new-2",
        "patient_id": "p-101",
        "type": "procedure",
        "title": "Followup Check",
        "start_time": "2026-10-28T09:30:00Z",
        "end_time": "2026-10-28T10:00:00Z",
        "status": "scheduled",
    }
    assert find_conflicts(new_event_after, existing_events) == []


def test_find_conflicts_cancelled_events_ignored():
    """Cancelled events are ignored both as candidate blockers and as new events."""
    new_event = {
        "event_id": "ev-new",
        "patient_id": "p-101",
        "type": "procedure",
        "title": "Ultrasound Scan",
        "start_time": "2026-10-28T09:10:00Z",
        "end_time": "2026-10-28T09:40:00Z",
        "status": "scheduled",
    }
    existing_events = [
        {
            "event_id": "ev-501",
            "patient_id": "p-101",
            "type": "lab_order",
            "title": "Cancelled Lab",
            "start_time": "2026-10-28T09:00:00Z",
            "end_time": "2026-10-28T09:30:00Z",
            "status": "cancelled",
        }
    ]
    # Existing cancelled event ignored
    assert find_conflicts(new_event, existing_events) == []

    # New cancelled event ignored
    new_event_cancelled = dict(new_event, status="cancelled")
    existing_events_active = [dict(existing_events[0], status="scheduled")]
    assert find_conflicts(new_event_cancelled, existing_events_active) == []


def test_find_conflicts_ignores_self():
    """An event must not conflict with itself even if present in existing_events."""
    event = {
        "event_id": "ev-501",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "Comprehensive Metabolic Panel",
        "start_time": "2026-10-28T09:00:00Z",
        "end_time": "2026-10-28T09:30:00Z",
        "status": "scheduled",
    }
    assert find_conflicts(event, [event]) == []


# ---------------------------------------------------------------------------
# Tests for classify_duplicate
# ---------------------------------------------------------------------------


def test_classify_duplicate_exact_72h_boundary():
    """Exact 72h boundary without result is Definite/med; 72h + 1s is Possible/low."""
    existing_event = {
        "event_id": "ev-503",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Blood Test",
        "test_type": "HbA1c",
        "start_time": "2026-10-25T10:00:00Z",
        "end_time": "2026-10-25T10:30:00Z",
        "status": "scheduled",
        "has_result": False,
    }

    # Exactly 72 hours later
    new_event_exact_72h = {
        "event_id": "ev-992",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T10:00:00Z",
        "end_time": "2026-10-28T10:30:00Z",
        "status": "scheduled",
    }
    result_exact = classify_duplicate(new_event_exact_72h, [existing_event])
    assert result_exact is not None
    assert result_exact["confidence"] == "Definite"
    assert result_exact["severity"] == "med"
    assert result_exact["matched_event_id"] == "ev-503"
    assert result_exact["reason"] == "Duplicate HbA1c lab order within 72 hours, no result yet."

    # 72 hours + 1 second later -> beyond 72h boundary, within 7 days -> Possible/low
    new_event_past_72h = {
        "event_id": "ev-993",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T10:00:01Z",
        "end_time": "2026-10-28T10:30:00Z",
        "status": "scheduled",
    }
    result_past = classify_duplicate(new_event_past_72h, [existing_event])
    assert result_past is not None
    assert result_past["confidence"] == "Possible"
    assert result_past["severity"] == "low"
    assert result_past["matched_event_id"] == "ev-503"
    assert result_past["reason"] == "Possible duplicate HbA1c lab order within 7 days of an earlier order."


def test_classify_duplicate_gap_between_72h_and_7d_no_result():
    """Gap between 72h and 7d with no result is classified as Possible/low."""
    existing_event = {
        "event_id": "ev-503",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Blood Test",
        "test_type": "HbA1c",
        "start_time": "2026-10-24T10:00:00Z",  # 4 days (96 hours) prior
        "end_time": "2026-10-24T10:30:00Z",
        "status": "scheduled",
        "has_result": False,
    }
    new_event = {
        "event_id": "ev-992",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T10:00:00Z",
        "end_time": "2026-10-28T10:30:00Z",
        "status": "scheduled",
    }
    result = classify_duplicate(new_event, [existing_event])
    assert result is not None
    assert result["confidence"] == "Possible"
    assert result["severity"] == "low"
    assert result["matched_event_id"] == "ev-503"
    assert result["reason"] == "Possible duplicate HbA1c lab order within 7 days of an earlier order."


def test_classify_duplicate_has_result_yields_possible():
    """Existing order with has_result=True yields Possible/low even when within 72h."""
    existing_event = {
        "event_id": "ev-503",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Blood Test",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T08:00:00Z",  # 2 hours prior
        "end_time": "2026-10-28T08:30:00Z",
        "status": "completed",
        "has_result": True,
    }
    new_event = {
        "event_id": "ev-992",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T10:00:00Z",
        "end_time": "2026-10-28T10:30:00Z",
        "status": "scheduled",
    }
    result = classify_duplicate(new_event, [existing_event])
    assert result is not None
    assert result["confidence"] == "Possible"
    assert result["severity"] == "low"
    assert result["matched_event_id"] == "ev-503"
    assert result["reason"] == "Possible duplicate HbA1c lab order: an earlier order already has a result."


def test_classify_duplicate_masking_case():
    """Masking case: existing A at +24h with a result, existing B at +48h without.

    New at 0 must be Definite matched to B (evaluating all candidates rather
    than choosing the nearest A first).
    """
    new_event = {
        "event_id": "ev-new",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Test",
        "test_type": "HbA1c",
        "start_time": "2026-10-20T00:00:00Z",
        "end_time": "2026-10-20T00:30:00Z",
        "status": "scheduled",
    }
    existing_a = {
        "event_id": "ev-A",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Completed Order",
        "test_type": "HbA1c",
        "start_time": "2026-10-21T00:00:00Z",  # +24h
        "end_time": "2026-10-21T00:30:00Z",
        "status": "completed",
        "has_result": True,
    }
    existing_b = {
        "event_id": "ev-B",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Pending Order",
        "test_type": "HbA1c",
        "start_time": "2026-10-22T00:00:00Z",  # +48h
        "end_time": "2026-10-22T00:30:00Z",
        "status": "scheduled",
        "has_result": False,
    }

    result = classify_duplicate(new_event, [existing_a, existing_b])
    assert result is not None
    assert result["confidence"] == "Definite"
    assert result["severity"] == "med"
    assert result["matched_event_id"] == "ev-B"
    assert result["reason"] == "Duplicate HbA1c lab order within 72 hours, no result yet."


def test_classify_duplicate_earlier_than_existing_order_still_flags():
    """A duplicate earlier than the existing order still flags using absolute gap."""
    existing_event = {
        "event_id": "ev-exist",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Afternoon Order",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T14:00:00Z",
        "end_time": "2026-10-28T14:30:00Z",
        "status": "scheduled",
        "has_result": False,
    }
    new_event_earlier = {
        "event_id": "ev-new",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Morning Order",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T10:00:00Z",  # 4 hours earlier
        "end_time": "2026-10-28T10:30:00Z",
        "status": "scheduled",
    }
    result = classify_duplicate(new_event_earlier, [existing_event])
    assert result is not None
    assert result["confidence"] == "Definite"
    assert result["severity"] == "med"
    assert result["matched_event_id"] == "ev-exist"


def test_classify_duplicate_cancelled_and_self_ignored():
    """Cancelled events, self, and non-duplicate cases are ignored."""
    existing_cancelled = {
        "event_id": "ev-cancelled",
        "patient_id": "p-101",
        "type": "lab_order",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T09:00:00Z",
        "end_time": "2026-10-28T09:30:00Z",
        "status": "cancelled",
        "has_result": False,
    }
    new_event = {
        "event_id": "ev-new",
        "patient_id": "p-101",
        "type": "lab_order",
        "test_type": "HbA1c",
        "start_time": "2026-10-28T10:00:00Z",
        "end_time": "2026-10-28T10:30:00Z",
        "status": "scheduled",
    }
    # Cancelled existing event ignored
    assert classify_duplicate(new_event, [existing_cancelled]) is None

    # Cancelled new event returns None
    assert classify_duplicate(dict(new_event, status="cancelled"), [dict(existing_cancelled, status="scheduled")]) is None

    # Event itself ignored
    assert classify_duplicate(new_event, [new_event]) is None

    # Beyond 7 days returns None
    far_event = dict(existing_cancelled, status="scheduled", start_time="2026-10-15T00:00:00Z")
    assert classify_duplicate(new_event, [far_event]) is None

    # Different test_type returns None
    cmp_event = dict(existing_cancelled, status="scheduled", test_type="CMP")
    assert classify_duplicate(new_event, [cmp_event]) is None

    # Missing test_type returns None
    no_tt = dict(new_event, test_type=None)
    assert classify_duplicate(no_tt, [dict(existing_cancelled, status="scheduled")]) is None


# ---------------------------------------------------------------------------
# Tests for resolve_alerts
# ---------------------------------------------------------------------------


def test_resolve_alerts_higher_severity_wins():
    """For alerts on the same event, keep the alert with higher severity."""
    alerts = [
        {
            "id": "alt-1",
            "event_id": "ev-501",
            "type": "duplicate",
            "severity": "low",
            "detected_at": "2026-10-28T10:00:00Z",
        },
        {
            "id": "alt-2",
            "event_id": "ev-501",
            "type": "conflict",
            "severity": "high",
            "detected_at": "2026-10-28T10:05:00Z",
        },
    ]
    resolved = resolve_alerts(alerts)
    assert len(resolved) == 1
    assert resolved[0]["id"] == "alt-2"
    assert resolved[0]["severity"] == "high"


def test_resolve_alerts_tie_keeps_earliest_detected():
    """When alerts on the same event have equal severity, keep the earliest detected."""
    alerts = [
        {
            "id": "alt-first",
            "event_id": "ev-501",
            "type": "duplicate",
            "severity": "med",
            "detected_at": "2026-10-28T10:00:00Z",
        },
        {
            "id": "alt-later",
            "event_id": "ev-501",
            "type": "missing_step",
            "severity": "med",
            "detected_at": "2026-10-28T10:15:00Z",
        },
    ]
    resolved = resolve_alerts(alerts)
    assert len(resolved) == 1
    assert resolved[0]["id"] == "alt-first"

    # Test order independence: later alert appears first in list, but earliest detected wins
    resolved_reversed = resolve_alerts([alerts[1], alerts[0]])
    assert len(resolved_reversed) == 1
    assert resolved_reversed[0]["id"] == "alt-first"


def test_resolve_alerts_different_events_pass_through():
    """Alerts on different events pass through unchanged."""
    alerts = [
        {
            "id": "alt-1",
            "event_id": "ev-501",
            "type": "conflict",
            "severity": "high",
            "detected_at": "2026-10-28T10:00:00Z",
        },
        {
            "id": "alt-2",
            "event_id": "ev-502",
            "type": "duplicate",
            "severity": "med",
            "detected_at": "2026-10-28T10:05:00Z",
        },
    ]
    resolved = resolve_alerts(alerts)
    assert resolved == alerts


# ---------------------------------------------------------------------------
# Tests for risk_score
# ---------------------------------------------------------------------------


def test_risk_score_matches_contract_for_p101():
    """p-101 numbers: 1 conflict and 1 duplicate = 0.4."""
    assert risk_score(conflicts=1, duplicates=1) == 0.4


def test_risk_score_caps_at_one():
    """Risk score caps at 1.0."""
    assert risk_score(conflicts=5, duplicates=5) == 1.0
    assert risk_score(conflicts=10, duplicates=10, overdue=10, missed=10) == 1.0


def test_risk_score_formula_and_zero():
    """Risk score handles zero and all component weights accurately."""
    assert risk_score(0, 0) == 0.0
    # overdue=1 (1.5), missed=1 (2) -> 3.5 / 10 = 0.35
    assert risk_score(conflicts=0, duplicates=0, overdue=1, missed=1) == 0.35
    # conflicts=1 (3), overdue=1 (1.5), missed=1 (2) -> 6.5 / 10 = 0.65
    assert risk_score(conflicts=1, duplicates=0, overdue=1, missed=1) == 0.65
    # supports alternate keyword arguments
    assert risk_score(conflicts=1, duplicates=1, overdue_steps=1, missed_appointments=1) == 0.75
