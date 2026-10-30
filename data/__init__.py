"""data package adapter exports.
Exports all 14 functions expected by api/adapters._DATA:
reset_db, get_patient, list_patients, get_timeline, get_event, add_event,
update_event, touch_patient, save_alert, get_alert, list_alerts,
set_alert_status, add_audit, list_audit.
"""
import os
from .seed import reset_demo_data
from .store import (
    get_patient,
    get_patients as list_patients,
    get_timeline,
    get_event,
    update_event,
    touch_patient,
    get_alert,
    get_alerts as list_alerts,
    set_alert_status,
    get_audit as list_audit,
)
from . import store


def reset_db():
    return reset_demo_data()


def add_event(pid, type_, title, test_type, start, end, status="scheduled", has_result=False):
    return store.add_event(
        patient_id=pid,
        type=type_,
        title=title,
        start_time=start,
        end_time=end,
        test_type=test_type,
        status=status,
        has_result=has_result,
    )


def save_alert(a):
    stored = store.add_alert(
        patient_id=a["patient_id"],
        type=a["type"],
        confidence=a["confidence"],
        severity=a["severity"],
        reason=a["reason"],
        detected_at=a.get("detected_at"),
        status=a.get("status", "pending"),
        event_id=a.get("event_id"),
        related_event_id=a.get("related_event_id"),
    )
    return stored


def add_audit(alert_id, patient_id, action, performed_by, details, prior_state, new_state, notes="", timestamp=None):
    entry = store.add_audit(
        alert_id=alert_id,
        patient_id=patient_id,
        action=action,
        performed_by=performed_by,
        details=details,
        prior_state=prior_state,
        new_state=new_state,
        notes=notes,
        timestamp=timestamp,
    )
    return entry["id"]


__all__ = [
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
