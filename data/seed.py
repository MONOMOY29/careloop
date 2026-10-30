import os
from data.db import get_connection, create_tables

# Contract section 5: p-101 is the injection target
PATIENTS = [
    ("p-101", "Eleanor Vance", 0.0, "2026-10-28T10:00:00Z"),
    ("p-102", "Arthur Pendelton", 0.0, "2026-10-28T08:30:00Z"),
]

# (event_id, patient_id, type, title, test_type, start, end, status, has_result)
EVENTS = [
    # p-101 (exactly as in the contract)
    ("ev-501", "p-101", "lab_order", "Comprehensive Metabolic Panel", "CMP",
     "2026-10-28T09:00:00Z", "2026-10-28T09:30:00Z", "scheduled", 0),
    ("ev-502", "p-101", "encounter", "Physical Therapy Session", None,
     "2026-10-28T10:00:00Z", "2026-10-28T10:45:00Z", "scheduled", 0),
    ("ev-503", "p-101", "lab_order", "HbA1c Blood Test", "HbA1c",
     "2026-10-29T09:00:00Z", "2026-10-29T09:30:00Z", "scheduled", 0),
    # p-102: clean control patient, no overlaps, no repeated tests
    ("ev-601", "p-102", "encounter", "General Check-up", None,
     "2026-10-28T08:00:00Z", "2026-10-28T08:30:00Z", "completed", 0),
    ("ev-602", "p-102", "lab_order", "Lipid Panel", "Lipid",
     "2026-10-28T11:00:00Z", "2026-10-28T11:30:00Z", "scheduled", 0),
    ("ev-603", "p-102", "lab_order", "Thyroid Panel", "TSH",
     "2026-10-30T09:00:00Z", "2026-10-30T09:30:00Z", "scheduled", 0),
    ("ev-604", "p-102", "medication", "Metformin Refill", None,
     "2026-10-31T10:00:00Z", "2026-10-31T10:15:00Z", "scheduled", 0),
]


def reset_demo_data():
    """Wipe everything and restore the clean demo seed. Returns number of patients."""
    conn = get_connection()
    for table in ("audit", "alerts", "events", "patients"):
            conn.execute(f"DROP TABLE IF EXISTS {table}")
    create_tables(conn)
    conn.executemany("INSERT INTO patients VALUES (?, ?, ?, ?)", PATIENTS)
    conn.executemany("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", EVENTS)
    conn.commit()
    conn.close()

    if os.getenv("CARELOOP_SYNTHEA") == "1":
        from data.synthea_subset import load_synthea_demo
        loaded = load_synthea_demo()
        return len(PATIENTS) + loaded

    return len(PATIENTS)


if __name__ == "__main__":
    n = reset_demo_data()
    print("Reset done. Patients:", n)
    conn = get_connection()
    for row in conn.execute(
        "SELECT event_id, patient_id, title, start_time FROM events "
        "ORDER BY patient_id, start_time"
    ):
        print(dict(row))
    conn.close()
