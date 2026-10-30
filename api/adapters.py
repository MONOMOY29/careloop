"""The ONLY place that touches teammates' code.
By default everything comes from api/fallback.py (works standalone).
To use Member 1 (/data) and Member 2 (/engine) functions instead, set USE_TEAM_CODE=1 and make
sure their functions use the same names and signatures as in fallback.py. Missing ones fall back.
Set CARELOOP_ENGINE=fallback to force the old stand-in when USE_TEAM_CODE is unset.
"""
import importlib
import os

from . import fallback as _fb

_DATA = ["reset_db", "get_patient", "list_patients", "get_timeline", "get_event", "add_event", "update_event",
         "touch_patient", "save_alert", "get_alert", "list_alerts", "set_alert_status", "add_audit", "list_audit"]
_ENGINE = ["detect_conflicts", "detect_duplicates", "plan_item", "build_corrected_plan"]


def _pick(name, module):
    if os.getenv("USE_TEAM_CODE") == "1":
        try:
            return getattr(importlib.import_module(module), name)
        except Exception:
            pass
    return getattr(_fb, name)


for _n in _DATA:
    globals()[_n] = _pick(_n, "data")
for _n in _ENGINE:
    globals()[_n] = _pick(_n, "engine")

if os.getenv("USE_TEAM_CODE") != "1" and os.getenv("CARELOOP_ENGINE") != "fallback":
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
    except Exception as exc:
        pass
