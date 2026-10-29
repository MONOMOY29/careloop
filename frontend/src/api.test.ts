import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPatients,
  getPatientTimeline,
  getAlerts,
  getCorrectedPlan,
  injectAnomaly,
  acceptAlert,
  getAudit,
  resetDemo,
  setUseMock,
} from './api.js';

test('api resetDemo restores Eleanor Vance and Arthur Pendelton seeds', async () => {
  setUseMock(true);
  const resetRes = await resetDemo();
  assert.equal(resetRes.status, 'reset');
  assert.equal(resetRes.patients, 2);

  const patients = await getPatients();
  assert.equal(patients.length, 2);
  const eleanor = patients.find((p: any) => p.id === 'p-101');
  assert.ok(eleanor);
  assert.equal(eleanor.name, 'Eleanor Vance');
  assert.equal(eleanor.risk_score, 0.0);
  assert.equal(eleanor.active_alerts_count, 0);

  const arthur = patients.find((p: any) => p.id === 'p-102');
  assert.ok(arthur);
  assert.equal(arthur.name, 'Arthur Pendelton');
  assert.equal(arthur.risk_score, 0.0);
});

test('api getPatientTimeline returns 3 events for p-101 with exact seeds', async () => {
  await resetDemo();
  const timeline = await getPatientTimeline('p-101');
  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].event_id, 'ev-501');
  assert.equal(timeline[0].type, 'lab_order');
  assert.equal(timeline[0].test_type, 'CMP');
  assert.equal(timeline[1].event_id, 'ev-502');
  assert.equal(timeline[1].type, 'encounter');
  assert.equal(timeline[2].event_id, 'ev-503');
  assert.equal(timeline[2].test_type, 'HbA1c');
});

test('api injectAnomaly conflict adds ev-991 and alt-881 with high severity', async () => {
  await resetDemo();
  const injectRes = await injectAnomaly({
    patient_id: 'p-101',
    anomaly_type: 'conflict',
    payload: {
      title: 'Ultrasound Scan',
      start_time: '2026-10-28T09:10:00Z',
      end_time: '2026-10-28T09:40:00Z',
    },
  });

  assert.equal(injectRes.status, 'injected');
  assert.equal(injectRes.injected_event_id, 'ev-991');
  assert.equal(injectRes.triggered_alert_id, 'alt-881');
  assert.equal(injectRes.alert.severity, 'high');
  assert.equal(injectRes.alert.confidence, 'Definite');
  assert.ok(injectRes.latency_ms >= 10 && injectRes.latency_ms <= 50);

  const patients = await getPatients();
  const eleanor = patients.find((p: any) => p.id === 'p-101');
  assert.ok(eleanor.risk_score > 0);
  assert.equal(eleanor.active_alerts_count, 1);
});

test('api injectAnomaly duplicate adds ev-992 and alt-882 with med severity', async () => {
  const injectRes = await injectAnomaly({
    patient_id: 'p-101',
    anomaly_type: 'duplicate',
    payload: {
      title: 'HbA1c Test Repeat',
      test_type: 'HbA1c',
      start_time: '2026-10-29T11:00:00Z',
      end_time: '2026-10-29T11:30:00Z',
    },
  });

  assert.equal(injectRes.status, 'injected');
  assert.equal(injectRes.injected_event_id, 'ev-992');
  assert.equal(injectRes.triggered_alert_id, 'alt-882');
  assert.equal(injectRes.alert.severity, 'med');
});

test('api getCorrectedPlan and acceptAlert resolves alert and updates audit log', async () => {
  const plan = await getCorrectedPlan('p-101');
  assert.equal(plan.patient_id, 'p-101');
  assert.ok(plan.resolves_alert_ids.includes('alt-881'));

  const acceptRes = await acceptAlert('alt-881', { actor_id: 'staff-04', notes: 'Accepted reschedule' });
  assert.equal(acceptRes.status, 'resolved');
  assert.ok(acceptRes.audit_id);

  const audits = await getAudit({ patient_id: 'p-101' });
  const acceptedAudit = audits.find((a: any) => a.alert_id === 'alt-881');
  assert.ok(acceptedAudit);
  assert.equal(acceptedAudit.performed_by, 'staff-04');
});

test('api getCorrectedPlan cancel_duplicate always targets newly injected lab order ev-992 and NEVER ev-502', async () => {
  await resetDemo();
  // Inject conflict (ev-991, alt-881)
  await injectAnomaly({
    patient_id: 'p-101',
    anomaly_type: 'conflict',
    payload: {
      title: 'Ultrasound Scan',
      start_time: '2026-10-28T09:10:00Z',
      end_time: '2026-10-28T09:40:00Z',
    },
  });
  // Inject duplicate (ev-992, alt-882)
  await injectAnomaly({
    patient_id: 'p-101',
    anomaly_type: 'duplicate',
    payload: {
      title: 'HbA1c Test Repeat',
      test_type: 'HbA1c',
      start_time: '2026-10-29T11:00:00Z',
      end_time: '2026-10-29T11:30:00Z',
    },
  });

  const plan = await getCorrectedPlan('p-101');
  assert.equal(plan.adjustments.length, 2);

  // 1. Reschedule must target ev-991 to earliest open slot 09:30Z-10:00Z
  const rescheduleAdj = plan.adjustments.find((a: any) => a.action === 'reschedule');
  assert.ok(rescheduleAdj);
  assert.equal(rescheduleAdj.event_id, 'ev-991');
  assert.equal(rescheduleAdj.proposed_start, '2026-10-28T09:30:00Z');
  assert.equal(rescheduleAdj.proposed_end, '2026-10-28T10:00:00Z');
  assert.ok(rescheduleAdj.reason.includes('09:30Z-10:00Z'));

  // 2. Cancel duplicate must target ev-992 and NEVER ev-502
  const cancelAdj = plan.adjustments.find((a: any) => a.action === 'cancel_duplicate');
  assert.ok(cancelAdj);
  assert.equal(cancelAdj.event_id, 'ev-992');
  assert.notEqual(cancelAdj.event_id, 'ev-502');

  // Ensure ev-502 has NO adjustments
  const ptAdj = plan.adjustments.find((a: any) => a.event_id === 'ev-502');
  assert.equal(ptAdj, undefined);
});

