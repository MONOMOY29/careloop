"""Tests for Synthea subset loading into the demo database.
Runs with CARELOOP_SYNTHEA=1 and USE_TEAM_CODE=1 in an isolated subprocess.
"""
import os
import subprocess
import sys


SUBPROCESS_CODE = """
import os
import sys

os.environ["USE_TEAM_CODE"] = "1"
os.environ["CARELOOP_SYNTHEA"] = "1"
os.environ["CARELOOP_DB"] = ":memory:"

import importlib
import api.adapters as adapters
importlib.reload(adapters)

import api.main as main_mod
importlib.reload(main_mod)
from fastapi.testclient import TestClient
import engine.rules as rules

client = TestClient(main_mod.app)

# 1. After reset there are 14 patients
r = client.post("/reset")
assert r.status_code == 200
assert r.json() == {"status": "reset", "patients": 14}

pts = client.get("/patients").json()
assert len(pts) == 14
pts_by_id = {p["id"]: p for p in pts}

# 2. p-101 and p-102 are unchanged
assert "p-101" in pts_by_id and pts_by_id["p-101"]["name"] == "Eleanor Vance"
assert "p-102" in pts_by_id and pts_by_id["p-102"]["name"] == "Arthur Pendelton"

tl_101 = client.get("/patients/p-101/timeline").json()
assert [e["event_id"] for e in tl_101] == ["ev-501", "ev-502", "ev-503"]
tl_102 = client.get("/patients/p-102/timeline").json()
assert [e["event_id"] for e in tl_102] == ["ev-601", "ev-602", "ev-603", "ev-604"]

# Check all 12 Synthea patient IDs p-s01..p-s12 exist
for i in range(1, 13):
    assert f"p-s{i:02d}" in pts_by_id

# 3. Each Synthea patient has between 15 and 40 events with valid shape;
# engine.rules.find_conflicts gives 0 conflicts; classify_duplicate gives no duplicates
EVENT_KEYS = {"event_id", "patient_id", "type", "title", "test_type", "start_time", "end_time", "status", "has_result"}
for i in range(1, 13):
    pid = f"p-s{i:02d}"
    tl = client.get(f"/patients/{pid}/timeline").json()
    assert 15 <= len(tl) <= 40, f"Expected 15 <= count <= 40 for {pid}, got {len(tl)}"
    for ev in tl:
        assert set(ev.keys()) == EVENT_KEYS
        assert ev["start_time"].endswith("Z")
        assert ev["end_time"].endswith("Z")
        assert isinstance(ev["has_result"], bool)

    # Pure rule engine checks on baseline timeline
    for ev in tl:
        conflicts = rules.find_conflicts(ev, tl)
        assert len(conflicts) == 0, f"Expected 0 conflicts for {ev['event_id']} in {pid}, got {conflicts}"
        if ev["type"] == "lab_order" and ev.get("test_type"):
            dup = rules.classify_duplicate(ev, tl)
            assert dup is None, f"Expected no duplicate for {ev['event_id']} in {pid}, got {dup}"

# 4. Injecting a conflict and a duplicate on a Synthea patient gives the right alerts,
# a corrected plan, and an audit entry on accept
conflict_payload = {
    "patient_id": "p-s01",
    "anomaly_type": "conflict",
    "payload": {
        "title": "Ultrasound Scan",
        "start_time": "2026-08-07T03:30:00Z",
        "end_time": "2026-08-07T04:00:00Z",
    },
}
r_conf = client.post("/inject", json=conflict_payload)
assert r_conf.status_code == 201
j_conf = r_conf.json()
assert j_conf["injected_event_id"] == "ev-991"
assert j_conf["triggered_alert_id"] == "alt-881"
assert j_conf["alert"]["confidence"] == "Definite" and j_conf["alert"]["severity"] == "high"

dup_payload = {
    "patient_id": "p-s01",
    "anomaly_type": "duplicate",
    "payload": {
        "title": "Glucose Repeat",
        "test_type": "Glucose",
        "start_time": "2026-08-08T10:00:00Z",
        "end_time": "2026-08-08T10:30:00Z",
    },
}
r_dup = client.post("/inject", json=dup_payload)
assert r_dup.status_code == 201
j_dup = r_dup.json()
assert j_dup["injected_event_id"] == "ev-992"
assert j_dup["triggered_alert_id"] == "alt-882"
assert j_dup["alert"]["confidence"] == "Possible" and j_dup["alert"]["severity"] == "low"

# Corrected plan
plan = client.get("/patients/p-s01/corrected-plan").json()
assert plan["resolves_alert_ids"] == ["alt-881", "alt-882"]
assert len(plan["adjustments"]) == 2

# Accept alerts
aid1 = j_conf["triggered_alert_id"]
aid2 = j_dup["triggered_alert_id"]
r_acc1 = client.post(f"/alerts/{aid1}/accept", json={"actor_id": "staff-01", "notes": "reschedule conflict"})
assert r_acc1.status_code == 200
assert r_acc1.json()["status"] == "resolved"
assert r_acc1.json()["audit_id"] == "aud-1042"

r_acc2 = client.post(f"/alerts/{aid2}/accept", json={"actor_id": "staff-01", "notes": "cancel duplicate"})
assert r_acc2.status_code == 200
assert r_acc2.json()["status"] == "resolved"
assert r_acc2.json()["audit_id"] == "aud-1043"

# Audit log has entries
audit_log = client.get("/audit").json()
assert len(audit_log) == 2
assert audit_log[0]["id"] == "aud-1043"
assert audit_log[1]["id"] == "aud-1042"

# 5. Reset removes injected data and restores the Synthea subset; id sequences still restart at ev-991, alt-881, aud-1042
r_reset = client.post("/reset")
assert r_reset.status_code == 200
assert r_reset.json() == {"status": "reset", "patients": 14}
assert len(client.get("/audit").json()) == 0
assert len(client.get("/alerts", params={"status": "pending"}).json()) == 0

# Verify timeline of p-s01 is restored to 40 events (no injected ev-991, ev-992)
tl_s01 = client.get("/patients/p-s01/timeline").json()
assert len(tl_s01) == 40
assert all(e["event_id"] != "ev-991" and e["event_id"] != "ev-992" for e in tl_s01)

# Check next_id restarted
r_conf2 = client.post("/inject", json=conflict_payload)
assert r_conf2.json()["injected_event_id"] == "ev-991"
assert r_conf2.json()["triggered_alert_id"] == "alt-881"
"""


def _run_in_subprocess(code: str):
    env = os.environ.copy()
    env["USE_TEAM_CODE"] = "1"
    env["CARELOOP_SYNTHEA"] = "1"
    env["PYTHONPATH"] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    res = subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"Subprocess failed with code {res.returncode}:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"


def test_synthea_demo_subset_flow():
    """Run all Synthea demo checks in an isolated subprocess with CARELOOP_SYNTHEA=1 and USE_TEAM_CODE=1."""
    _run_in_subprocess(SUBPROCESS_CODE)
