"""CareLoop API: implements API_CONTRACT.md v1.3. Run from the repo root:
    uvicorn api.main:app --reload --port 8000"""
import time
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import adapters as A
from .models import (AcceptRequest, AcceptResponse, Alert, AuditEntry, CorrectedPlan, InjectRequest,
                     InjectResponse, PatientOut, ResetResponse, TimelineEvent)
from .timeutil import now

app = FastAPI(title="CareLoop API", version="1.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:5173",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _need_patient(pid):
    if not A.get_patient(pid):
        raise HTTPException(404, f"Patient {pid} not found")


@app.get("/patients", response_model=List[PatientOut])
def patients():
    return A.list_patients()


@app.get("/patients/{pid}/timeline", response_model=List[TimelineEvent])
def timeline(pid: str):
    _need_patient(pid)
    return A.get_timeline(pid)


@app.get("/alerts", response_model=List[Alert])
def alerts(patient_id: Optional[str] = None,
           status: Optional[Literal["pending", "resolved", "dismissed"]] = Query(None)):
    return A.list_alerts(patient_id=patient_id, status=status)


@app.get("/patients/{pid}/corrected-plan", response_model=CorrectedPlan)
def corrected_plan(pid: str):
    _need_patient(pid)
    return A.build_corrected_plan(pid)


@app.post("/inject", status_code=201, response_model=InjectResponse)
def inject(req: InjectRequest):
    t0 = time.perf_counter()
    _need_patient(req.patient_id)
    if A.is_synthea_patient(req.patient_id):
        raise HTTPException(409, "Synthea patients are read-only")
    p, kind = req.payload, req.anomaly_type
    ev = A.add_event(req.patient_id, "procedure" if kind == "conflict" else "lab_order", p.title,
                     p.test_type.strip() if kind == "duplicate" else None, p.start_time, p.end_time)
    found = (A.detect_conflicts if kind == "conflict" else A.detect_duplicates)(req.patient_id, ev)
    alert = A.save_alert(found) if found else None
    A.touch_patient(req.patient_id)
    latency = round((time.perf_counter() - t0) * 1000, 1)
    return {"status": "injected", "injected_event_id": ev["event_id"],
            "triggered_alert_id": alert["id"] if alert else None, "alert": alert, "latency_ms": latency}


@app.post("/alerts/{alert_id}/accept", response_model=AcceptResponse)
def accept(alert_id: str, body: AcceptRequest):
    a = A.get_alert(alert_id)
    if not a:
        raise HTTPException(404, f"Alert {alert_id} not found")
    if a["status"] != "pending":
        raise HTTPException(409, f"Alert {alert_id} is already {a['status']}")
    ev = A.get_event(a["event_id"]) if a.get("event_id") else None
    item = A.plan_item(a)
    ts = now()
    if a["type"] == "conflict" and ev and item:
        prior = f"scheduled_start: {ev['start_time']}, alert_status: pending"
        A.update_event(ev["event_id"], start_time=item["proposed_start"], end_time=item["proposed_end"])
        new = f"scheduled_start: {item['proposed_start']}, alert_status: resolved"
        action, details = "plan_correction_accepted", f"Rescheduled {ev['event_id']} to {item['proposed_start']}"
    elif a["type"] == "duplicate" and ev:
        prior = f"event_status: {ev['status']}, alert_status: pending"
        A.update_event(ev["event_id"], status="cancelled")
        new = "event_status: cancelled, alert_status: resolved"
        action, details = "cancel_duplicate_accepted", f"Cancelled redundant lab order {ev['event_id']}"
    else:
        prior, new = "alert_status: pending", "alert_status: resolved"
        action, details = "plan_correction_accepted", f"Resolved {a['type']} alert {alert_id}"
    A.set_alert_status(alert_id, "resolved")
    A.touch_patient(a["patient_id"])
    audit_id = A.add_audit(alert_id, a["patient_id"], action, body.actor_id, details, prior, new, body.notes, ts)
    return {"alert_id": alert_id, "status": "resolved", "resolved_at": ts, "audit_id": audit_id}


@app.get("/audit", response_model=List[AuditEntry])
def audit(patient_id: Optional[str] = None):
    return A.list_audit(patient_id=patient_id)


@app.post("/reset", response_model=ResetResponse)
def reset():
    A.reset_db()
    return {"status": "reset", "patients": len(A.list_demo_patients())}
