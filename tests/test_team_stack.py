"""End-to-end tests for the team stack (data + engine).
Runs in a separate subprocess with USE_TEAM_CODE=1 so that the main
pytest process's environment, adapter module imports, and databases
are completely isolated.
"""
import os
import subprocess
import sys


SUBPROCESS_CODE = """
import os
import sys

os.environ["USE_TEAM_CODE"] = "1"
os.environ["CARELOOP_DB"] = ":memory:"

import importlib
import api.adapters as adapters
importlib.reload(adapters)

import api.main as main_mod
importlib.reload(main_mod)
from fastapi.testclient import TestClient

client = TestClient(main_mod.app)

# 1. Assert all 14 data names and 4 engine names resolve to team code, not api.fallback
for name in adapters._DATA:
    func = getattr(adapters, name)
    mod = func.__module__
    assert not mod.startswith("api.fallback"), f"{name} unexpectedly resolved to fallback ({mod})"
    assert mod.startswith("data"), f"{name} resolved to {mod}, expected data.*"

for name in adapters._ENGINE:
    func = getattr(adapters, name)
    mod = func.__module__
    assert not mod.startswith("api.fallback"), f"{name} unexpectedly resolved to fallback ({mod})"
    assert mod.startswith("engine"), f"{name} resolved to {mod}, expected engine.*"

CONFLICT = {
    "patient_id": "p-101",
    "anomaly_type": "conflict",
    "payload": {
        "title": "Ultrasound Scan",
        "start_time": "2026-10-28T09:10:00Z",
        "end_time": "2026-10-28T09:40:00Z",
    },
}

DUP = {
    "patient_id": "p-101",
    "anomaly_type": "duplicate",
    "payload": {
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-29T11:00:00Z",
        "end_time": "2026-10-29T11:30:00Z",
    },
}

# 2. Reset
assert client.post("/reset").json() == {"status": "reset", "patients": 2}
assert [p["risk_score"] for p in client.get("/patients").json()] == [0.0, 0.0]

# 3. Inject conflict
r = client.post("/inject", json=CONFLICT)
assert r.status_code == 201
j = r.json()
assert j["injected_event_id"] == "ev-991" and j["triggered_alert_id"] == "alt-881"
assert j["alert"]["reason"] == "Ultrasound Scan overlaps with scheduled Comprehensive Metabolic Panel."
assert j["alert"]["confidence"] == "Definite" and j["alert"]["severity"] == "high"
assert j["latency_ms"] < 2000

# 4. Inject duplicate (Definite / med)
j = client.post("/inject", json=DUP).json()
assert j["injected_event_id"] == "ev-992" and j["triggered_alert_id"] == "alt-882"
assert j["alert"]["confidence"] == "Definite" and j["alert"]["severity"] == "med"
assert j["alert"]["reason"] == "Duplicate HbA1c lab order within 72 hours, no result yet."

# 5. Pending alerts & timeline count & risk scores
assert len(client.get("/alerts", params={"status": "pending"}).json()) == 2
assert len(client.get("/patients/p-101/timeline").json()) == 5
pts = {p["id"]: p for p in client.get("/patients").json()}
assert pts["p-101"]["risk_score"] == 0.4 and pts["p-101"]["active_alerts_count"] == 2
assert pts["p-102"]["risk_score"] == 0.0 and pts["p-102"]["active_alerts_count"] == 0

# 6. Corrected plan
plan = client.get("/patients/p-101/corrected-plan").json()
assert plan["resolves_alert_ids"] == ["alt-881", "alt-882"]
a1, a2 = plan["adjustments"]
assert (a1["event_id"], a1["action"], a1["proposed_start"], a1["proposed_end"]) == (
    "ev-991",
    "reschedule",
    "2026-10-28T09:30:00Z",
    "2026-10-28T10:00:00Z",
)
assert (a2["event_id"], a2["action"], a2["proposed_start"]) == ("ev-992", "cancel_duplicate", None)

# 7. Accept alerts
for aid in ("alt-881", "alt-882"):
    r = client.post(f"/alerts/{aid}/accept", json={"actor_id": "staff-04", "notes": "ok"})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
assert client.post("/alerts/alt-881/accept", json={"actor_id": "staff-04"}).status_code == 409

# 8. Audit log
log = client.get("/audit").json()
assert [e["id"] for e in log] == ["aud-1043", "aud-1042"]
assert log[1]["prior_state"] == "scheduled_start: 2026-10-28T09:10:00Z, alert_status: pending"
assert log[1]["new_state"] == "scheduled_start: 2026-10-28T09:30:00Z, alert_status: resolved"
tl = {e["event_id"]: e for e in client.get("/patients/p-101/timeline").json()}
assert tl["ev-991"]["start_time"] == "2026-10-28T09:30:00Z" and tl["ev-992"]["status"] == "cancelled"
assert all(p["risk_score"] == 0.0 for p in client.get("/patients").json())

# 9. Errors & reset
assert client.get("/patients/p-999/timeline").status_code == 404
assert client.get("/patients/p-999/timeline").json() == {"detail": "Patient p-999 not found"}
assert client.post("/inject", json={**CONFLICT, "anomaly_type": "missing_step"}).status_code == 422
bad = {**DUP, "payload": {k: v for k, v in DUP["payload"].items() if k != "test_type"}}
assert client.post("/inject", json=bad).status_code == 422
assert client.post("/alerts/alt-999/accept", json={"actor_id": "x"}).status_code == 404
client.post("/reset")
assert client.post("/inject", json=CONFLICT).json()["triggered_alert_id"] == "alt-881"  # counters restart
assert client.get("/audit").json() == []

# 10. Possible duplicate flow on team stack
client.post("/reset")
import data
data.update_event("ev-503", has_result=True)
j = client.post("/inject", json=DUP).json()
assert j["alert"]["confidence"] == "Possible" and j["alert"]["severity"] == "low"
assert j["alert"]["reason"] == "Possible duplicate HbA1c lab order: an earlier order already has a result."
"""


def _run_in_subprocess(code: str):
    env = os.environ.copy()
    env["USE_TEAM_CODE"] = "1"
    env["PYTHONPATH"] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    res = subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"Subprocess failed with code {res.returncode}:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"


def test_team_stack_adapter_resolution_and_full_flow():
    """Run all team stack checks and flows in an isolated subprocess with USE_TEAM_CODE=1."""
    _run_in_subprocess(SUBPROCESS_CODE)
