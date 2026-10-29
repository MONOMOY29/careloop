from data.db import get_connection

# Contract section 5: injected events continue from ev-991, alerts from alt-881
ID_START = {"ev": 991, "alt": 881, "aud": 1042}


def _event_to_dict(row):
    d = dict(row)
    d["has_result"] = bool(d["has_result"])  # SQLite 0/1 -> true/false
    return d


def get_patients():
    """Contract GET /patients: sorted by risk_score descending."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT p.id, p.name, p.risk_score,
                   (SELECT COUNT(*) FROM alerts a
                    WHERE a.patient_id = p.id AND a.status = 'pending')
                   AS active_alerts_count,
                   p.last_updated
            FROM patients p
            ORDER BY p.risk_score DESC, p.id
        """).fetchall()
        return [dict(r) for r in rows]
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
    """ev-991, ev-992... (alt-881..., aud-1042...). Restarts after a reset."""
    start = ID_START[prefix]
    rows = conn.execute(
        f"SELECT {column} FROM {table} WHERE {column} LIKE ?", (prefix + "-%",)
    ).fetchall()
    nums = [int(r[0].split("-")[1]) for r in rows]
    nums = [n for n in nums if n >= start]
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