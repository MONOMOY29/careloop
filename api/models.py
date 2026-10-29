from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .timeutil import fmt, parse


class PatientOut(BaseModel):
    id: str
    name: str
    risk_score: float
    active_alerts_count: int
    last_updated: str


class TimelineEvent(BaseModel):
    event_id: str
    patient_id: str
    type: Literal["encounter", "lab_order", "procedure", "medication"]
    title: str
    test_type: Optional[str] = None
    start_time: str
    end_time: str
    status: Literal["scheduled", "completed", "cancelled", "overdue"]
    has_result: bool


class Alert(BaseModel):
    id: str
    patient_id: str
    type: Literal["conflict", "duplicate", "missing_step"]
    confidence: Literal["Definite", "Possible"]
    severity: Literal["low", "med", "high"]
    reason: str
    status: Literal["pending", "resolved", "dismissed"]
    detected_at: str


class Adjustment(BaseModel):
    event_id: str
    action: Literal["reschedule", "cancel_duplicate"]
    original_start: str
    proposed_start: Optional[str] = None
    proposed_end: Optional[str] = None
    reason: str


class CorrectedPlan(BaseModel):
    patient_id: str
    resolves_alert_ids: List[str]
    adjustments: List[Adjustment]


class Payload(BaseModel):
    title: str = Field(min_length=1)
    test_type: Optional[str] = None
    start_time: str
    end_time: str

    @field_validator("start_time", "end_time")
    @classmethod
    def _iso(cls, v):
        try:
            return fmt(parse(v))
        except Exception:
            raise ValueError("must be an ISO 8601 timestamp, e.g. 2026-10-28T09:10:00Z")


class InjectRequest(BaseModel):
    patient_id: str
    anomaly_type: Literal["conflict", "duplicate"]
    payload: Payload

    @model_validator(mode="after")
    def _check(self):
        if parse(self.payload.end_time) <= parse(self.payload.start_time):
            raise ValueError("payload.end_time must be after payload.start_time")
        if self.anomaly_type == "duplicate" and not (self.payload.test_type or "").strip():
            raise ValueError("payload.test_type is required for anomaly_type 'duplicate'")
        return self


class InjectResponse(BaseModel):
    status: str
    injected_event_id: str
    triggered_alert_id: Optional[str] = None
    alert: Optional[Alert] = None
    latency_ms: float


class AcceptRequest(BaseModel):
    actor_id: str = Field(min_length=1)
    notes: str = ""


class AcceptResponse(BaseModel):
    alert_id: str
    status: str
    resolved_at: str
    audit_id: str


class AuditEntry(BaseModel):
    id: str
    alert_id: str
    patient_id: str
    action: str
    performed_by: str
    timestamp: str
    details: str
    prior_state: str
    new_state: str


class ResetResponse(BaseModel):
    status: str
    patients: int
