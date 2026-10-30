from datetime import datetime, timezone
from data.db import get_connection

# Contract section 5: injected events continue from ev-991, alerts from alt-881
ID_START = {"ev": 991, "alt": 881, "aud": 1042}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _event_to_dict(row):
    d = dict(row)
    d["has_result"] = bool(d["has_result"])  # SQLite 0/1 -> true/false
    return d


def risk_score(conflicts, duplicates, overdue_steps=0, missed_appointments=0):
    """Contract section 3. No data source for missed appointments yet, so it stays 0."""
    raw = (2 * missed_appointments + 1.5 * overdue_steps
           + 3 * conflicts + 1 * duplicates)
    return round(min(1.0, raw / 10), 2)


def get_patient(patient_id):
    """Get single patient by id. Returns dict or None."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM patients WHERE id = ?", (patient_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def touch_patient(patient_id):
    """Update patient's last_updated timestamp to now (UTC Z)."""
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE patients SET last_updated = ? WHERE id = ?",
            (_now(), patient_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_patients():
    """Contract GET /patients: risk_score is computed from pending alerts,
    list sorted by risk_score descending."""
    conn = get_connection()
    try:
        patients = conn.execute(
            "SELECT id, name, last_updated FROM patients"
        ).fetchall()
        pending = conn.execute(
            "SELECT patient_id, type, COUNT(*) AS n FROM alerts "
            "WHERE status = 'pending' GROUP BY patient_id, type"
        ).fetchall()

        counts = {}
        for r in pending:
            counts.setdefault(r["patient_id"], {})[r["type"]] = r["n"]

        result = []
        for p in patients:
            c = counts.get(p["id"], {})
            result.append({
                "id": p["id"],
                "name": p["name"],
                "risk_score": risk_score(
                    conflicts=c.get("conflict", 0),
                    duplicates=c.get("duplicate", 0),
                    overdue_steps=c.get("missing_step", 0),
                ),
                "active_alerts_count": sum(c.values()),
                "last_updated": p["last_updated"],
            })
        result.sort(key=lambda d: (-d["risk_score"], d["id"]))
        return result
    finally:
        conn.close()


def get_timeline(patient_id):
    """Contract GET /patients/{id}/timeline. Returns None if patient not found."""
    conn = get_connection()
    try:
        found = conn.execute(
            "SELECT 1 FROM patients WHERE id = ?", (patient_id,)
        ).fetchone()
        if found is None:
            return None
        rows = conn.execute(
            "SELECT * FROM events WHERE patient_id = ? ORDER BY start_time",
            (patient_id,),
        ).fetchall()
        return [_event_to_dict(r) for r in rows]
    finally:
        conn.close()


def next_id(conn, table, column, prefix):
    """ev-991, ev-992... (alt-881..., aud-1042...). Restarts after a reset.
    Considers only purely numeric suffixes so that Synthea ids like ev-s0001
    are ignored when computing the next injected id."""
    start = ID_START[prefix]
    rows = conn.execute(
        f"SELECT {column} FROM {table} WHERE {column} LIKE ?", (prefix + "-%",)
    ).fetchall()
    nums = []
    for r in rows:
        suffix = r[0].split("-", 1)[1]
        if suffix.isdigit():
            n = int(suffix)
            if n >= start:
                nums.append(n)
    return f"{prefix}-{max(nums) + 1 if nums else start}"


def add_event(patient_id, type, title, start_time, end_time,
              test_type=None, status="scheduled", has_result=False):
    """Insert one event and return it in contract format."""
    conn = get_connection()
    try:
        event_id = next_id(conn, "events", "event_id", "ev")
        conn.execute(
            "INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (event_id, patient_id, type, title, test_type,
             start_time, end_time, status, int(has_result)),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM events WHERE event_id = ?", (event_id,)
        ).fetchone()
        return _event_to_dict(row)
    finally:
        conn.close()


def get_event(event_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM events WHERE event_id = ?", (event_id,)
        ).fetchone()
        return _event_to_dict(row) if row else None
    finally:
        conn.close()


def update_event(event_id, **fields):
    """Update event fields (start_time, end_time, status, has_result). Returns updated event or None."""
    allowed = {"start_time", "end_time", "status", "has_result"}
    fields = {k: v for k, v in fields.items() if k in allowed}
    if not fields:
        return get_event(event_id)
    if "has_result" in fields:
        fields["has_result"] = int(fields["has_result"])
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn = get_connection()
    try:
        cur = conn.execute(
            f"UPDATE events SET {sets} WHERE event_id = ?",
            (*fields.values(), event_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_event(event_id)


def reschedule_event(event_id, new_start, new_end):
    """Used by POST /alerts/{id}/accept for conflicts. Returns updated event or None."""
    return update_event(event_id, start_time=new_start, end_time=new_end)


def cancel_event(event_id):
    """Used by POST /alerts/{id}/accept for duplicates. Returns updated event or None."""
    return update_event(event_id, status="cancelled")


def add_alert(patient_id, type, confidence, severity, reason,
              detected_at=None, status="pending", event_id=None, related_event_id=None):
    """Insert one alert (ids from alt-881) and return it in contract format."""
    conn = get_connection()
    try:
        alert_id = next_id(conn, "alerts", "id", "alt")
        conn.execute(
            "INSERT INTO alerts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (alert_id, patient_id, type, confidence, severity, reason,
             status, detected_at or _now(), event_id, related_event_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM alerts WHERE id = ?", (alert_id,)
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


def get_alert(alert_id):
    """Get single alert by id. Returns dict or None."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM alerts WHERE id = ?", (alert_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_alerts(patient_id=None, status=None):
    """Contract GET /alerts with optional filters."""
    sql, args = "SELECT * FROM alerts WHERE 1=1", []
    if patient_id:
        sql += " AND patient_id = ?"
        args.append(patient_id)
    if status:
        sql += " AND status = ?"
        args.append(status)
    sql += " ORDER BY detected_at, id"
    conn = get_connection()
    try:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()


def set_alert_status(alert_id, status):
    """status is 'pending' or 'resolved'. Returns updated alert or None."""
    conn = get_connection()
    try:
        cur = conn.execute(
            "UPDATE alerts SET status = ? WHERE id = ?", (status, alert_id)
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        return dict(conn.execute(
            "SELECT * FROM alerts WHERE id = ?", (alert_id,)
        ).fetchone())
    finally:
        conn.close()


def add_audit(alert_id, patient_id, action, performed_by, details,
              prior_state, new_state, notes="", timestamp=None):
    """Append one audit entry (ids from aud-1042) and return it."""
    conn = get_connection()
    try:
        audit_id = next_id(conn, "audit", "id", "aud")
        conn.execute(
            "INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (audit_id, alert_id, patient_id, action, performed_by,
             timestamp or _now(), details, prior_state, new_state, notes),
        )
        conn.commit()
        return dict(conn.execute(
            "SELECT * FROM audit WHERE id = ?", (audit_id,)
        ).fetchone())
    finally:
        conn.close()


def get_audit(patient_id=None):
    """Contract GET /audit: newest first, optional patient filter."""
    sql, args = "SELECT * FROM audit", []
    if patient_id:
        sql += " WHERE patient_id = ?"
        args.append(patient_id)
    sql += " ORDER BY timestamp DESC, id DESC"
    conn = get_connection()
    try:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()
