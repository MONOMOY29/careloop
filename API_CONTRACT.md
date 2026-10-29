# CareLoop API Contract v1.3

This is the **only** contract. It is Member 3's v1.2 plus five team amendments, plus the detection rules, demo data and deadlines. If code and contract disagree, the contract wins. Nobody changes it alone: message the group, update this file, everyone re-reads.

**Environment:** Base URL `http://localhost:8000` · CORS allowed for `http://localhost:5173` · SQLite file `careloop.db` · everything runs offline.

**Changes from v1.2:** (1) added `POST /reset`, (2) added nullable `test_type` to timeline events, (3) timestamps are UTC ISO 8601 with a `Z` suffix, (4) a fixed clean demo seed (section 5), (5) exact enum values listed once and used everywhere.

---

## 1. Schema and enums

### Alert object

| Field | Type | Values |
|---|---|---|
| `id` | string | e.g. `"alt-881"` |
| `patient_id` | string | e.g. `"p-101"` |
| `type` | string | `"conflict"`, `"duplicate"`, `"missing_step"` |
| `confidence` | string | `"Definite"`, `"Possible"` |
| `severity` | string | `"low"`, `"med"`, `"high"` |
| `reason` | string | one-line plain-language explanation, never empty |
| `status` | string | `"pending"`, `"resolved"` |
| `detected_at` | string | ISO 8601 UTC, e.g. `"2026-10-28T10:30:00Z"` |

### Timeline event object

| Field | Type | Values |
|---|---|---|
| `event_id` | string | e.g. `"ev-501"` |
| `patient_id` | string | e.g. `"p-101"` |
| `type` | string | `"encounter"`, `"lab_order"`, `"procedure"`, `"medication"` |
| `title` | string | event description or test name |
| `test_type` | string or null | e.g. `"HbA1c"`; only set for `lab_order`, otherwise `null` |
| `start_time` | string | ISO 8601 UTC |
| `end_time` | string | ISO 8601 UTC |
| `status` | string | `"scheduled"`, `"completed"`, `"cancelled"`, `"overdue"` |
| `has_result` | boolean | `true` only for completed labs |

### Corrected plan adjustment

`action` is `"reschedule"` or `"cancel_duplicate"`. For `cancel_duplicate`, `proposed_start` and `proposed_end` are `null`.

### Errors

```json
{ "detail": "Patient p-999 not found" }
```

404 for a missing resource. 422 for an invalid request body:

```json
{
  "detail": [
    {
      "loc": ["body", "anomaly_type"],
      "msg": "Input should be 'conflict' or 'duplicate'",
      "type": "enum"
    }
  ]
}
```

---

## 2. Endpoints

### GET /patients

All patients, sorted by `risk_score` descending.

Response (200):

```json
[
  {
    "id": "p-101",
    "name": "Eleanor Vance",
    "risk_score": 0.4,
    "active_alerts_count": 2,
    "last_updated": "2026-10-28T10:00:00Z"
  },
  {
    "id": "p-102",
    "name": "Arthur Pendelton",
    "risk_score": 0.0,
    "active_alerts_count": 0,
    "last_updated": "2026-10-28T08:30:00Z"
  }
]
```

### GET /patients/{id}/timeline

Events for one patient, sorted by `start_time`. Example for `p-101` after both injections in section 3:

```json
[
  {
    "event_id": "ev-501",
    "patient_id": "p-101",
    "type": "lab_order",
    "title": "Comprehensive Metabolic Panel",
    "test_type": "CMP",
    "start_time": "2026-10-28T09:00:00Z",
    "end_time": "2026-10-28T09:30:00Z",
    "status": "scheduled",
    "has_result": false
  },
  {
    "event_id": "ev-991",
    "patient_id": "p-101",
    "type": "procedure",
    "title": "Ultrasound Scan",
    "test_type": null,
    "start_time": "2026-10-28T09:10:00Z",
    "end_time": "2026-10-28T09:40:00Z",
    "status": "scheduled",
    "has_result": false
  },
  {
    "event_id": "ev-502",
    "patient_id": "p-101",
    "type": "encounter",
    "title": "Physical Therapy Session",
    "test_type": null,
    "start_time": "2026-10-28T10:00:00Z",
    "end_time": "2026-10-28T10:45:00Z",
    "status": "scheduled",
    "has_result": false
  },
  {
    "event_id": "ev-503",
    "patient_id": "p-101",
    "type": "lab_order",
    "title": "HbA1c Blood Test",
    "test_type": "HbA1c",
    "start_time": "2026-10-29T09:00:00Z",
    "end_time": "2026-10-29T09:30:00Z",
    "status": "scheduled",
    "has_result": false
  },
  {
    "event_id": "ev-992",
    "patient_id": "p-101",
    "type": "lab_order",
    "title": "HbA1c Test Repeat",
    "test_type": "HbA1c",
    "start_time": "2026-10-29T11:00:00Z",
    "end_time": "2026-10-29T11:30:00Z",
    "status": "scheduled",
    "has_result": false
  }
]
```

### GET /alerts

Query parameters (both optional): `?patient_id=p-101&status=pending`.

Response (200):

```json
[
  {
    "id": "alt-881",
    "patient_id": "p-101",
    "type": "conflict",
    "confidence": "Definite",
    "severity": "high",
    "reason": "Ultrasound Scan overlaps with scheduled Comprehensive Metabolic Panel.",
    "status": "pending",
    "detected_at": "2026-10-28T10:30:00Z"
  },
  {
    "id": "alt-882",
    "patient_id": "p-101",
    "type": "duplicate",
    "confidence": "Definite",
    "severity": "med",
    "reason": "Duplicate HbA1c lab order within 72 hours, no result yet.",
    "status": "pending",
    "detected_at": "2026-10-28T10:35:00Z"
  }
]
```

### GET /patients/{id}/corrected-plan

Proposed adjustments that resolve the patient's pending alerts.

Response (200):

```json
{
  "patient_id": "p-101",
  "resolves_alert_ids": ["alt-881", "alt-882"],
  "adjustments": [
    {
      "event_id": "ev-991",
      "action": "reschedule",
      "original_start": "2026-10-28T09:10:00Z",
      "proposed_start": "2026-10-28T09:30:00Z",
      "proposed_end": "2026-10-28T10:00:00Z",
      "reason": "Moved to next open slot to clear the lab overlap."
    },
    {
      "event_id": "ev-992",
      "action": "cancel_duplicate",
      "original_start": "2026-10-29T11:00:00Z",
      "proposed_start": null,
      "proposed_end": null,
      "reason": "Redundant order cancelled; earlier HbA1c order has no result yet."
    }
  ]
}
```

### POST /inject

Injects one synthetic anomaly. `anomaly_type` accepts only `"conflict"` or `"duplicate"`. Returns 201.

**Conflict request:**

```json
{
  "patient_id": "p-101",
  "anomaly_type": "conflict",
  "payload": {
    "title": "Ultrasound Scan",
    "start_time": "2026-10-28T09:10:00Z",
    "end_time": "2026-10-28T09:40:00Z"
  }
}
```

**Conflict response:**

```json
{
  "status": "injected",
  "injected_event_id": "ev-991",
  "triggered_alert_id": "alt-881",
  "alert": {
    "id": "alt-881",
    "patient_id": "p-101",
    "type": "conflict",
    "confidence": "Definite",
    "severity": "high",
    "reason": "Ultrasound Scan overlaps with scheduled Comprehensive Metabolic Panel.",
    "status": "pending",
    "detected_at": "2026-10-28T10:30:00Z"
  },
  "latency_ms": 14.2
}
```

**Duplicate request:**

```json
{
  "patient_id": "p-101",
  "anomaly_type": "duplicate",
  "payload": {
    "title": "HbA1c Test Repeat",
    "test_type": "HbA1c",
    "start_time": "2026-10-29T11:00:00Z",
    "end_time": "2026-10-29T11:30:00Z"
  }
}
```

**Duplicate response:**

```json
{
  "status": "injected",
  "injected_event_id": "ev-992",
  "triggered_alert_id": "alt-882",
  "alert": {
    "id": "alt-882",
    "patient_id": "p-101",
    "type": "duplicate",
    "confidence": "Definite",
    "severity": "med",
    "reason": "Duplicate HbA1c lab order within 72 hours, no result yet.",
    "status": "pending",
    "detected_at": "2026-10-28T10:35:00Z"
  },
  "latency_ms": 11.8
}
```

For a "Possible" duplicate, the same response shape is used with `"confidence": "Possible"` and `"severity": "low"`.

### POST /alerts/{id}/accept

Accepts the proposed correction, updates the timeline, resolves the alert and writes an audit entry. Accepting a conflict alert reschedules the injected event; accepting a duplicate alert cancels the newer event.

Request:

```json
{
  "actor_id": "staff-04",
  "notes": "Patient confirmed availability for rescheduled slot."
}
```

Response (200):

```json
{
  "alert_id": "alt-881",
  "status": "resolved",
  "resolved_at": "2026-10-28T10:45:00Z",
  "audit_id": "aud-1042"
}
```

### GET /audit

Append-only log, **sorted newest first**. Optional query parameter: `?patient_id=p-101`.

Response (200):

```json
[
  {
    "id": "aud-1043",
    "alert_id": "alt-882",
    "patient_id": "p-101",
    "action": "cancel_duplicate_accepted",
    "performed_by": "staff-02",
    "timestamp": "2026-10-28T11:00:00Z",
    "details": "Cancelled redundant lab order ev-992",
    "prior_state": "event_status: scheduled, alert_status: pending",
    "new_state": "event_status: cancelled, alert_status: resolved"
  },
  {
    "id": "aud-1042",
    "alert_id": "alt-881",
    "patient_id": "p-101",
    "action": "plan_correction_accepted",
    "performed_by": "staff-04",
    "timestamp": "2026-10-28T10:45:00Z",
    "details": "Rescheduled ev-991 to 2026-10-28T09:30:00Z",
    "prior_state": "scheduled_start: 2026-10-28T09:10:00Z, alert_status: pending",
    "new_state": "scheduled_start: 2026-10-28T09:30:00Z, alert_status: resolved"
  }
]
```

### POST /reset (new)

Restores the clean demo data from section 5: all injected events, alerts and audit entries are removed, and the ID counters restart. Used before every rehearsal and by every test.

Response (200):

```json
{ "status": "reset", "patients": 2 }
```

---

## 3. Detection rules (Member 2 implements; everyone must know)

| Rule | Definition |
|---|---|
| Conflict | Two non-cancelled events of the same patient overlap when `a.start_time < b.end_time` and `b.start_time < a.end_time`. Severity `high`, confidence `Definite`. |
| Duplicate: Definite | Same patient and same `test_type`, the new order's `start_time` is within **72 hours** of the existing order's `start_time` (compare start times, not when the order was placed), and the existing order has `has_result: false`. Severity `med`. |
| Duplicate: Possible | Same patient and same `test_type` within **7 days**, or the earlier order already has a result. Severity `low`. |
| Missing step | A step of the pathway (Doctor Visit, Blood Test, Lab Result, Prescription, Follow-up) is overdue past its expected interval. Severity `med`. Build only if time allows. |
| Priority | If two alerts disagree on the same event, the higher severity wins. |
| Reschedule | Move the injected (reschedulable) event to the next open slot of the same length, same day preferred. |
| Cancel duplicate | The redundant (newer) order is cancelled; the earlier order stays. |
| Reason | Every alert has a one-line, plain-language `reason`. No empty reasons. |
| Risk score (proposed) | `min(1.0, (2 * missed_appointments + 1.5 * overdue_steps + 3 * pending_conflicts + 1 * pending_duplicates) / 10)` (p-101 with 1 conflict and 1 duplicate = 0.4) |

Detection latency (`latency_ms` on `/inject`) is measured from receiving the request to the alert being stored, and must stay under 2000 ms.

---

## 4. Ownership

| Member | Owns | Folder |
|---|---|---|
| 1 | Data loading, timeline, SQLite tables, demo seed, reset function | `/data` |
| 2 | Detection and policy engine, corrected plan, audit entries | `/engine` |
| 3 | FastAPI endpoints and React dashboard | `/api`, `/frontend` |
| 4 | Tests, metrics, integration, demo | `/tests`, root README |

Each person works on their own branch and merges to `main` only after Member 4 has run the tests.

---

## 5. Demo seed (what `/reset` restores)

**p-101 "Eleanor Vance"** is the injection target. It starts with no alerts and this timeline:

| event_id | type | title | test_type | start_time | end_time | status | has_result |
|---|---|---|---|---|---|---|---|
| ev-501 | lab_order | Comprehensive Metabolic Panel | CMP | 2026-10-28T09:00:00Z | 2026-10-28T09:30:00Z | scheduled | false |
| ev-502 | encounter | Physical Therapy Session | null | 2026-10-28T10:00:00Z | 2026-10-28T10:45:00Z | scheduled | false |
| ev-503 | lab_order | HbA1c Blood Test | HbA1c | 2026-10-29T09:00:00Z | 2026-10-29T09:30:00Z | scheduled | false |

**p-102 "Arthur Pendelton"** is the clean control patient. It has a few events with no overlaps and no repeated tests. It must **never** produce an alert (used to check false positives).

With this seed, injecting the conflict example from section 2 creates exactly one alert (`alt-881`, overlap with `ev-501`) and injecting the duplicate example creates exactly one more (`alt-882`, repeat of `ev-503`). Injected event IDs continue from `ev-991`, and alert IDs from `alt-881`.

---

## 6. Deadlines

| By | Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|---|
| Wed night | Seeded DB with p-101 and p-102, `has_result` and `test_type` columns, reset function | Conflict detector working on the seed | `/patients`, `/timeline`, `/reset` | Repo, README, test skeleton updated to v1.3 |
| Thu morning | Fixes | `detect_conflicts`, `detect_duplicates`, corrected-plan function, audit entries | `/inject`, `/alerts`, `/corrected-plan`, `/accept`, `/audit` working | Test harness runs against the API |
| Thu afternoon | Fixes | Reasons complete, edge cases | Dashboard shows alerts, plan and the inject form | Full integration run and bug list |
| Fri midday | **Feature freeze.** Only bug fixes after this. | | | |

Order of extras after the must-haves (timeline, conflict, duplicate, corrected plan, reasons, audit): missing-step, risk-ranked list, escalation, caregiver digest, role views. Anything nobody claims is dropped.
