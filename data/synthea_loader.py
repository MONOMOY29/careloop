import re
import sqlite3
from pathlib import Path

import pandas as pd

from data.db import create_tables

from data.test_names import normalize_test_name

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SYNTHEA_DB = ROOT / "synthea.db"  # separate from the demo careloop.db

FMT = "%Y-%m-%dT%H:%M:%SZ"  # contract: UTC ISO 8601 with Z


def pid(synthea_id):
    return "p-" + str(synthea_id)[:8]


def to_utc(series):
    return pd.to_datetime(series, utc=True)


def make_events(df, start_col, stop_col, type_, minutes, use_stop=True):
    start = to_utc(df[start_col])
    if use_stop and stop_col:
        end = to_utc(df[stop_col])
        end = end.fillna(start + pd.Timedelta(minutes=minutes))
        end = end.where(end > start, start + pd.Timedelta(minutes=minutes))
    else:
        end = start + pd.Timedelta(minutes=minutes)
    return pd.DataFrame({
        "patient_id": df["PATIENT"].map(pid),
        "type": type_,
        "title": df["DESCRIPTION"],
        "test_type": None,
        "start_time": start.dt.strftime(FMT),
        "end_time": end.dt.strftime(FMT),
        "status": "completed",
        "has_result": 0,
    })


def load_all():
    # patients: only id and name (no SSN, passport etc.)
    pat = pd.read_csv(RAW / "patients.csv", usecols=["Id", "FIRST", "LAST"])
    pat["name"] = (pat["FIRST"] + " " + pat["LAST"]).map(
        lambda s: re.sub(r"\d+", "", s).strip())
    pat["id"] = pat["Id"].map(pid)

    enc = pd.read_csv(RAW / "encounters.csv",
                      usecols=["START", "STOP", "PATIENT", "DESCRIPTION"])
    proc = pd.read_csv(RAW / "procedures.csv",
                       usecols=["START", "STOP", "PATIENT", "DESCRIPTION"])
    med = pd.read_csv(RAW / "medications.csv",
                      usecols=["START", "PATIENT", "DESCRIPTION"])

    # observations is big: read in chunks, keep only laboratory rows
    labs = []
    for chunk in pd.read_csv(RAW / "observations.csv",
                             usecols=["DATE", "PATIENT", "CATEGORY", "DESCRIPTION"],
                             chunksize=200_000):
        labs.append(chunk[chunk["CATEGORY"] == "laboratory"])
    lab = pd.concat(labs)

    lab_ev = make_events(lab, "DATE", None, "lab_order", 30, use_stop=False)
    lab_ev["test_type"] = lab["DESCRIPTION"].map(normalize_test_name).values
    lab_ev["has_result"] = 1

    events = pd.concat([
        make_events(enc, "START", "STOP", "encounter", 30),
        make_events(proc, "START", "STOP", "procedure", 15),
        make_events(med, "START", None, "medication", 15, use_stop=False),
        lab_ev,
    ], ignore_index=True)

    events = events[events["patient_id"].isin(set(pat["id"]))]
    events = events.sort_values(["patient_id", "start_time"]).reset_index(drop=True)
    events["event_id"] = ["ev-s" + str(i + 1) for i in range(len(events))]
    return pat, events


def write_db(pat, events):
    last = events.groupby("patient_id")["end_time"].max()
    conn = sqlite3.connect(SYNTHEA_DB)
    create_tables(conn)
    for table in ("audit", "alerts", "events", "patients"):
        conn.execute(f"DELETE FROM {table}")
    conn.executemany(
        "INSERT INTO patients VALUES (?, ?, ?, ?)",
        [(r.id, r.name, 0.0, last.get(r.id, "2026-01-01T00:00:00Z"))
         for r in pat.itertuples(index=False)])
    rows = [
        (r.event_id, r.patient_id, r.type, r.title,
         None if pd.isna(r.test_type) else r.test_type,
         r.start_time, r.end_time, r.status, int(r.has_result))
        for r in events.itertuples(index=False)
    ]
    conn.executemany("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    pat, events = load_all()
    write_db(pat, events)
    print("Patients loaded:", len(pat))
    print("Events loaded:", len(events))
    print(events["type"].value_counts().to_string())
    print(events.head(3).to_string())