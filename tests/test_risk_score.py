from data.db import get_connection
from data.seed import reset_demo_data
from data.store import get_patients, risk_score


def setup_function():
    reset_demo_data()


def teardown_function():
    reset_demo_data()


def _add_alert(alert_id, patient_id, type_, severity, status="pending"):
    conn = get_connection()
    conn.execute(
        "INSERT INTO alerts (id, patient_id, type, confidence, severity, reason, status, detected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (alert_id, patient_id, type_, "Definite", severity,
         "test reason", status, "2026-10-28T10:30:00Z"),
    )
    conn.commit()
    conn.close()


def test_formula_matches_contract_example():
    assert risk_score(conflicts=1, duplicates=1) == 0.4


def test_score_is_capped_at_one():
    assert risk_score(conflicts=5, duplicates=5) == 1.0


def test_p101_with_conflict_and_duplicate_scores_0_4():
    _add_alert("alt-881", "p-101", "conflict", "high")
    _add_alert("alt-882", "p-101", "duplicate", "med")
    ps = get_patients()
    p101 = next(p for p in ps if p["id"] == "p-101")
    assert p101["risk_score"] == 0.4
    assert p101["active_alerts_count"] == 2
    assert ps[0]["id"] == "p-101"  # highest risk comes first


def test_resolved_alerts_do_not_count():
    _add_alert("alt-881", "p-101", "conflict", "high", status="resolved")
    p101 = next(p for p in get_patients() if p["id"] == "p-101")
    assert p101["risk_score"] == 0.0
    assert p101["active_alerts_count"] == 0


def test_control_patient_stays_zero():
    _add_alert("alt-881", "p-101", "conflict", "high")
    p102 = next(p for p in get_patients() if p["id"] == "p-102")
    assert p102["risk_score"] == 0.0