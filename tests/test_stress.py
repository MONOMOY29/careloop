import time
import requests

BASE = "http://localhost:8000"
DEMO_PATIENT = "P-1042"


def reset():
    requests.post(f"{BASE}/reset")


def inject(conflict=True, duplicate_lab="CBC", patient=DEMO_PATIENT):
    start = time.time()
    r = requests.post(f"{BASE}/inject", json={
        "patient_id": patient,
        "conflict": conflict,
        "duplicate_lab": duplicate_lab,
    })
    elapsed = time.time() - start
    return r, elapsed


def test_judge_stress_test():
    """Conflict + duplicate injected together: both flagged, plan proposed."""
    reset()
    r, elapsed = inject()
    assert r.status_code == 200
    data = r.json()

    types = [a["type"] for a in data["alerts"]]
    assert "conflict" in types
    assert "duplicate" in types
    assert all(a["reason"] for a in data["alerts"])
    assert data["corrected_plan"]["changes"]
    assert elapsed < 2.0


def test_clean_patient_has_no_alerts():
    reset()
    r = requests.get(f"{BASE}/patients/P-2003/alerts")
    assert r.json()["alerts"] == []


def test_conflict_accuracy():
    caught = 0
    runs = 20
    for _ in range(runs):
        reset()
        r, _ = inject(conflict=True, duplicate_lab=None)
        if any(a["type"] == "conflict" for a in r.json()["alerts"]):
            caught += 1
    accuracy = caught / runs * 100
    print(f"Conflict accuracy: {accuracy}%")
    assert accuracy >= 95


def test_duplicate_accuracy():
    caught = 0
    runs = 20
    for _ in range(runs):
        reset()
        r, _ = inject(conflict=False, duplicate_lab="CBC")
        if any(a["type"] == "duplicate" for a in r.json()["alerts"]):
            caught += 1
    accuracy = caught / runs * 100
    print(f"Duplicate accuracy: {accuracy}%")
    assert accuracy >= 90
