import time
import requests

BASE = "http://localhost:8000"
TARGET = "p-101"
CLEAN = "p-102"

CONFLICT = {
    "patient_id": TARGET,
    "anomaly_type": "conflict",
    "payload": {
        "title": "Ultrasound Scan",
        "start_time": "2026-10-28T09:10:00Z",
        "end_time": "2026-10-28T09:40:00Z",
    },
}

DUPLICATE = {
    "patient_id": TARGET,
    "anomaly_type": "duplicate",
    "payload": {
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-29T11:00:00Z",
        "end_time": "2026-10-29T11:30:00Z",
    },
}

SEVERITIES = {"low", "med", "high"}
CONFIDENCES = {"Definite", "Possible"}
STATUSES = {"pending", "resolved", "dismissed"}


def reset():
    r = requests.post(f"{BASE}/reset")
    assert r.status_code == 200


def inject(body):
    start = time.time()
    r = requests.post(f"{BASE}/inject", json=body)
    return r, (time.time() - start) * 1000


def check_alert_shape(a):
    assert a["type"] in {"conflict", "duplicate", "missing_step"}
    assert a["confidence"] in CONFIDENCES
    assert a["severity"] in SEVERITIES
    assert a["status"] in STATUSES
    assert a["reason"]
    assert a["detected_at"].endswith("Z")


def test_reset_gives_clean_seed():
    reset()
    alerts = requests.get(f"{BASE}/alerts", params={"patient_id": TARGET}).json()
    assert alerts == []
    patients = requests.get(f"{BASE}/patients").json()
    assert {p["id"] for p in patients} >= {"p-101", "p-102"}


def test_conflict_injection():
    reset()
    r, ms = inject(CONFLICT)
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "injected"
    assert data["injected_event_id"]
    assert data["triggered_alert_id"] == data["alert"]["id"]
    a = data["alert"]
    check_alert_shape(a)
    assert a["type"] == "conflict"
    assert a["confidence"] == "Definite"
    assert a["severity"] == "high"
    assert data["latency_ms"] < 2000
    assert ms < 2000


def test_duplicate_injection():
    reset()
    r, ms = inject(DUPLICATE)
    assert r.status_code == 201
    a = r.json()["alert"]
    check_alert_shape(a)
    assert a["type"] == "duplicate"
    assert a["confidence"] == "Definite"
    assert a["severity"] == "med"
    assert r.json()["latency_ms"] < 2000


def test_judge_stress_test():
    """Conflict + duplicate injected together: both flagged, plan proposed."""
    reset()
    r1, ms1 = inject(CONFLICT)
    r2, ms2 = inject(DUPLICATE)
    assert r1.status_code == 201 and r2.status_code == 201
    assert ms1 < 2000 and ms2 < 2000

    alerts = requests.get(
        f"{BASE}/alerts", params={"patient_id": TARGET, "status": "pending"}
    ).json()
    types = {a["type"] for a in alerts}
    assert {"conflict", "duplicate"} <= types
    assert all(a["reason"] for a in alerts)

    plan = requests.get(f"{BASE}/patients/{TARGET}/corrected-plan").json()
    actions = {adj["action"] for adj in plan["adjustments"]}
    assert {"reschedule", "cancel_duplicate"} <= actions
    ids = {a["id"] for a in alerts}
    assert ids <= set(plan["resolves_alert_ids"])


def test_clean_patient_has_no_alerts():
    reset()
    inject(CONFLICT)
    inject(DUPLICATE)
    alerts = requests.get(f"{BASE}/alerts", params={"patient_id": CLEAN}).json()
    assert alerts == []


def test_accept_alert_writes_audit():
    reset()
    alert_id = inject(CONFLICT)[0].json()["alert"]["id"]
    r = requests.post(
        f"{BASE}/alerts/{alert_id}/accept",
        json={"actor_id": "staff-04", "notes": "test"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "resolved"

    audit = requests.get(f"{BASE}/audit", params={"patient_id": TARGET}).json()
    entry = next(e for e in audit if e["id"] == body["audit_id"])
    assert entry["alert_id"] == alert_id
    assert entry["prior_state"] and entry["new_state"]
    assert entry["prior_state"] != entry["new_state"]


def test_invalid_anomaly_type_returns_422():
    reset()
    bad = dict(CONFLICT, anomaly_type="missing_step")
    r, _ = inject(bad)
    assert r.status_code == 422


def test_unknown_patient_returns_404():
    r = requests.get(f"{BASE}/patients/p-999/timeline")
    assert r.status_code == 404
    assert "detail" in r.json()


def test_conflict_accuracy():
    runs, caught = 20, 0
    for _ in range(runs):
        reset()
        r, _ = inject(CONFLICT)
        if r.status_code == 201 and r.json()["alert"]["type"] == "conflict":
            caught += 1
    accuracy = caught / runs * 100
    print(f"Conflict accuracy: {accuracy}%")
    assert accuracy >= 95


def test_duplicate_accuracy():
    runs, caught = 20, 0
    for _ in range(runs):
        reset()
        r, _ = inject(DUPLICATE)
        if r.status_code == 201 and r.json()["alert"]["type"] == "duplicate":
            caught += 1
    accuracy = caught / runs * 100
    print(f"Duplicate accuracy: {accuracy}%")
    assert accuracy >= 90


def test_average_latency():
    times = []
    for body in (CONFLICT, DUPLICATE) * 10:
        reset()
        r, _ = inject(body)
        times.append(r.json()["latency_ms"])
    avg = sum(times) / len(times)
    print(f"Average latency: {avg:.1f} ms")
    assert avg < 2000