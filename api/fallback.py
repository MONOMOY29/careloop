"""Built-in SQLite data layer + rule engine. Works standalone (no teammate code needed).
Rules follow API_CONTRACT.md v1.3 section 3."""
import os
import sqlite3
import threading
from datetime import timedelta

from .timeutil import parse, fmt, now

DB_PATH = os.getenv("CARELOOP_DB", "careloop.db")
_lock = threading.RLock()
_db = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
_db.row_factory = sqlite3.Row

SEED_PATIENTS = [
    ("p-101", "Eleanor Vance", "2026-10-28T10:00:00Z"),
    ("p-102", "Arthur Pendelton", "2026-10-28T08:30:00Z"),
]
SEED_EVENTS = [
    ("ev-501", "p-101", "lab_order", "Comprehensive Metabolic Panel", "CMP", "2026-10-28T09:00:00Z", "2026-10-28T09:30:00Z"),
    ("ev-502", "p-101", "encounter", "Physical Therapy Session", None, "2026-10-28T10:00:00Z", "2026-10-28T10:45:00Z"),
    ("ev-503", "p-101", "lab_order", "HbA1c Blood Test", "HbA1c", "2026-10-29T09:00:00Z", "2026-10-29T09:30:00Z"),
    ("ev-601", "p-102", "encounter", "Cardiology Follow-up", None, "2026-10-28T08:00:00Z", "2026-10-28T08:30:00Z"),
    ("ev-602", "p-102", "lab_order", "Lipid Panel", "LIPID", "2026-10-28T11:00:00Z", "2026-10-28T11:30:00Z"),
    ("ev-603", "p-102", "medication", "Medication Review", None, "2026-10-30T09:00:00Z", "2026-10-30T09:30:00Z"),
]

# ---------------------------------------------------------------- data layer
def reset_db():
    with _lock:
        _db.executescript("""
        DROP TABLE IF EXISTS api_patients; DROP TABLE IF EXISTS api_events;
        DROP TABLE IF EXISTS api_alerts;   DROP TABLE IF EXISTS api_audit;
        DROP TABLE IF EXISTS api_meta;
        CREATE TABLE api_patients(id TEXT PRIMARY KEY, name TEXT, last_updated TEXT);
        CREATE TABLE api_events(event_id TEXT PRIMARY KEY, patient_id TEXT, type TEXT, title TEXT,
            test_type TEXT, start_time TEXT, end_time TEXT, status TEXT, has_result INTEGER);
        CREATE TABLE api_alerts(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, patient_id TEXT,
            type TEXT, confidence TEXT, severity TEXT, reason TEXT, status TEXT, detected_at TEXT,
            event_id TEXT, related_event_id TEXT);
        CREATE TABLE api_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, alert_id TEXT,
            patient_id TEXT, action TEXT, performed_by TEXT, timestamp TEXT, details TEXT,
            prior_state TEXT, new_state TEXT, notes TEXT);
        CREATE TABLE api_meta(key TEXT PRIMARY KEY, value INTEGER);
        """)
        _db.executemany("INSERT INTO api_patients VALUES (?,?,?)", SEED_PATIENTS)
        _db.executemany("INSERT INTO api_events VALUES (?,?,?,?,?,?,?,'scheduled',0)", SEED_EVENTS)
        _db.executemany("INSERT INTO api_meta VALUES (?,?)", [("ev", 991), ("alt", 881), ("aud", 1042)])
        if os.getenv("CARELOOP_SYNTHEA", "1") == "1":
            try:
                import json
                from pathlib import Path
                jpath = Path(__file__).resolve().parent.parent / "data" / "synthea_demo.json"
                if jpath.is_file():
                    with open(jpath, encoding="utf-8") as f:
                        sdata = json.load(f)
                    _db.executemany(
                        "INSERT INTO api_patients VALUES (?,?,?)",
                        [(p["id"], p["name"], p["last_updated"]) for p in sdata.get("patients", [])]
                    )
                    _db.executemany(
                        "INSERT INTO api_events VALUES (?,?,?,?,?,?,?,'scheduled',?)",
                        [
                            (
                                e["event_id"],
                                e["patient_id"],
                                e["type"],
                                e["title"],
                                e.get("test_type"),
                                e["start_time"],
                                e["end_time"],
                                int(e.get("has_result", 0)),
                            )
                            for e in sdata.get("events", [])
                        ]
                    )
            except Exception:
                pass


if not _db.execute("SELECT name FROM sqlite_master WHERE name='api_patients'").fetchone():
    reset_db()


def next_id(kind):
    with _lock:
        n = _db.execute("SELECT value FROM api_meta WHERE key=?", (kind,)).fetchone()[0]
        _db.execute("UPDATE api_meta SET value=? WHERE key=?", (n + 1, kind))
        return f"{kind}-{n}"


def _count(sql, args=()):
    return _db.execute(sql, args).fetchone()[0]


def get_patient(pid):
    r = _db.execute("SELECT * FROM api_patients WHERE id=?", (pid,)).fetchone()
    return dict(r) if r else None


def touch_patient(pid):
    _db.execute("UPDATE api_patients SET last_updated=? WHERE id=?", (now(), pid))


def list_patients():
    out = []
    with _lock:
        for p in _db.execute("SELECT * FROM api_patients").fetchall():
            pid = p["id"]
            pend = "SELECT COUNT(*) FROM api_alerts WHERE patient_id=? AND status='pending' AND type=?"
            conflicts = _count(pend, (pid, "conflict"))
            dups = _count(pend, (pid, "duplicate"))
            overdue = _count(pend, (pid, "missing_step")) + _count(
                "SELECT COUNT(*) FROM api_events WHERE patient_id=? AND status='overdue'", (pid,))
            missed = 0  # no missed-appointment data in the demo seed
            risk = min(1.0, (2 * missed + 1.5 * overdue + 3 * conflicts + 1 * dups) / 10)
            out.append({"id": pid, "name": p["name"], "risk_score": round(risk, 2),
                        "active_alerts_count": _count(
                            "SELECT COUNT(*) FROM api_alerts WHERE patient_id=? AND status='pending'", (pid,)),
                        "last_updated": p["last_updated"]})
    return sorted(out, key=lambda x: (-x["risk_score"], x["id"]))


def _ev(r):
    d = dict(r)
    d["has_result"] = bool(d["has_result"])
    return d


def get_timeline(pid):
    with _lock:
        rows = _db.execute("SELECT * FROM api_events WHERE patient_id=? ORDER BY start_time, event_id", (pid,)).fetchall()
    return [_ev(r) for r in rows]


def get_event(eid):
    r = _db.execute("SELECT * FROM api_events WHERE event_id=?", (eid,)).fetchone()
    return _ev(r) if r else None


def add_event(pid, type_, title, test_type, start, end, status="scheduled", has_result=False):
    with _lock:
        eid = next_id("ev")
        _db.execute("INSERT INTO api_events VALUES (?,?,?,?,?,?,?,?,?)",
                    (eid, pid, type_, title, test_type, start, end, status, int(has_result)))
    return get_event(eid)


def update_event(eid, **fields):
    allowed = {"start_time", "end_time", "status", "has_result"}
    fields = {k: v for k, v in fields.items() if k in allowed}
    if fields:
        sets = ", ".join(f"{k}=?" for k in fields)
        _db.execute(f"UPDATE api_events SET {sets} WHERE event_id=?", (*fields.values(), eid))


def save_alert(a):
    with _lock:
        aid = next_id("alt")
        _db.execute("INSERT INTO api_alerts(id,patient_id,type,confidence,severity,reason,status,detected_at,event_id,related_event_id)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (aid, a["patient_id"], a["type"], a["confidence"], a["severity"], a["reason"],
                     "pending", now(), a.get("event_id"), a.get("related_event_id")))
    return get_alert(aid)


def get_alert(aid):
    r = _db.execute("SELECT * FROM api_alerts WHERE id=?", (aid,)).fetchone()
    return dict(r) if r else None


def list_alerts(patient_id=None, status=None):
    sql, args = "SELECT * FROM api_alerts WHERE 1=1", []
    if patient_id:
        sql += " AND patient_id=?"; args.append(patient_id)
    if status:
        sql += " AND status=?"; args.append(status)
    with _lock:
        return [dict(r) for r in _db.execute(sql + " ORDER BY seq", args).fetchall()]


def set_alert_status(aid, status):
    _db.execute("UPDATE api_alerts SET status=? WHERE id=?", (status, aid))


def add_audit(alert_id, patient_id, action, performed_by, details, prior_state, new_state, notes="", timestamp=None):
    with _lock:
        uid = next_id("aud")
        _db.execute("INSERT INTO api_audit(id,alert_id,patient_id,action,performed_by,timestamp,details,prior_state,new_state,notes)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (uid, alert_id, patient_id, action, performed_by, timestamp or now(), details, prior_state, new_state, notes))
    return uid


def list_audit(patient_id=None):
    sql, args = "SELECT * FROM api_audit", []
    if patient_id:
        sql += " WHERE patient_id=?"; args.append(patient_id)
    with _lock:
        return [dict(r) for r in _db.execute(sql + " ORDER BY seq DESC", args).fetchall()]


# ---------------------------------------------------------------- rule engine
def _active(pid, exclude=None):
    return [e for e in get_timeline(pid) if e["status"] != "cancelled" and e["event_id"] != exclude]


def _overlap(a_s, a_e, b_s, b_e):
    return a_s < b_e and b_s < a_e


def detect_conflicts(pid, event):
    """Two non-cancelled events overlap when a.start < b.end and b.start < a.end. O(n)."""
    s, e = parse(event["start_time"]), parse(event["end_time"])
    hits = [x for x in _active(pid, event["event_id"])
            if _overlap(s, e, parse(x["start_time"]), parse(x["end_time"]))]
    if not hits:
        return None
    hits.sort(key=lambda x: x["start_time"])
    first = hits[0]
    reason = f"{event['title']} overlaps with scheduled {first['title']}."
    if len(hits) > 1:
        reason = f"{event['title']} overlaps with scheduled {first['title']} and {len(hits) - 1} other event(s)."
    return {"patient_id": pid, "type": "conflict", "confidence": "Definite", "severity": "high",
            "reason": reason, "event_id": event["event_id"], "related_event_id": first["event_id"]}


def detect_duplicates(pid, event):
    """Same patient + test_type. <=72h and no result = Definite; <=7 days or result present = Possible."""
    tt = (event.get("test_type") or "").strip().lower()
    if not tt:
        return None
    s = parse(event["start_time"])
    best = None
    for x in _active(pid, event["event_id"]):
        if x["type"] != "lab_order" or (x["test_type"] or "").strip().lower() != tt:
            continue
        gap = abs(s - parse(x["start_time"]))
        if gap <= timedelta(days=7) and (best is None or gap < best[0]):
            best = (gap, x)
    if not best:
        return None
    gap, x = best
    label = event["test_type"]
    if gap <= timedelta(hours=72) and not x["has_result"]:
        conf, sev, reason = "Definite", "med", f"Duplicate {label} lab order within 72 hours, no result yet."
    elif x["has_result"]:
        conf, sev, reason = "Possible", "low", f"Possible duplicate {label} lab order: an earlier order already has a result."
    else:
        conf, sev, reason = "Possible", "low", f"Possible duplicate {label} lab order within 7 days of an earlier order."
    return {"patient_id": pid, "type": "duplicate", "confidence": conf, "severity": sev,
            "reason": reason, "event_id": event["event_id"], "related_event_id": x["event_id"]}


def plan_item(alert):
    """One corrected-plan adjustment for a pending alert (None for unsupported types)."""
    ev = get_event(alert["event_id"]) if alert.get("event_id") else None
    rel = get_event(alert["related_event_id"]) if alert.get("related_event_id") else None
    if not ev:
        return None
    if alert["type"] == "conflict":
        dur = parse(ev["end_time"]) - parse(ev["start_time"])
        start = parse(ev["start_time"])
        others = _active(ev["patient_id"], ev["event_id"])
        for _ in range(50):  # earliest open slot of the same length, same day preferred
            end = start + dur
            blockers = [parse(o["end_time"]) for o in others
                        if _overlap(start, end, parse(o["start_time"]), parse(o["end_time"]))]
            if not blockers:
                break
            start = min(blockers)
        title = rel["title"] if rel else "another event"
        return {"event_id": ev["event_id"], "action": "reschedule",
                "original_start": ev["start_time"], "proposed_start": fmt(start), "proposed_end": fmt(start + dur),
                "reason": f"Moved to next open slot to clear the overlap with {title}."}
    if alert["type"] == "duplicate":
        label = ev["test_type"] or "lab"
        tail = "already has a result" if (rel and rel["has_result"]) else "has no result yet"
        return {"event_id": ev["event_id"], "action": "cancel_duplicate",
                "original_start": ev["start_time"], "proposed_start": None, "proposed_end": None,
                "reason": f"Redundant order cancelled; earlier {label} order {tail}."}
    return None


def build_corrected_plan(pid):
    ids, adj = [], []
    for a in list_alerts(patient_id=pid, status="pending"):
        item = plan_item(a)
        if item:
            ids.append(a["id"]); adj.append(item)
    return {"patient_id": pid, "resolves_alert_ids": ids, "adjustments": adj}
