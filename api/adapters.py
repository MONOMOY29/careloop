
"""
The ONLY place that touches teammates' code.

By default everything comes from api/fallback.py (works standalone).
To use Member 1 (/data) and Member 2 (/engine) functions instead, set
USE_TEAM_CODE=1 and make sure their functions use the same names and
signatures as in fallback.py. Missing ones fall back.

Set CARELOOP_ENGINE=fallback to force the old stand-in when
USE_TEAM_CODE is unset.
"""
import sqlite3
import importlib
import os
import json
from pathlib import Path
from . import fallback as _fb


_DATA = [
    "reset_db",
    "get_patient",
    "list_patients",
    "get_timeline",
    "get_event",
    "add_event",
    "update_event",
    "touch_patient",
    "save_alert",
    "get_alert",
    "list_alerts",
    "set_alert_status",
    "add_audit",
    "list_audit",
]

_ENGINE = [
    "detect_conflicts",
    "detect_duplicates",
    "plan_item",
    "build_corrected_plan",
]


def _pick(name, module):
    if os.getenv("USE_TEAM_CODE") == "1":
        try:
            return getattr(importlib.import_module(module), name)
        except Exception:
            pass

    return getattr(_fb, name)


# Resolve team functions or fallback functions.
for _n in _DATA:
    globals()[_n] = _pick(_n, "data")

for _n in _ENGINE:
    globals()[_n] = _pick(_n, "engine")


# Use engine rules directly when team code is not enabled,
# unless the fallback engine has explicitly been requested.
if (
    os.getenv("USE_TEAM_CODE") != "1"
    and os.getenv("CARELOOP_ENGINE") != "fallback"
):
    try:
        from engine.rules import classify_duplicate, find_conflicts

        def detect_conflicts(pid, event):
            hits = find_conflicts(event, _fb.get_timeline(pid))

            if not hits:
                return None

            hits = sorted(hits, key=lambda x: x["start_time"])
            first = hits[0]

            reason = (
                f"{event['title']} overlaps with scheduled "
                f"{first['title']}."
            )

            if len(hits) > 1:
                reason = (
                    f"{event['title']} overlaps with scheduled "
                    f"{first['title']} and {len(hits) - 1} "
                    "other event(s)."
                )

            return {
                "patient_id": pid,
                "type": "conflict",
                "confidence": "Definite",
                "severity": "high",
                "reason": reason,
                "event_id": event["event_id"],
                "related_event_id": first["event_id"],
            }

        def detect_duplicates(pid, event):
            labs = [
                x
                for x in _fb.get_timeline(pid)
                if x["type"] == "lab_order"
            ]

            res = classify_duplicate(event, labs)

            if not res:
                return None

            return {
                "patient_id": pid,
                "type": "duplicate",
                "confidence": res["confidence"],
                "severity": res["severity"],
                "reason": res["reason"],
                "event_id": event["event_id"],
                "related_event_id": res["matched_event_id"],
            }

    except Exception as exc:
        print(
            f"[adapters] WARNING: engine not loaded, "
            f"using fallback: {exc}"
        )


# ---------------------------------------------------------
# Synthea integration
# ---------------------------------------------------------

# Preserve the original selected data functions.
_demo_get_patient = get_patient
_demo_list_patients = list_patients
_demo_get_timeline = get_timeline

# Keep the original demo patient listing available.
list_demo_patients = _demo_list_patients


# When Synthea mode is enabled, use the active data layer.
# data.seed.reset_demo_data() loads:
#   2 original demo patients
#   12 selected Synthea patients
# Total: 14 patients.

if os.getenv("CARELOOP_SYNTHEA") == "1":

    def get_patient(pid):
        """Get a patient from the active database."""
        return _demo_get_patient(pid)

    def list_patients():
        """List all patients from the active database."""
        return _demo_list_patients()

    def get_timeline(pid):
        """Get a patient's timeline from the active database."""
        return _demo_get_timeline(pid)


def is_synthea_patient(patient_id: str) -> bool:
    if os.getenv("CARELOOP_SYNTHEA") != "1":
        return False

    try:
        json_path = (
            Path(__file__).resolve().parent.parent
            / "data"
            / "synthea_demo.json"
        )

        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)

        return any(
            patient["id"] == patient_id
            for patient in data["patients"]
        )

    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        return False