/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const BASE_URL = 'http://localhost:8000';

let USE_MOCK = false;
let backendOffline = false;
const listeners = new Set();

export function getUseMock() {
  return USE_MOCK;
}

export function setUseMock(value) {
  USE_MOCK = Boolean(value);
  if (USE_MOCK) {
    backendOffline = false;
  }
  notifyStateChange();
}

export function isBackendOffline() {
  return backendOffline;
}

export function subscribeApiChanges(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyStateChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

// Initial mock data seeds according to exact specification
const INITIAL_PATIENTS = [
  {
    id: 'p-101',
    name: 'Eleanor Vance',
    risk_score: 0.0,
    active_alerts_count: 0,
    last_updated: '2026-10-28T08:30:00Z',
  },
  {
    id: 'p-102',
    name: 'Arthur Pendelton',
    risk_score: 0.0,
    active_alerts_count: 0,
    last_updated: '2026-10-28T08:30:00Z',
  },
];

const INITIAL_EVENTS = [
  // p-101 events
  {
    event_id: 'ev-501',
    patient_id: 'p-101',
    type: 'lab_order',
    title: 'Comprehensive Metabolic Panel',
    test_type: 'CMP',
    start_time: '2026-10-28T09:00:00Z',
    end_time: '2026-10-28T09:30:00Z',
    status: 'scheduled',
    has_result: false,
  },
  {
    event_id: 'ev-502',
    patient_id: 'p-101',
    type: 'encounter',
    title: 'Physical Therapy Session',
    test_type: null,
    start_time: '2026-10-28T10:00:00Z',
    end_time: '2026-10-28T10:45:00Z',
    status: 'scheduled',
    has_result: false,
  },
  {
    event_id: 'ev-503',
    patient_id: 'p-101',
    type: 'lab_order',
    title: 'HbA1c Blood Test',
    test_type: 'HbA1c',
    start_time: '2026-10-29T09:00:00Z',
    end_time: '2026-10-29T09:30:00Z',
    status: 'scheduled',
    has_result: false,
  },

  // p-102 3 non-overlapping events
  {
    event_id: 'ev-504',
    patient_id: 'p-102',
    type: 'encounter',
    title: 'Cardiology Consultation',
    test_type: null,
    start_time: '2026-10-28T11:00:00Z',
    end_time: '2026-10-28T11:45:00Z',
    status: 'scheduled',
    has_result: false,
  },
  {
    event_id: 'ev-505',
    patient_id: 'p-102',
    type: 'procedure',
    title: 'Echocardiogram',
    test_type: null,
    start_time: '2026-10-28T14:00:00Z',
    end_time: '2026-10-28T14:45:00Z',
    status: 'scheduled',
    has_result: false,
  },
  {
    event_id: 'ev-506',
    patient_id: 'p-102',
    type: 'medication',
    title: 'IV Antibiotic Infusion',
    test_type: null,
    start_time: '2026-10-29T08:00:00Z',
    end_time: '2026-10-29T08:30:00Z',
    status: 'scheduled',
    has_result: false,
  },
];

// In-memory store
let patients = JSON.parse(JSON.stringify(INITIAL_PATIENTS));
let events = JSON.parse(JSON.stringify(INITIAL_EVENTS));
let alerts = [];
let auditLogs = [
  {
    id: 'aud-001',
    alert_id: null,
    patient_id: 'p-101',
    action: 'initial_schedule_loaded',
    performed_by: 'system',
    timestamp: '2026-10-28T08:30:00Z',
    details: 'Initial clinic schedule synchronized from EHR integration.',
    prior_state: null,
    new_state: { events_count: 3, alerts_count: 0 },
  },
];

let nextEventCounter = 991;
let nextAlertCounter = 881;
let nextAuditCounter = 100;

function randomLatency(min = 10, max = 50) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recalculatePatient(patientId) {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return;
  const activeAlerts = alerts.filter((a) => a.patient_id === patientId && a.status === 'pending');
  patient.active_alerts_count = activeAlerts.length;

  if (activeAlerts.length === 0) {
    patient.risk_score = 0.0;
  } else {
    let score = 0;
    activeAlerts.forEach((a) => {
      if (a.severity === 'high') score += 0.55;
      else if (a.severity === 'med') score += 0.35;
      else score += 0.15;
    });
    patient.risk_score = Math.min(1.0, Math.round(score * 100) / 100);
  }
  patient.last_updated = new Date().toISOString();
}

/**
 * Custom API error matching 404 {detail: string} or 422 {detail: [...]}
 */
export class ApiError extends Error {
  constructor(status, detail) {
    const message = typeof detail === 'string' ? detail : JSON.stringify(detail);
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Universal fetch wrapper that falls back to mock if USE_MOCK is true or handles live endpoint
 */
async function apiRequest(path, options = {}) {
  if (USE_MOCK) {
    const lat = randomLatency();
    await delay(lat);
    return null; // Signals mock caller to return in-memory
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    backendOffline = false;

    if (!res.ok) {
      let body;
      try {
        body = await res.json();
      } catch {
        body = { detail: `HTTP error ${res.status}: ${res.statusText}` };
      }
      throw new ApiError(res.status, body.detail || body);
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    const prevOffline = backendOffline;
    backendOffline = true;
    if (!prevOffline) {
      // Notify once on connectivity drop
      setTimeout(notifyStateChange, 50);
    }
    throw new ApiError(503, `Backend offline at ${BASE_URL}. Switch to Mock Mode in header.`);
  }
}

// ---------------- ENDPOINT IMPLEMENTATIONS ----------------

/**
 * GET /patients -> [{id,name,risk_score,active_alerts_count,last_updated}] sorted by risk_score desc
 */
export async function getPatients() {
  if (!USE_MOCK) {
    const data = await apiRequest('/patients');
    return data;
  }

  await delay(randomLatency());
  // Sort descending by risk_score
  return [...patients].sort((a, b) => b.risk_score - a.risk_score);
}

/**
 * GET /patients/{id}/timeline -> [{event_id,patient_id,type,title,test_type,start_time,end_time,status,has_result}]
 */
export async function getPatientTimeline(patientId) {
  if (!USE_MOCK) {
    const data = await apiRequest(`/patients/${patientId}/timeline`);
    return data;
  }

  await delay(randomLatency());
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) {
    throw new ApiError(404, `Patient '${patientId}' not found.`);
  }

  const patientEvents = events
    .filter((e) => e.patient_id === patientId)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  return JSON.parse(JSON.stringify(patientEvents));
}

/**
 * GET /alerts?patient_id=&status= -> [{id,patient_id,type,confidence,severity,reason,status,detected_at}]
 */
export async function getAlerts(filters = {}) {
  const { patient_id = '', status = '' } = filters;

  if (!USE_MOCK) {
    const params = new URLSearchParams();
    if (patient_id) params.set('patient_id', patient_id);
    if (status) params.set('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await apiRequest(`/alerts${qs}`);
    return data;
  }

  await delay(randomLatency());
  let result = [...alerts];

  if (patient_id) {
    result = result.filter((a) => a.patient_id === patient_id);
  }
  if (status) {
    result = result.filter((a) => a.status === status);
  }

  // Sort by detected_at desc
  result.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
  return JSON.parse(JSON.stringify(result));
}

/**
 * GET /patients/{id}/corrected-plan -> {patient_id,resolves_alert_ids,adjustments:[{event_id,action,original_start,proposed_start,proposed_end,reason}]}
 */
export async function getCorrectedPlan(patientId) {
  if (!USE_MOCK) {
    const data = await apiRequest(`/patients/${patientId}/corrected-plan`);
    return data;
  }

  await delay(randomLatency());
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) {
    throw new ApiError(404, `Patient '${patientId}' not found.`);
  }

  const pendingAlerts = alerts.filter((a) => a.patient_id === patientId && a.status === 'pending');
  const patientEvents = events.filter((e) => e.patient_id === patientId && e.status !== 'cancelled');

  const resolvesAlertIds = pendingAlerts.map((a) => a.id);
  const adjustments = [];

  for (const alert of pendingAlerts) {
    if (alert.type === 'conflict') {
      // Find event associated with conflict (e.g. ev-991 Ultrasound Scan or any overlapping event, never ev-502)
      const evCandidate =
        (alert.injected_event_id && patientEvents.find((e) => e.event_id === alert.injected_event_id && e.event_id !== 'ev-502')) ||
        patientEvents.find((e) => e.event_id !== 'ev-502' && alert.reason.includes(e.title) && e.title.includes('Ultrasound')) ||
        patientEvents.find((e) => e.event_id !== 'ev-502' && e.event_id.startsWith('ev-99'));

      if (evCandidate && evCandidate.event_id !== 'ev-502' && !adjustments.some((adj) => adj.event_id === evCandidate.event_id)) {
        // Move the injected event to the earliest open slot of the same length on the same day: 09:30Z-10:00Z
        const proposedStart = '2026-10-28T09:30:00Z';
        const proposedEnd = '2026-10-28T10:00:00Z';

        adjustments.push({
          event_id: evCandidate.event_id,
          action: 'reschedule',
          original_start: evCandidate.start_time,
          proposed_start: proposedStart,
          proposed_end: proposedEnd,
          reason: `Reschedule ${evCandidate.title} to 09:30Z-10:00Z (earliest open slot of the same length on the same day, immediately following Comprehensive Metabolic Panel).`,
        });
      }
    } else if (alert.type === 'duplicate') {
      // The duplicate must always be the newly injected lab_order whose test_type matches an earlier lab_order for the same patient (ev-992). Never flag ev-502.
      let dupCandidate = null;

      // 1. Direct match by injected_event_id if available and valid lab_order
      if (alert.injected_event_id && alert.injected_event_id !== 'ev-502') {
        dupCandidate = patientEvents.find(
          (e) => e.event_id === alert.injected_event_id && e.type === 'lab_order'
        );
      }

      // 2. Find newly injected lab_order whose test_type matches an earlier lab_order for the same patient
      if (!dupCandidate) {
        const labOrders = patientEvents
          .filter((e) => e.type === 'lab_order' && Boolean(e.test_type) && e.event_id !== 'ev-502')
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

        for (let i = 0; i < labOrders.length; i++) {
          for (let j = i + 1; j < labOrders.length; j++) {
            const earlier = labOrders[i];
            const later = labOrders[j];
            if (
              earlier.test_type &&
              later.test_type &&
              earlier.test_type.trim().toUpperCase() === later.test_type.trim().toUpperCase()
            ) {
              dupCandidate = later; // The duplicate must always be the newly injected / later lab_order (ev-992)
              break;
            }
          }
          if (dupCandidate) break;
        }
      }

      // 3. Fallback: only match lab_order with 'Repeat' or 'ev-99', NEVER ev-502
      if (!dupCandidate) {
        dupCandidate = patientEvents.find(
          (e) => e.type === 'lab_order' && e.event_id !== 'ev-502' && (e.title.includes('Repeat') || e.event_id.startsWith('ev-99'))
        );
      }

      if (dupCandidate && dupCandidate.event_id !== 'ev-502' && dupCandidate.type === 'lab_order' && !adjustments.some((adj) => adj.event_id === dupCandidate.event_id)) {
        adjustments.push({
          event_id: dupCandidate.event_id,
          action: 'cancel_duplicate',
          original_start: dupCandidate.start_time,
          proposed_start: null,
          proposed_end: null,
          reason: `Cancel redundant ${dupCandidate.test_type || dupCandidate.title} order within 72 hours of baseline test with pending results. Avoids unnecessary venipuncture.`,
        });
      }
    }
  }

  return {
    patient_id: patientId,
    resolves_alert_ids: resolvesAlertIds,
    adjustments,
  };
}

/**
 * POST /inject {patient_id,anomaly_type,payload} -> 201 {status,injected_event_id,triggered_alert_id,alert,latency_ms}
 */
export async function injectAnomaly(data) {
  const { patient_id, anomaly_type, payload } = data;

  if (!USE_MOCK) {
    const res = await apiRequest('/inject', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  }

  const lat = randomLatency(10, 50);
  await delay(lat);

  if (!patient_id || !anomaly_type) {
    throw new ApiError(422, [{ loc: ['body'], msg: 'patient_id and anomaly_type are required fields', type: 'value_error.missing' }]);
  }

  const patient = patients.find((p) => p.id === patient_id);
  if (!patient) {
    throw new ApiError(404, `Patient '${patient_id}' not found.`);
  }

  let injected_event_id;
  let triggered_alert_id;
  let newEvent;
  let newAlert;

  const eventCounter = nextEventCounter++;
  const alertCounter = nextAlertCounter++;

  if (anomaly_type === 'conflict') {
    injected_event_id = `ev-${eventCounter}`;
    triggered_alert_id = `alt-${alertCounter}`;

    newEvent = {
      event_id: injected_event_id,
      patient_id,
      type: 'procedure',
      title: payload?.title || 'Ultrasound Scan',
      test_type: null,
      start_time: payload?.start_time || '2026-10-28T09:10:00Z',
      end_time: payload?.end_time || '2026-10-28T09:40:00Z',
      status: 'scheduled',
      has_result: false,
    };

    newAlert = {
      id: triggered_alert_id,
      patient_id,
      type: 'conflict',
      confidence: 'Definite',
      severity: 'high',
      reason: 'Ultrasound Scan overlaps with scheduled Comprehensive Metabolic Panel.',
      status: 'pending',
      detected_at: new Date().toISOString(),
      injected_event_id,
    };
  } else if (anomaly_type === 'duplicate') {
    injected_event_id = `ev-${eventCounter}`;
    triggered_alert_id = `alt-${alertCounter}`;
    const testType = payload?.test_type || 'HbA1c';

    newEvent = {
      event_id: injected_event_id,
      patient_id,
      type: 'lab_order',
      title: payload?.title || 'HbA1c Test Repeat',
      test_type: testType,
      start_time: payload?.start_time || '2026-10-29T11:00:00Z',
      end_time: payload?.end_time || '2026-10-29T11:30:00Z',
      status: 'scheduled',
      has_result: false,
    };

    newAlert = {
      id: triggered_alert_id,
      patient_id,
      type: 'duplicate',
      confidence: 'Definite',
      severity: 'med',
      reason: `Duplicate ${testType} lab order within 72 hours, no result yet.`,
      status: 'pending',
      detected_at: new Date().toISOString(),
      injected_event_id,
    };
  } else {
    throw new ApiError(422, [{ loc: ['body', 'anomaly_type'], msg: 'Unsupported anomaly_type. Use conflict or duplicate.', type: 'value_error' }]);
  }

  events.push(newEvent);
  alerts.unshift(newAlert);
  recalculatePatient(patient_id);

  // Audit entry
  auditLogs.unshift({
    id: `aud-${nextAuditCounter++}`,
    alert_id: triggered_alert_id,
    patient_id,
    action: `anomaly_injected_${anomaly_type}`,
    performed_by: 'staff-sim',
    timestamp: new Date().toISOString(),
    details: `Injected ${anomaly_type}: ${newEvent.title} (${injected_event_id}) -> triggered ${triggered_alert_id}`,
    prior_state: { active_alerts_count: patient.active_alerts_count - 1 },
    new_state: {
      injected_event: newEvent,
      triggered_alert: newAlert,
      active_alerts_count: patient.active_alerts_count,
    },
  });

  notifyStateChange();

  return {
    status: 'injected',
    injected_event_id,
    triggered_alert_id,
    alert: newAlert,
    latency_ms: lat,
  };
}

/**
 * POST /alerts/{id}/accept {actor_id,notes} -> {alert_id,status,resolved_at,audit_id}
 */
export async function acceptAlert(alertId, body = {}) {
  const { actor_id = 'staff-04', notes = 'Staff accepted plan adjustment' } = body;

  if (!USE_MOCK) {
    const res = await apiRequest(`/alerts/${alertId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ actor_id, notes }),
    });
    return res;
  }

  await delay(randomLatency());

  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) {
    throw new ApiError(404, `Alert '${alertId}' not found.`);
  }

  const priorState = { ...alert };
  alert.status = 'resolved';
  const resolvedAt = new Date().toISOString();

  // If this alert was a conflict or duplicate, adjust corresponding event in mock store
  if (alert.type === 'conflict') {
    // Reschedule ultrasound or overlapping event (never ev-502)
    const targetEventId = alert.injected_event_id;
    const ev = (targetEventId && events.find((e) => e.event_id === targetEventId && e.event_id !== 'ev-502'))
      || events.find((e) => alert.reason.includes(e.title) && e.title.includes('Ultrasound') && e.event_id !== 'ev-502')
      || events.find((e) => e.patient_id === alert.patient_id && e.event_id.startsWith('ev-99') && e.event_id !== 'ev-502');
    if (ev) {
      ev.start_time = '2026-10-28T09:30:00Z';
      ev.end_time = '2026-10-28T10:00:00Z';
      ev.status = 'scheduled';
    }
  } else if (alert.type === 'duplicate') {
    // Cancel duplicate lab order - must ALWAYS be the newly injected lab_order whose test_type matches earlier lab_order (never ev-502)
    const targetEventId = alert.injected_event_id;
    let ev = (targetEventId && events.find((e) => e.event_id === targetEventId && e.type === 'lab_order' && e.event_id !== 'ev-502')) || null;
    if (!ev) {
      const patientLabOrders = events
        .filter((e) => e.patient_id === alert.patient_id && e.type === 'lab_order' && e.status !== 'cancelled' && e.event_id !== 'ev-502')
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      for (let i = 0; i < patientLabOrders.length; i++) {
        for (let j = i + 1; j < patientLabOrders.length; j++) {
          if (
            patientLabOrders[i].test_type &&
            patientLabOrders[j].test_type &&
            patientLabOrders[i].test_type.trim().toUpperCase() === patientLabOrders[j].test_type.trim().toUpperCase()
          ) {
            ev = patientLabOrders[j];
            break;
          }
        }
        if (ev) break;
      }

      if (!ev) {
        ev = patientLabOrders.find((e) => e.title.includes('Repeat') || e.event_id.startsWith('ev-99'));
      }
    }
    if (ev && ev.event_id !== 'ev-502' && ev.type === 'lab_order') {
      ev.status = 'cancelled';
    }
  }

  recalculatePatient(alert.patient_id);

  const auditId = `aud-${nextAuditCounter++}`;
  auditLogs.unshift({
    id: auditId,
    alert_id: alertId,
    patient_id: alert.patient_id,
    action: 'alert_accepted',
    performed_by: actor_id,
    timestamp: resolvedAt,
    details: `${notes} for alert ${alertId} (${alert.type})`,
    prior_state: priorState,
    new_state: { alert_id: alertId, status: 'resolved', resolved_at: resolvedAt },
  });

  notifyStateChange();

  return {
    alert_id: alertId,
    status: 'resolved',
    resolved_at: resolvedAt,
    audit_id: auditId,
  };
}

/**
 * GET /audit?patient_id= -> newest first [{id,alert_id,patient_id,action,performed_by,timestamp,details,prior_state,new_state}]
 */
export async function getAudit(filters = {}) {
  const { patient_id = '' } = filters;

  if (!USE_MOCK) {
    const params = new URLSearchParams();
    if (patient_id) params.set('patient_id', patient_id);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await apiRequest(`/audit${qs}`);
    return data;
  }

  await delay(randomLatency());

  let result = [...auditLogs];
  if (patient_id) {
    result = result.filter((a) => a.patient_id === patient_id);
  }

  result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return JSON.parse(JSON.stringify(result));
}

/**
 * POST /reset -> {status:"reset",patients:2}
 */
export async function resetDemo() {
  if (!USE_MOCK) {
    const res = await apiRequest('/reset', { method: 'POST' });
    return res;
  }

  await delay(randomLatency());

  patients = JSON.parse(JSON.stringify(INITIAL_PATIENTS));
  events = JSON.parse(JSON.stringify(INITIAL_EVENTS));
  alerts = [];
  auditLogs = [
    {
      id: 'aud-001',
      alert_id: null,
      patient_id: 'p-101',
      action: 'initial_schedule_loaded',
      performed_by: 'system',
      timestamp: '2026-10-28T08:30:00Z',
      details: 'Initial clinic schedule synchronized from EHR integration.',
      prior_state: null,
      new_state: { events_count: 3, alerts_count: 0 },
    },
  ];

  nextEventCounter = 991;
  nextAlertCounter = 881;
  nextAuditCounter = 100;

  notifyStateChange();

  return {
    status: 'reset',
    patients: 2,
  };
}
