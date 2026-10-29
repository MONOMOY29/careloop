"""The ONLY place that touches teammates' code.
By default everything comes from api/fallback.py (works standalone).
To use Member 1 (/data) and Member 2 (/engine) functions instead, set USE_TEAM_CODE=1 and make
sure their functions use the same names and signatures as in fallback.py. Missing ones fall back."""
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
