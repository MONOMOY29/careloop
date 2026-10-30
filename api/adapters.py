"""The ONLY place that touches teammates' code.

Data layer: api/fallback.py (SQLite tables api_*), unchanged.
Detection:  Member 2's pure rules in engine/rules.py.
Set CARELOOP_ENGINE=fallback to force the old stand-in (rollback switch).
"""
import os

from . import fallback as _fb

_DATA = ["reset_db", "get_patient", "list_patients", "get_timeline", "get_event", "add_event", "update_event",
         "touch_patient", "save_alert", "get_alert", "list_alerts", "set_alert_status", "add_audit", "list_audit"]
for _n in _DATA:
    globals()[_n] = getattr(_fb, _n)

# defaults: the stand-in
ENGINE_SOURCE = "fallback (api/fallback.py)"
detect_conflicts = _fb.detect_conflicts
detect_duplicates = _fb.detect_duplicates
plan_item = _fb.plan_item
build_corrected_plan = _fb.build_corrected_plan

if os.getenv("CARELOOP_ENGINE") != "fallback":
    try:
        from engine.rules import classify_duplicate, find_conflicts

        def detect_conflicts(pid, event):
            hits = find_conflicts(event, _fb.get_timeline(pid))
            if not hits:
                return None
            hits = sorted(hits, key=lambda x: x["start_time"])
            first = hits[0]
            reason = f"{event['title']} overlaps with scheduled {first['title']}."
            if len(hits) > 1:
                reason = f"{event['title']} overlaps with scheduled {first['title']} and {len(hits) - 1} other event(s)."
            return {"patient_id": pid, "type": "conflict", "confidence": "Definite", "severity": "high",
                    "reason": reason, "event_id": event["event_id"], "related_event_id": first["event_id"]}

        def detect_duplicates(pid, event):
            labs = [x for x in _fb.get_timeline(pid) if x["type"] == "lab_order"]
            res = classify_duplicate(event, labs)
            if not res:
                return None
            return {"patient_id": pid, "type": "duplicate", "confidence": res["confidence"],
                    "severity": res["severity"], "reason": res["reason"],
                    "event_id": event["event_id"], "related_event_id": res["matched_event_id"]}

        ENGINE_SOURCE = "team engine (engine/rules.py)"
    except Exception as exc:
        print(f"[adapters] WARNING: engine not loaded, using fallback: {exc}")

print(f"[adapters] detection source: {ENGINE_SOURCE}")

# ---------------------------------------------------------
# Synthea integration: read-only patient and timeline access
# ---------------------------------------------------------
import sqlite3
from pathlib import Path

# Preserve the original demo database functions.
list_demo_patients = _fb.list_patients


def _synthea_db_path():
    configured = os.getenv("CARELOOP_SYNTHEA_DB")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parent.parent / "synthea.db"


def _synthea_query(sql, params=()):
    """Run a read-only query against the local Synthea database."""
    db_path = _synthea_db_path()

    if not db_path.is_file():
        return []

    try:
        uri = db_path.as_uri() + "?mode=ro"
        with sqlite3.connect(uri, uri=True) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute(sql, params).fetchall()]
    except sqlite3.Error as exc:
        print(f"[adapters] Synthea read warning: {exc}")
        return []


def is_synthea_patient(pid):
    """Identify patients that belong to the read-only Synthea database."""
    if _fb.get_patient(pid):
        return False

    rows = _synthea_query(
        "SELECT id FROM patients WHERE id = ? LIMIT 1", (pid,)
    )
    return bool(rows)


def get_patient(pid):
    """Prefer the existing demo patient, then check Synthea."""
    patient = _fb.get_patient(pid)
    if patient:
        return patient

    rows = _synthea_query(
        "SELECT id, name, risk_score, last_updated "
        "FROM patients WHERE id = ? LIMIT 1",
        (pid,),
    )
    return rows[0] if rows else None


def list_patients():
    """Return demo patients plus Synthea patients."""
    patients = list_demo_patients()
    existing_ids = {p["id"] for p in patients}

    synthea_patients = _synthea_query(
        "SELECT id, name, risk_score, last_updated FROM patients"
    )

    for patient in synthea_patients:
        if patient["id"] in existing_ids:
            continue

        patients.append({
            "id": patient["id"],
            "name": patient["name"],
            "risk_score": patient["risk_score"],
            "active_alerts_count": 0,
            "last_updated": patient["last_updated"],
        })

    return patients


def get_timeline(pid):
    """Read Synthea events; use the demo timeline for demo patients."""
    if not is_synthea_patient(pid):
        return _fb.get_timeline(pid)

    events = _synthea_query(
        """
        SELECT event_id, patient_id, type, title, test_type,
               start_time, end_time, status, has_result
        FROM events
        WHERE patient_id = ?
        ORDER BY start_time, event_id
        """,
        (pid,),
    )

    for event in events:
        event["has_result"] = bool(event["has_result"])

    return events
