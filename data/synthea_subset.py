"""Load the pre-selected Synthea subset from data/synthea_demo.json into careloop.db."""
import json
from pathlib import Path

from data.db import get_connection

_JSON_PATH = Path(__file__).resolve().parent / "synthea_demo.json"


def load_synthea_demo():
    """Insert Synthea subset patients and events into the active careloop.db.
    Called after the base demo seed when CARELOOP_SYNTHEA=1."""
    with open(_JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    conn = get_connection()
    try:
        conn.executemany(
            "INSERT INTO patients VALUES (?, ?, ?, ?)",
            [(p["id"], p["name"], 0.0, p["last_updated"]) for p in data["patients"]],
        )
        conn.executemany(
            "INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    e["event_id"],
                    e["patient_id"],
                    e["type"],
                    e["title"],
                    e["test_type"],
                    e["start_time"],
                    e["end_time"],
                    e["status"],
                    int(e["has_result"]),
                )
                for e in data["events"]
            ],
        )
        conn.commit()
    finally:
        conn.close()

    return len(data["patients"])
