"""Service layer integrating detection engine rules with data.store.

Provides the service API matching api.fallback signatures and response shapes:
- detect_conflicts(pid, event)
- detect_duplicates(pid, event)
- plan_item(alert)
- build_corrected_plan(pid)
"""

import data.store
from engine.rules import (
    classify_duplicate,
    find_conflicts,
    find_next_slot,
)


def detect_conflicts(pid, event):
    """Detect scheduling conflicts for a patient event using data.store timeline.

    Returns the same alert dict as fallback or None if no conflict.
    """
    timeline = data.store.get_timeline(pid) or []
    hits = find_conflicts(event, timeline)
    if not hits:
        return None

    hits.sort(key=lambda x: x["start_time"])
    first = hits[0]
    reason = f"{event['title']} overlaps with scheduled {first['title']}."
    if len(hits) > 1:
        reason = f"{event['title']} overlaps with scheduled {first['title']} and {len(hits) - 1} other event(s)."

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
    """Detect duplicate lab orders for a patient event using data.store timeline.

    Returns the same alert dict as fallback or None if no duplicate.
    """
    timeline = data.store.get_timeline(pid) or []
    dup = classify_duplicate(event, timeline)
    if not dup:
        return None

    return {
        "patient_id": pid,
        "type": "duplicate",
        "confidence": dup["confidence"],
        "severity": dup["severity"],
        "reason": dup["reason"],
        "event_id": event["event_id"],
        "related_event_id": dup["matched_event_id"],
    }


def plan_item(alert):
    """Generate a corrected-plan adjustment for a pending alert (None for unsupported types)."""
    ev = data.store.get_event(alert["event_id"]) if alert.get("event_id") else None
    rel = data.store.get_event(alert["related_event_id"]) if alert.get("related_event_id") else None
    if not ev:
        return None

    if alert.get("type") == "conflict":
        timeline = data.store.get_timeline(ev["patient_id"]) or []
        prop_start, prop_end = find_next_slot(ev, timeline)
        title = rel["title"] if rel else "another event"
        return {
            "event_id": ev["event_id"],
            "action": "reschedule",
            "original_start": ev["start_time"],
            "proposed_start": prop_start,
            "proposed_end": prop_end,
            "reason": f"Moved to next open slot to clear the overlap with {title}.",
        }

    if alert.get("type") == "duplicate":
        label = ev.get("test_type") or "lab"
        tail = "already has a result" if (rel and rel.get("has_result")) else "has no result yet"
        return {
            "event_id": ev["event_id"],
            "action": "cancel_duplicate",
            "original_start": ev["start_time"],
            "proposed_start": None,
            "proposed_end": None,
            "reason": f"Redundant order cancelled; earlier {label} order {tail}.",
        }

    return None


def build_corrected_plan(pid):
    """Build corrected plan for a patient from pending alerts in data.store."""
    ids, adj = [], []
    alerts = data.store.get_alerts(patient_id=pid, status="pending") or []
    for a in alerts:
        item = plan_item(a)
        if item:
            ids.append(a["id"])
            adj.append(item)
    return {"patient_id": pid, "resolves_alert_ids": ids, "adjustments": adj}
