import test from 'node:test';
import assert from 'node:assert/strict';
import {
  doEventsOverlap,
  findOverlappingEventIds,
  findDuplicateLabOrders,
  calculateRiskScore,
  createCorrectedPlan,
  TimelineEvent,
  Alert,
} from './logic';

test('doEventsOverlap detects overlapping intervals correctly', () => {
  const overlap = doEventsOverlap(
    '2026-10-28T09:00:00Z',
    '2026-10-28T09:30:00Z',
    '2026-10-28T09:10:00Z',
    '2026-10-28T09:40:00Z'
  );
  assert.equal(overlap, true);

  const adjacent = doEventsOverlap(
    '2026-10-28T09:00:00Z',
    '2026-10-28T09:30:00Z',
    '2026-10-28T09:30:00Z',
    '2026-10-28T10:00:00Z'
  );
  assert.equal(adjacent, false);

  const separated = doEventsOverlap(
    '2026-10-28T09:00:00Z',
    '2026-10-28T09:30:00Z',
    '2026-10-28T10:00:00Z',
    '2026-10-28T10:45:00Z'
  );
  assert.equal(separated, false);
});

test('findOverlappingEventIds marks both overlapping events', () => {
  const events: TimelineEvent[] = [
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
      event_id: 'ev-991',
      patient_id: 'p-101',
      type: 'procedure',
      title: 'Ultrasound Scan',
      test_type: null,
      start_time: '2026-10-28T09:10:00Z',
      end_time: '2026-10-28T09:40:00Z',
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
  ];

  const overlapping = findOverlappingEventIds(events);
  assert.equal(overlapping.has('ev-501'), true);
  assert.equal(overlapping.has('ev-991'), true);
  assert.equal(overlapping.has('ev-502'), false);
});

test('findDuplicateLabOrders detects duplicate tests within 72h window without results', () => {
  const events: TimelineEvent[] = [
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
    {
      event_id: 'ev-992',
      patient_id: 'p-101',
      type: 'lab_order',
      title: 'HbA1c Test Repeat',
      test_type: 'HbA1c',
      start_time: '2026-10-29T11:00:00Z',
      end_time: '2026-10-29T11:30:00Z',
      status: 'scheduled',
      has_result: false,
    },
  ];

  const dups = findDuplicateLabOrders(events);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].primaryEvent.event_id, 'ev-503');
  assert.equal(dups[0].duplicateEvent.event_id, 'ev-992');
});

test('calculateRiskScore returns 0 when no pending alerts and aggregates severity', () => {
  assert.equal(calculateRiskScore([]), 0.0);

  const alerts: Alert[] = [
    {
      id: 'alt-881',
      patient_id: 'p-101',
      type: 'conflict',
      confidence: 'Definite',
      severity: 'high',
      reason: 'Overlapping',
      status: 'pending',
      detected_at: '2026-10-28T11:00:00Z',
    },
  ];
  assert.equal(calculateRiskScore(alerts), 0.55);

  const resolvedAlerts: Alert[] = [
    {
      id: 'alt-881',
      patient_id: 'p-101',
      type: 'conflict',
      confidence: 'Definite',
      severity: 'high',
      reason: 'Overlapping',
      status: 'resolved',
      detected_at: '2026-10-28T11:00:00Z',
    },
  ];
  assert.equal(calculateRiskScore(resolvedAlerts), 0.0);
});

test('createCorrectedPlan produces reschedule and cancel_duplicate actions', () => {
  const events: TimelineEvent[] = [
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
      event_id: 'ev-991',
      patient_id: 'p-101',
      type: 'procedure',
      title: 'Ultrasound Scan',
      test_type: null,
      start_time: '2026-10-28T09:10:00Z',
      end_time: '2026-10-28T09:40:00Z',
      status: 'scheduled',
      has_result: false,
    },
  ];

  const alerts: Alert[] = [
    {
      id: 'alt-881',
      patient_id: 'p-101',
      type: 'conflict',
      confidence: 'Definite',
      severity: 'high',
      reason: 'Ultrasound Scan overlaps with scheduled Comprehensive Metabolic Panel.',
      status: 'pending',
      detected_at: '2026-10-28T11:00:00Z',
    },
  ];

  const plan = createCorrectedPlan('p-101', events, alerts);
  assert.equal(plan.patient_id, 'p-101');
  assert.deepEqual(plan.resolves_alert_ids, ['alt-881']);
  assert.equal(plan.adjustments.length, 1);
  assert.equal(plan.adjustments[0].action, 'reschedule');
  assert.equal(plan.adjustments[0].event_id, 'ev-991');
  assert.equal(new Date(plan.adjustments[0].proposed_start!).toISOString(), '2026-10-28T09:30:00.000Z');
  assert.equal(new Date(plan.adjustments[0].proposed_end!).toISOString(), '2026-10-28T10:00:00.000Z');
  assert.ok(plan.adjustments[0].reason.includes('09:30Z-10:00Z'));
});
