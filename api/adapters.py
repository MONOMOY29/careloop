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