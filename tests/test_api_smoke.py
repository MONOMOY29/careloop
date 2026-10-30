import os
import sys

os.environ["CARELOOP_DB"] = ":memory:"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402
from api.main import app  # noqa: E402

c = TestClient(app)
CONFLICT = {"patient_id": "p-101", "anomaly_type": "conflict",
            "payload": {"title": "Ultrasound Scan", "start_time": "2026-10-28T09:10:00Z", "end_time": "2026-10-28T09:40:00Z"}}
DUP = {"patient_id": "p-101", "anomaly_type": "duplicate",
       "payload": {"title": "HbA1c Test Repeat", "test_type": "HbA1c",
                   "start_time": "2026-10-29T11:00:00Z", "end_time": "2026-10-29T11:30:00Z"}}


def test_full_flow():
    assert c.post("/reset").json() == {"status": "reset", "patients": 2}
    patients = c.get("/patients").json()
    demo_patients = [p for p in patients if p["id"] in ("p-101", "p-102")]
    assert [p["risk_score"] for p in demo_patients] == [0.0, 0.0]

    r = c.post("/inject", json=CONFLICT)
    assert r.status_code == 201
    j = r.json()
    assert j["injected_event_id"] == "ev-991" and j["triggered_alert_id"] == "alt-881"
    assert j["alert"]["reason"] == "Ultrasound Scan overlaps with scheduled Comprehensive Metabolic Panel."
    assert j["alert"]["confidence"] == "Definite" and j["alert"]["severity"] == "high"
    assert j["latency_ms"] < 2000

    j = c.post("/inject", json=DUP).json()
    assert j["injected_event_id"] == "ev-992" and j["triggered_alert_id"] == "alt-882"
    assert j["alert"]["confidence"] == "Definite" and j["alert"]["severity"] == "med"
    assert j["alert"]["reason"] == "Duplicate HbA1c lab order within 72 hours, no result yet."

    assert len(c.get("/alerts", params={"status": "pending"}).json()) == 2
    assert len(c.get("/patients/p-101/timeline").json()) == 5
    pts = {p["id"]: p for p in c.get("/patients").json()}
    assert pts["p-101"]["risk_score"] == 0.4 and pts["p-101"]["active_alerts_count"] == 2
    assert pts["p-102"]["risk_score"] == 0.0 and pts["p-102"]["active_alerts_count"] == 0

    plan = c.get("/patients/p-101/corrected-plan").json()
    assert plan["resolves_alert_ids"] == ["alt-881", "alt-882"]
    a1, a2 = plan["adjustments"]
    assert (a1["event_id"], a1["action"], a1["proposed_start"], a1["proposed_end"]) == \
        ("ev-991", "reschedule", "2026-10-28T09:30:00Z", "2026-10-28T10:00:00Z")
    assert (a2["event_id"], a2["action"], a2["proposed_start"]) == ("ev-992", "cancel_duplicate", None)

    for aid in ("alt-881", "alt-882"):
        r = c.post(f"/alerts/{aid}/accept", json={"actor_id": "staff-04", "notes": "ok"})
        assert r.status_code == 200 and r.json()["status"] == "resolved"
    assert c.post("/alerts/alt-881/accept", json={"actor_id": "staff-04"}).status_code == 409

    log = c.get("/audit").json()
    assert [e["id"] for e in log] == ["aud-1043", "aud-1042"]
    assert log[1]["prior_state"] == "scheduled_start: 2026-10-28T09:10:00Z, alert_status: pending"
    assert log[1]["new_state"] == "scheduled_start: 2026-10-28T09:30:00Z, alert_status: resolved"
    tl = {e["event_id"]: e for e in c.get("/patients/p-101/timeline").json()}
    assert tl["ev-991"]["start_time"] == "2026-10-28T09:30:00Z" and tl["ev-992"]["status"] == "cancelled"
    assert all(p["risk_score"] == 0.0 for p in c.get("/patients").json())


def test_errors_and_reset():
    assert c.get("/patients/p-999/timeline").status_code == 404
    assert c.get("/patients/p-999/timeline").json() == {"detail": "Patient p-999 not found"}
    assert c.post("/inject", json={**CONFLICT, "anomaly_type": "missing_step"}).status_code == 422
    bad = {**DUP, "payload": {k: v for k, v in DUP["payload"].items() if k != "test_type"}}
    assert c.post("/inject", json=bad).status_code == 422
    assert c.post("/alerts/alt-999/accept", json={"actor_id": "x"}).status_code == 404
    c.post("/reset")
    assert c.post("/inject", json=CONFLICT).json()["triggered_alert_id"] == "alt-881"  # counters restart
    assert c.get("/audit").json() == []


def test_possible_duplicate_when_result_exists():
    c.post("/reset")
    from api import fallback as F
    F.update_event("ev-503", has_result=True)
    j = c.post("/inject", json=DUP).json()
    assert j["alert"]["confidence"] == "Possible" and j["alert"]["severity"] == "low"
