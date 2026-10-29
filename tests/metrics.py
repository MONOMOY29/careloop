import requests

BASE = "http://localhost:8000"
RUNS = 20

CONFLICT = {
    "patient_id": "p-101",
    "anomaly_type": "conflict",
    "payload": {
        "title": "Ultrasound Scan",
        "start_time": "2026-10-28T09:10:00Z",
        "end_time": "2026-10-28T09:40:00Z",
    },
}
DUPLICATE = {
    "patient_id": "p-101",
    "anomaly_type": "duplicate",
    "payload": {
        "title": "HbA1c Test Repeat",
        "test_type": "HbA1c",
        "start_time": "2026-10-29T11:00:00Z",
        "end_time": "2026-10-29T11:30:00Z",
    },
}


def run(body):
    requests.post(f"{BASE}/reset")
    r = requests.post(f"{BASE}/inject", json=body)
    return r.json() if r.status_code == 201 else None


def main():
    conflict_hits, dup_hits, latencies = 0, 0, []
    for _ in range(RUNS):
        d = run(CONFLICT)
        if d and d["alert"]["type"] == "conflict":
            conflict_hits += 1
            latencies.append(d["latency_ms"])
        d = run(DUPLICATE)
        if d and d["alert"]["type"] == "duplicate":
            dup_hits += 1
            latencies.append(d["latency_ms"])

    # false positives: clean patient after both injections
    requests.post(f"{BASE}/reset")
    requests.post(f"{BASE}/inject", json=CONFLICT)
    requests.post(f"{BASE}/inject", json=DUPLICATE)
    clean = requests.get(f"{BASE}/alerts", params={"patient_id": "p-102"}).json()

    # rates over all patients (current data)
    total_appts = missed = total_labs = dup_alerts = 0
    for p in requests.get(f"{BASE}/patients").json():
        events = requests.get(f"{BASE}/patients/{p['id']}/timeline").json()
        total_appts += sum(e["type"] == "encounter" for e in events)
        missed += sum(e["type"] == "encounter" and e["status"] == "overdue" for e in events)
        total_labs += sum(e["type"] == "lab_order" for e in events)
    for a in requests.get(f"{BASE}/alerts").json():
        dup_alerts += a["type"] == "duplicate"

    print("=== CareLoop metrics ===")
    print(f"Conflict detection accuracy : {conflict_hits / RUNS * 100:.0f}%  (target >= 95%)")
    print(f"Duplicate detection accuracy: {dup_hits / RUNS * 100:.0f}%  (target >= 90%)")
    if latencies:
        print(f"Detection latency avg / max : {sum(latencies) / len(latencies):.1f} ms / {max(latencies):.1f} ms  (target < 2000 ms)")
    print(f"False alerts on clean p-102 : {len(clean)}  (target 0)")
    print(f"Missed-appointment rate     : {missed / total_appts * 100 if total_appts else 0:.1f}%")
    print(f"Duplicate-test rate         : {dup_alerts / total_labs * 100 if total_labs else 0:.1f}%")


if __name__ == "__main__":
    main()