from data.seed import reset_demo_data
from data.store import (add_alert, add_audit, add_event, cancel_event,
                        get_alerts, get_audit, get_event, get_patients,
                        reschedule_event, set_alert_status)


def setup_function():
    reset_demo_data()


def teardown_function():
    reset_demo_data()


def test_reschedule_event():
    e = add_event("p-101", "procedure", "Ultrasound Scan",
                  "2026-10-28T09:10:00Z", "2026-10-28T09:40:00Z")
    out = reschedule_event(e["event_id"], "2026-10-28T09:30:00Z",
                           "2026-10-28T10:00:00Z")
    assert out["start_time"] == "2026-10-28T09:30:00Z"
    assert out["end_time"] == "2026-10-28T10:00:00Z"
    assert reschedule_event("ev-000", "x", "y") is None


def test_cancel_event():
    e = add_event("p-101", "lab_order", "HbA1c Test Repeat",
                  "2026-10-29T11:00:00Z", "2026-10-29T11:30:00Z",
                  test_type="HbA1c")
    assert cancel_event(e["event_id"])["status"] == "cancelled"
    assert get_event("ev-503")["status"] == "scheduled"  # earlier order stays
    assert cancel_event("ev-000") is None


def test_alert_ids_filters_and_status():
    a = add_alert("p-101", "conflict", "Definite", "high", "overlap")
    b = add_alert("p-101", "duplicate", "Definite", "med", "dup")
    assert (a["id"], b["id"]) == ("alt-881", "alt-882")
    assert len(get_alerts(patient_id="p-101", status="pending")) == 2
    assert get_alerts(patient_id="p-102") == []
    assert set_alert_status("alt-881", "resolved")["status"] == "resolved"
    assert len(get_alerts(status="pending")) == 1
    assert set_alert_status("alt-000", "resolved") is None


def test_alert_ids_restart_after_reset():
    add_alert("p-101", "conflict", "Definite", "high", "overlap")
    reset_demo_data()
    assert add_alert("p-101", "conflict", "Definite", "high", "x")["id"] == "alt-881"


def test_audit_newest_first_and_ids():
    a = add_audit("alt-881", "p-101", "plan_correction_accepted", "staff-04",
                  "d1", "p1", "n1", timestamp="2026-10-28T10:45:00Z")
    b = add_audit("alt-882", "p-101", "cancel_duplicate_accepted", "staff-02",
                  "d2", "p2", "n2", timestamp="2026-10-28T11:00:00Z")
    assert (a["id"], b["id"]) == ("aud-1042", "aud-1043")
    assert [x["id"] for x in get_audit("p-101")] == ["aud-1043", "aud-1042"]
    assert get_audit("p-102") == []


def test_accepting_resolves_risk():
    add_alert("p-101", "conflict", "Definite", "high", "overlap")
    p = next(x for x in get_patients() if x["id"] == "p-101")
    assert p["risk_score"] == 0.3
    set_alert_status("alt-881", "resolved")
    p = next(x for x in get_patients() if x["id"] == "p-101")
    assert p["risk_score"] == 0.0