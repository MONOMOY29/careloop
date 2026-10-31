"""
The ONLY place that touches teammates' code.

By default everything comes from data and engine (active team code).
Missing ones fall back to api/fallback.py (works standalone).
Set USE_TEAM_CODE=0 to force fallback data/engine.
Set CARELOOP_ENGINE=fallback to force the fallback engine.
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
    if os.getenv("USE_TEAM_CODE", "1") == "1":
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
    os.getenv("USE_TEAM_CODE", "1") != "1"
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

_SYNTHEA_IDS = None


def _get_synthea_ids():
    global _SYNTHEA_IDS
    if _SYNTHEA_IDS is None:
        try:
            json_path = (
                Path(__file__).resolve().parent.parent
                / "data"
                / "synthea_demo.json"
            )
            with open(json_path, encoding="utf-8") as f:
                data = json.load(f)
            _SYNTHEA_IDS = {patient["id"] for patient in data.get("patients", [])}
        except Exception:
            _SYNTHEA_IDS = set()
    return _SYNTHEA_IDS


def is_synthea_patient(patient_id: str) -> bool:
    if os.getenv("CARELOOP_SYNTHEA", "1") != "1":
        return False
    return patient_id in _get_synthea_ids()


def list_demo_patients():
    """List original demo patients (p-101, p-102)."""
    return [p for p in list_patients() if not is_synthea_patient(p["id"])]
