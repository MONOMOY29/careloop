"""Verification tests for CareLoop patient count and Synthea dataset loading.
Verifies contract requirements:
1. Reset returns patients: 14.
2. GET /patients returns 14 unique patients.
3. All 12 selected Synthea patients (p-s01 to p-s12) are present.
4. Both original demo patients (p-101 and p-102) remain present.
5. Associated encounters, observations, medications, and procedures are correctly linked.
6. Calling reset multiple times does not create duplicate patients.
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app
import api.adapters as A

client = TestClient(app)

SYNTHEA_PIDS = [f"p-s{i:02d}" for i in range(1, 13)]
DEMO_PIDS = ["p-101", "p-102"]
ALL_EXPECTED_PIDS = DEMO_PIDS + SYNTHEA_PIDS


def test_reset_returns_fourteen_patients():
    res = client.post("/reset")
    assert res.status_code == 200
    assert res.json() == {"status": "reset", "patients": 14}


def test_patient_list_contains_fourteen_unique_patients():
    client.post("/reset")
    patients = client.get("/patients").json()
    assert len(patients) == 14
    ids = [p["id"] for p in patients]
    assert len(ids) == len(set(ids)), "Patient IDs must be unique"
    for pid in ALL_EXPECTED_PIDS:
        assert pid in ids, f"Expected patient {pid} to be present"


def test_demo_patients_preserved():
    client.post("/reset")
    patients = {p["id"]: p for p in client.get("/patients").json()}
    assert patients["p-101"]["name"] == "Eleanor Vance"
    assert patients["p-102"]["name"] == "Arthur Pendelton"

    tl_101 = client.get("/patients/p-101/timeline").json()
    assert [e["event_id"] for e in tl_101] == ["ev-501", "ev-502", "ev-503"]

    tl_102 = client.get("/patients/p-102/timeline").json()
    assert [e["event_id"] for e in tl_102] == ["ev-601", "ev-602", "ev-603", "ev-604"]


def test_synthea_clinical_data_linked():
    client.post("/reset")
    for pid in SYNTHEA_PIDS:
        patient = client.get(f"/patients/{pid}/timeline")
        assert patient.status_code == 200
        events = patient.json()
        assert len(events) >= 15, f"Expected at least 15 events for {pid}, found {len(events)}"
        event_types = {e["type"] for e in events}
        # Every Synthea patient should have clinical events
        assert "encounter" in event_types
        for ev in events:
            assert ev["patient_id"] == pid
            assert ev["start_time"].endswith("Z")
            assert ev["end_time"].endswith("Z")
            assert isinstance(ev["has_result"], bool)


def test_multiple_resets_no_duplicates():
    for _ in range(3):
        res = client.post("/reset")
        assert res.status_code == 200
        assert res.json() == {"status": "reset", "patients": 14}

    patients = client.get("/patients").json()
    assert len(patients) == 14
    assert len(set(p["id"] for p in patients)) == 14


def test_adapter_helpers():
    client.post("/reset")
    assert not A.is_synthea_patient("p-101")
    assert not A.is_synthea_patient("p-102")
    assert A.is_synthea_patient("p-s01")
    assert A.is_synthea_patient("p-s12")

    demo_pts = A.list_demo_patients()
    assert len(demo_pts) == 2
    assert {p["id"] for p in demo_pts} == {"p-101", "p-102"}

