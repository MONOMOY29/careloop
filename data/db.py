import sqlite3
from pathlib import Path

# careloop.db repo ke root folder mein banegi, chahe code kahin se chale
DB_PATH = Path(__file__).resolve().parent.parent / "careloop.db"


class CareloopConnection(sqlite3.Connection):
    """Custom SQLite connection handling legacy 8-column alerts and 9-column audit INSERTs."""
    def execute(self, sql, parameters=()):
        if isinstance(sql, str):
            if "INSERT INTO alerts VALUES" in sql and len(parameters) == 8:
                sql = sql.replace(
                    "INSERT INTO alerts VALUES",
                    "INSERT INTO alerts (id, patient_id, type, confidence, severity, reason, status, detected_at) VALUES"
                )
            elif "INSERT INTO audit VALUES" in sql and len(parameters) == 9:
                sql = sql.replace(
                    "INSERT INTO audit VALUES",
                    "INSERT INTO audit (id, alert_id, patient_id, action, performed_by, timestamp, details, prior_state, new_state) VALUES"
                )
        return super().execute(sql, parameters)


def get_connection():
    conn = sqlite3.connect(DB_PATH, factory=CareloopConnection)
    conn.row_factory = sqlite3.Row
    return conn


def create_tables(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS patients (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        risk_score    REAL NOT NULL DEFAULT 0,
        last_updated  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
        event_id    TEXT PRIMARY KEY,
        patient_id  TEXT NOT NULL,
        type        TEXT NOT NULL,
        title       TEXT NOT NULL,
        test_type   TEXT,
        start_time  TEXT NOT NULL,
        end_time    TEXT NOT NULL,
        status      TEXT NOT NULL,
        has_result  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS alerts (
        id                TEXT PRIMARY KEY,
        patient_id        TEXT NOT NULL,
        type              TEXT NOT NULL,
        confidence        TEXT NOT NULL,
        severity          TEXT NOT NULL,
        reason            TEXT NOT NULL,
        status            TEXT NOT NULL,
        detected_at       TEXT NOT NULL,
        event_id          TEXT,
        related_event_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS audit (
        id            TEXT PRIMARY KEY,
        alert_id      TEXT NOT NULL,
        patient_id    TEXT NOT NULL,
        action        TEXT NOT NULL,
        performed_by  TEXT NOT NULL,
        timestamp     TEXT NOT NULL,
        details       TEXT NOT NULL,
        prior_state   TEXT NOT NULL,
        new_state     TEXT NOT NULL,
        notes         TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_patient_time
        ON events (patient_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_events_patient_test
        ON events (patient_id, test_type);
    """)

    # Safe upgrade for existing databases (PRAGMA table_info returns (cid, name, type, notnull, dflt_value, pk))
    alert_cols = {r[1] for r in conn.execute("PRAGMA table_info(alerts)").fetchall()}
    if "event_id" not in alert_cols:
        conn.execute("ALTER TABLE alerts ADD COLUMN event_id TEXT")
    if "related_event_id" not in alert_cols:
        conn.execute("ALTER TABLE alerts ADD COLUMN related_event_id TEXT")

    audit_cols = {r[1] for r in conn.execute("PRAGMA table_info(audit)").fetchall()}
    if "notes" not in audit_cols:
        conn.execute("ALTER TABLE audit ADD COLUMN notes TEXT")

    conn.commit()


if __name__ == "__main__":
    conn = get_connection()
    create_tables(conn)
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    print("Tables created:", [r["name"] for r in rows])
    conn.close()
