"""Tests for the engine service layer and differential tests against api.fallback.

Uses api.fallback on a temporary SQLite database as the oracle and compares
against engine.service operating on data.store's demo seed.
"""

import os
import sqlite3
import tempfile
import pytest

from api import fallback
from data.db import get_connection
from data.seed import reset_demo_data
from data.store import add_event
from engine import service


@pytest.fixture(autouse=True)
def setup_databases():
    """Configure fallback on a temporary database and reset data.store demo seed."""
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db")
    os.close(tmp_fd)

    fb_db = sqlite3.connect(tmp_path, check_same_thread=False, isolation_level=None)
    fb_db.row_factory = sqlite3.Row
    original_fb_db = fallback._db
    fallback._db = fb_db
    fallback.reset_db()

    reset_demo_data()

    yield

    fb_db.close()
    fallback._db = original_fb_db
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    reset_demo_data()


# ---------------------------------------------------------------------------
# Differential tests: api.fallback vs engine.service
# ---------------------------------------------------------------------------


def test_differential_plain_conflict_p101():
    """Scenario 1: Plain conflict on p-101 (Ultrasound Scan overlapping with ev-501 CMP)."""
    ev_conflict = {
        "event_id": "ev-991",
        "patient_id": "p-101",
        "type": "procedure",
        "title": "Ultrasound Scan",
        "start_time": "2026-10-28T09:10:00Z",
        "end_time": "2026-10-28T09:40:00Z",
        "status": "scheduled",
    }
    fb_alert = fallback.detect_conflicts("p-101", ev_conflict)
    svc_alert = service.detect_conflicts("p-101", ev_conflict)

    assert fb_alert is not None
    assert svc_alert is not None
    assert fb_alert == svc_alert
    assert svc_alert["type"] == "conflict"
    assert svc_alert["severity"] == "high"
    assert svc_alert["confidence"] == "Definite"
    assert svc_alert["related_event_id"] == "ev-501"


def test_differential_definite_duplicate_p101():
    """Scenario 2: Definite duplicate on p-101 (HbA1c repeat within 72h of ev-503, no result)."""
    ev_duplicate = {
        "event_id": "ev-992",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-29T11:00:00Z",
        "end_time": "2026-10-29T11:30:00Z",
        "status": "scheduled",
    }
    fb_alert = fallback.detect_duplicates("p-101", ev_duplicate)
    svc_alert = service.detect_duplicates("p-101", ev_duplicate)

    assert fb_alert is not None
    assert svc_alert is not None
    assert fb_alert == svc_alert
    assert svc_alert["type"] == "duplicate"
    assert svc_alert["severity"] == "med"
    assert svc_alert["confidence"] == "Definite"
    assert svc_alert["related_event_id"] == "ev-503"


def test_differential_possible_duplicate_earlier_has_result():
    """Scenario 3: Possible duplicate on p-101 where earlier order already has a result."""
    # Update ev-503 to has_result=1 in both fallback and store databases
    fallback._db.execute("UPDATE api_events SET has_result = 1 WHERE event_id = 'ev-503'")
    conn = get_connection()
    conn.execute("UPDATE events SET has_result = 1 WHERE event_id = 'ev-503'")
    conn.commit()
    conn.close()

    ev_duplicate = {
        "event_id": "ev-993",
        "patient_id": "p-101",
        "type": "lab_order",
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-29T11:00:00Z",
        "end_time": "2026-10-29T11:30:00Z",
        "status": "scheduled",
    }
    fb_alert = fallback.detect_duplicates("p-101", ev_duplicate)
    svc_alert = service.detect_duplicates("p-101", ev_duplicate)

    assert fb_alert is not None
    assert svc_alert is not None
    assert fb_alert == svc_alert
    assert svc_alert["type"] == "duplicate"
    assert svc_alert["severity"] == "low"
    assert svc_alert["confidence"] == "Possible"
    assert svc_alert["reason"] == "Possible duplicate HbA1c lab order: an earlier order already has a result."


def test_differential_clean_event_p102():
    """Scenario 4: Clean event on p-102 (no conflict and no duplicate)."""
    ev_clean = {
        "event_id": "ev-994",
        "patient_id": "p-102",
        "type": "procedure",
        "title": "Clean Screening Procedure",
        "start_time": "2026-10-29T14:00:00Z",
        "end_time": "2026-10-29T14:30:00Z",
        "status": "scheduled",
    }
    assert fallback.detect_conflicts("p-102", ev_clean) is None
    assert service.detect_conflicts("p-102", ev_clean) is None
    assert fallback.detect_duplicates("p-102", ev_clean) is None
    assert service.detect_duplicates("p-102", ev_clean) is None


# ---------------------------------------------------------------------------
# Unit tests for plan_item and build_corrected_plan
# ---------------------------------------------------------------------------


def test_plan_item_conflict():
    """plan_item generates reschedule adjustment matching fallback."""
    fb_ev = fallback.add_event("p-101", "procedure", "Ultrasound Scan", None, "2026-10-28T09:10:00Z", "2026-10-28T09:40:00Z")
    st_ev = add_event("p-101", "procedure", "Ultrasound Scan", "2026-10-28T09:10:00Z", "2026-10-28T09:40:00Z")
    assert fb_ev["event_id"] == st_ev["event_id"]

    alert = {
        "id": "alt-881",
        "patient_id": "p-101",
        "type": "conflict",
        "confidence": "Definite",
        "severity": "high",
        "reason": "Ultrasound Scan overlaps with scheduled Comprehensive Metabolic Panel.",
        "event_id": st_ev["event_id"],
        "related_event_id": "ev-501",
    }
    fb_item = fallback.plan_item(alert)
    svc_item = service.plan_item(alert)

    assert fb_item is not None
    assert svc_item is not None
    assert fb_item == svc_item
    assert svc_item["action"] == "reschedule"
    assert svc_item["original_start"] == "2026-10-28T09:10:00Z"
    assert svc_item["proposed_start"] == "2026-10-28T09:30:00Z"
    assert svc_item["proposed_end"] == "2026-10-28T10:00:00Z"


def test_plan_item_duplicate():
    """plan_item generates cancel_duplicate adjustment matching fallback."""
    fb_ev = fallback.add_event("p-101", "lab_order", "HbA1c Test Repeat", "HbA1c", "2026-10-29T11:00:00Z", "2026-10-29T11:30:00Z")
    st_ev = add_event("p-101", "lab_order", "HbA1c Test Repeat", "2026-10-29T11:00:00Z", "2026-10-29T11:30:00Z", test_type="HbA1c")
    assert fb_ev["event_id"] == st_ev["event_id"]

    alert = {
        "id": "alt-882",
        "patient_id": "p-101",
        "type": "duplicate",
        "confidence": "Definite",
        "severity": "med",
        "reason": "Duplicate HbA1c lab order within 72 hours, no result yet.",
        "event_id": st_ev["event_id"],
        "related_event_id": "ev-503",
    }
    fb_item = fallback.plan_item(alert)
    svc_item = service.plan_item(alert)

    assert fb_item is not None
    assert svc_item is not None
    assert fb_item == svc_item
    assert svc_item["action"] == "cancel_duplicate"
    assert svc_item["proposed_start"] is None
    assert svc_item["proposed_end"] is None


def test_plan_item_unsupported_type_or_missing_event():
    """plan_item returns None for unknown event or unsupported alert type."""
    assert service.plan_item({"event_id": "ev-nonexistent", "type": "conflict"}) is None
    assert service.plan_item({"type": "conflict"}) is None
    assert service.plan_item({"event_id": "ev-501", "type": "missing_step"}) is None


def test_build_corrected_plan_empty_on_clean_seed():
    """build_corrected_plan returns empty adjustments when no pending alerts exist."""
    plan = service.build_corrected_plan("p-101")
    assert plan == {
        "patient_id": "p-101",
        "resolves_alert_ids": [],
        "adjustments": [],
    }
