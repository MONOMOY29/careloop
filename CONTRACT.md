# CareLoop Team Contract (v1)

One shared source of truth for data formats, API shapes and rules. Agree on it in the team meeting on Wed 28 Oct. After that, nobody changes a field name without telling Member 4 and everyone who uses it.

## 1. Ground rules

- All times are **ISO 8601 strings in local time with no timezone**, e.g. `2026-10-31T10:30:00`. This avoids timezone bugs.
- All IDs are strings, e.g. `E-0001`, `A-0001`, `P-1042`.
- All field names are `snake_case`.
- API responses are JSON. Errors return `{ "error": "message" }` with a proper HTTP status.
- Everything runs locally: FastAPI on `http://localhost:8000`, React on `http://localhost:3000`, SQLite file `careloop.db`. No internet needed on demo day.

## 2. Who owns what

| Member | Owns | Folder |
|---|---|---|
| 1 | Data loading, timeline, SQLite, demo patients | `/data` |
| 2 | Detection and policy engine | `/engine` |
| 3 | API and dashboard | `/api`, `/frontend` |
| 4 | Tests, metrics, integration, demo | `/tests`, root README |

Git rule: each person works on their own branch and merges to `main` only after Member 4 has run the tests.

## 3. Data formats

### 3.1 Event

```json
{
  "id": "E-0001",
  "patient_id": "P-1042",
  "type": "lab_order",
  "title": "CBC blood test",
  "test_type": "CBC",
  "resource": "lab",
  "start": "2026-10-31T10:30:00",
  "end": "2026-10-31T11:00:00",
  "ordered_at": "2026-10-31T10:30:00",
  "status": "scheduled",
  "priority": "normal",
  "source": "lab",
  "reschedulable": true,
  "depends_on": []
}
```

Allowed values:

- `type`: `appointment`, `lab_order`, `lab_result`, `prescription`, `followup`, `therapy`
- `resource`: `doctor`, `lab`, `physio`, `pharmacy`
- `status`: `scheduled`, `completed`, `missed`, `pending`, `cancelled`
- `priority`: `low`, `normal`, `high`
- `source`: `scheduling`, `lab`, `pharmacy`
- `test_type` and `ordered_at` are only needed for `lab_order` and `lab_result`; otherwise use `null`.
- `depends_on` is a list of event IDs that must happen first (e.g. a follow-up depends on a lab result).

### 3.2 Alert

```json
{
  "id": "A-0001",
  "patient_id": "P-1042",
  "type": "duplicate",
  "severity": 3,
  "confidence": "definite",
  "event_ids": ["E-0001", "E-0002"],
  "reason": "Duplicate: CBC re-ordered 45 min after first order, no result yet.",
  "status": "open",
  "ingested_at": "2026-10-31T11:15:00.000",
  "created_at": "2026-10-31T11:15:00.420"
}
```

Allowed values:

- `type`: `conflict`, `duplicate`, `missing_step`
- `severity`: `1` (low), `2` (medium), `3` (high)
- `confidence`: `definite`, `possible`, or `null` (only duplicates have it)
- `status`: `open`, `resolved`, `dismissed`
- Detection latency = `created_at` minus `ingested_at`. Member 2 fills both; Member 4 measures it.

### 3.3 Corrected plan

```json
{
  "id": "PL-0001",
  "patient_id": "P-1042",
  "alert_ids": ["A-0001", "A-0002"],
  "events": [],
  "changes": [
    {
      "event_id": "E-0003",
      "change": "rescheduled",
      "from": "2026-10-31T11:00:00",
      "to": "2026-10-31T11:30:00",
      "why": "Overlapped with lab test by 30 minutes"
    }
  ]
}
```

`events` holds the full list of Event objects after the fix. `change` is one of `rescheduled`, `flagged_for_review`, `kept`.

### 3.4 Audit entry

```json
{
  "id": "AU-0001",
  "plan_id": "PL-0001",
  "patient_id": "P-1042",
  "prior_state": { "event_id": "E-0003", "start": "2026-10-31T11:00:00" },
  "new_state": { "event_id": "E-0003", "start": "2026-10-31T11:30:00" },
  "trigger": "A-0001",
  "timestamp": "2026-10-31T11:15:00.500"
}
```

### 3.5 Patient (list view)

```json
{ "id": "P-1042", "name": "Demo Patient 1", "risk_score": 7.5, "open_alerts": 2 }
```

## 4. Detection rules (Member 2 implements, everyone must know)

| Rule | Definition |
|---|---|
| Conflict | Two events of the same patient overlap when `a.start < b.end` and `b.start < a.end`, and neither is `cancelled`. |
| Duplicate: Definite | Same patient and `test_type`, second order within **72 hours** of the first, and the first has **no result** yet. |
| Duplicate: Possible | Same patient and `test_type` within **7 days**, or a result already exists. |
| Missing step | A pathway step (Doctor Visit -> Blood Test -> Lab Result -> Prescription -> Follow-up) is overdue by more than its expected interval. |
| Reschedule | If `reschedulable` is true, move to the next open slot for that `resource`, same day preferred. |
| Severity (proposed) | duplicate definite = 3, conflict = 2, missing step = 2, duplicate possible = 1. If two alerts disagree, the higher severity wins. |
| Risk score (proposed) | `2 * missed_appointments + 1.5 * overdue_steps + 1 * pending_duplicates` (weights are tunable). |
| Reason text | Every alert has a one-line human-readable `reason`. No empty reasons. |

Plain-language summaries use **templates**, not an LLM.

## 5. API endpoints (Member 3 implements)

| Method | Path | Returns |
|---|---|---|
| GET | `/patients` | List of Patient objects, sorted by `risk_score` descending |
| GET | `/patients/{id}/timeline` | `{ "events": [Event, ...] }` sorted by `start` |
| GET | `/patients/{id}/alerts` | `{ "alerts": [Alert, ...] }` |
| GET | `/patients/{id}/plan` | The latest corrected plan, or `null` |
| GET | `/audit?patient_id=P-1042` | `{ "entries": [AuditEntry, ...] }` |
| POST | `/inject` | See below |
| POST | `/reset` | Reloads the clean demo data. Used before every rehearsal. |
| GET | `/metrics` | `{ "conflict_accuracy", "duplicate_accuracy", "avg_latency_ms", "missed_appointment_rate", "duplicate_test_rate" }` |

### POST /inject

Request:

```json
{
  "patient_id": "P-1042",
  "conflict": true,
  "duplicate_lab": "CBC"
}
```

`conflict` is a boolean (inject an overlapping event). `duplicate_lab` is a test type to re-order, or `null` for none.

Response:

```json
{
  "alerts": [],
  "corrected_plan": {},
  "latency_ms": 420
}
```

`alerts` is a list of Alert objects and `corrected_plan` is a Plan object.

## 6. Demo patients (Member 1 creates)

| ID | Purpose |
|---|---|
| P-1042 | From the PRD worked example. Doctor visit 10:00, CBC order 10:30, PT session 11:00, second CBC order 11:15. Has both a conflict and a duplicate. |
| P-2001 | Conflict only. |
| P-2002 | Duplicate only, `possible` (5 days apart). |
| P-2003 | Clean patient. No alerts. Used to check there are no false positives. |

`POST /reset` must restore exactly these patients every time.

## 7. Deadlines

| By | Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|---|
| Wed night | Seeded DB + demo patients | Conflict detector working on demo data | `/patients` and `/timeline` endpoints | Repo, README, test skeleton |
| Thu morning | Final data dictionary | `detect_conflicts`, `detect_duplicates`, `corrected_plan` with agreed inputs and outputs | `/inject` wired to the engine | Test harness runs against the API |
| Thu afternoon | Fixes | Audit log + reasons complete | Dashboard shows alerts, plan and inject form | Full integration run, bug list |
| Fri midday | **Feature freeze.** Only bug fixes after this. | | | |

## 8. Questions to settle in the meeting

1. Does everyone agree on the field names and allowed values above?
2. Are the severity and risk weights acceptable, or does Member 2 want different ones?
3. Which of the extras (missing-step, risk list, escalation, digest, role views) is each member committing to, and in what order?
4. How do we send daily updates (a three-line message: done, blocked, next)?
5. Who owns what happens if a part is not ready by Thursday afternoon?
