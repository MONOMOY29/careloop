"""Pure rule core of the CareLoop detection engine.

Pure functions over plain dicts and lists, standard library only.
No database, no file I/O, no imports from api/ or data/.
"""

from datetime import datetime, timedelta

from engine.config import (
    DUPLICATE_DEFINITE_HOURS,
    DUPLICATE_POSSIBLE_DAYS,
    FOLLOWUP_WINDOW_DAYS,
    RISK_DIVISOR,
    SEVERITY_RANK,
    WEIGHT_CONFLICT,
    WEIGHT_DUPLICATE,
    WEIGHT_MISSED,
    WEIGHT_OVERDUE,
)


def _parse_time(t):
    """Parse an ISO-8601 UTC timestamp or return an existing datetime."""
    if isinstance(t, datetime):
        return t
    if isinstance(t, str):
        if t.endswith("Z"):
            return datetime.fromisoformat(t[:-1] + "+00:00")
        return datetime.fromisoformat(t)
    raise TypeError(f"Expected datetime or ISO-8601 string, got {type(t)}")


def _get_event_id(event):
    """Extract event identifier from event dict (id or event_id)."""
    if not isinstance(event, dict):
        return None
    return event.get("event_id") or event.get("id")


def _is_same_event(e1, e2):
    """Check if two event dicts represent the same event."""
    if e1 is e2:
        return True
    id1 = _get_event_id(e1)
    id2 = _get_event_id(e2)
    return id1 is not None and id2 is not None and id1 == id2


def _get_alert_event_id(alert):
    """Extract event identifier associated with an alert."""
    if not isinstance(alert, dict):
        return None
    if "event_id" in alert and alert["event_id"] is not None:
        return alert["event_id"]
    if "event" in alert and alert["event"] is not None:
        return alert["event"]
    return alert.get("id")


def find_conflicts(new_event, existing_events):
    """Find non-cancelled existing events that overlap in time with new_event.

    Overlap means a.start < b.end and b.start < a.end.
    Cancelled events and the event itself are ignored.
    """
    if new_event.get("status") == "cancelled":
        return []

    new_start = _parse_time(new_event["start_time"])
    new_end = _parse_time(new_event["end_time"])

    conflicts = []
    for ev in existing_events:
        if ev.get("status") == "cancelled":
            continue
        if _is_same_event(new_event, ev):
            continue
        ev_start = _parse_time(ev["start_time"])
        ev_end = _parse_time(ev["end_time"])

        if new_start < ev_end and ev_start < new_end:
            conflicts.append(ev)

    return conflicts


def classify_duplicate(new_event, existing_events):
    """Classify potential duplicate lab orders for new_event.

    Evaluates every candidate within 7 days using the absolute time gap.
    A candidate is Definite/med if gap <= 72h and has_result is false;
    otherwise Possible/low.
    Chooses the highest severity across all candidates, breaking ties by smallest gap.
    Returns None or {"confidence", "severity", "matched_event_id", "reason"}.
    """
    if new_event.get("status") == "cancelled":
        return None

    tt = (new_event.get("test_type") or "").strip().lower()
    if not tt:
        return None

    new_start = _parse_time(new_event["start_time"])
    label = new_event.get("test_type")

    candidates = []
    for ev in existing_events:
        if ev.get("status") == "cancelled":
            continue
        if _is_same_event(new_event, ev):
            continue

        ev_tt = (ev.get("test_type") or "").strip().lower()
        if not ev_tt or ev_tt != tt:
            continue

        ev_start = _parse_time(ev["start_time"])
        gap = abs(new_start - ev_start)

        if gap <= timedelta(days=DUPLICATE_POSSIBLE_DAYS):
            has_result = bool(ev.get("has_result", False))
            if gap <= timedelta(hours=DUPLICATE_DEFINITE_HOURS) and not has_result:
                conf = "Definite"
                sev = "med"
                reason = f"Duplicate {label} lab order within 72 hours, no result yet."
            elif has_result:
                conf = "Possible"
                sev = "low"
                reason = f"Possible duplicate {label} lab order: an earlier order already has a result."
            else:
                conf = "Possible"
                sev = "low"
                reason = f"Possible duplicate {label} lab order within 7 days of an earlier order."

            candidates.append({
                "confidence": conf,
                "severity": sev,
                "matched_event_id": _get_event_id(ev),
                "reason": reason,
                "_gap": gap,
                "_rank": SEVERITY_RANK.get(sev, 0),
            })

    if not candidates:
        return None

    # Choose highest severity across all candidates, break ties by smallest gap
    candidates.sort(key=lambda c: (-c["_rank"], c["_gap"]))
    best = candidates[0]

    return {
        "confidence": best["confidence"],
        "severity": best["severity"],
        "matched_event_id": best["matched_event_id"],
        "reason": best["reason"],
    }


def resolve_alerts(alerts):
    """Keep only the highest severity alert for each event; ties keep the earliest detected.

    Alerts on different events pass through unchanged.
    """
    if not alerts:
        return []

    event_order = []
    best_per_event = {}

    for idx, alert in enumerate(alerts):
        eid = _get_alert_event_id(alert)
        key = eid if eid is not None else object()

        if key not in best_per_event:
            event_order.append(key)
            best_per_event[key] = (idx, alert)
        else:
            prev_idx, prev_alert = best_per_event[key]
            prev_sev = SEVERITY_RANK.get((prev_alert.get("severity") or "").lower(), 0)
            curr_sev = SEVERITY_RANK.get((alert.get("severity") or "").lower(), 0)

            if curr_sev > prev_sev:
                best_per_event[key] = (idx, alert)
            elif curr_sev == prev_sev:
                prev_detected = prev_alert.get("detected_at")
                curr_detected = alert.get("detected_at")
                if prev_detected and curr_detected:
                    p_dt = _parse_time(prev_detected)
                    c_dt = _parse_time(curr_detected)
                    if c_dt < p_dt:
                        best_per_event[key] = (idx, alert)

    return [best_per_event[k][1] for k in event_order]


def risk_score(conflicts, duplicates, overdue=0, missed=0):
    """Calculate patient risk score according to the contract formula.

    min(1.0, (2 * missed + 1.5 * overdue + 3 * conflicts + 1 * duplicates) / 10)
    Rounded to 2 decimals, capped at 1.0.
    """
    raw = (
        WEIGHT_MISSED * missed
        + WEIGHT_OVERDUE * overdue
        + WEIGHT_CONFLICT * conflicts
        + WEIGHT_DUPLICATE * duplicates
    )
    score = min(1.0, raw / RISK_DIVISOR)
    return round(score, 2)


def find_missing_steps(patient_events, as_of):
    """Find completed lab orders missing a follow-up encounter within FOLLOWUP_WINDOW_DAYS.

    A lab-order event with has_result == true and status not cancelled is missing its follow-up
    if there is NO later non-cancelled event of the follow-up type ('encounter') that starts
    after the lab's start_time and within FOLLOWUP_WINDOW_DAYS = 14, AND as_of is at least
    FOLLOWUP_WINDOW_DAYS after the lab's start_time.
    Returns list of {"event_id", "type": "missing_step", "severity", "confidence", "reason"}.
    """
    as_of_dt = _parse_time(as_of)
    window = timedelta(days=FOLLOWUP_WINDOW_DAYS)
    missing = []

    for ev in patient_events:
        if (ev.get("type") or "").strip().lower() != "lab_order":
            continue
        if (ev.get("status") or "").strip().lower() == "cancelled":
            continue
        if not bool(ev.get("has_result", False)):
            continue

        lab_start = _parse_time(ev["start_time"])
        if as_of_dt < lab_start + window:
            continue

        has_followup = False
        for other in patient_events:
            if (other.get("status") or "").strip().lower() == "cancelled":
                continue
            if (other.get("type") or "").strip().lower() != "encounter":
                continue
            other_start = _parse_time(other["start_time"])
            if lab_start < other_start <= lab_start + window:
                has_followup = True
                break

        if not has_followup:
            test_label = ev.get("test_type") or ev.get("title") or "lab test"
            missing.append({
                "event_id": _get_event_id(ev),
                "type": "missing_step",
                "severity": "med",
                "confidence": "Definite",
                "reason": f"Lab result for {test_label} has no follow-up visit within {FOLLOWUP_WINDOW_DAYS} days.",
            })

    return missing
