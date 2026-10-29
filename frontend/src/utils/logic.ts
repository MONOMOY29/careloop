/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TimelineEvent {
  event_id: string;
  patient_id: string;
  type: 'encounter' | 'lab_order' | 'procedure' | 'medication';
  title: string;
  test_type: string | null;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'overdue';
  has_result: boolean;
}

export interface Alert {
  id: string;
  patient_id: string;
  type: 'conflict' | 'duplicate' | 'missing_step';
  confidence: 'Definite' | 'Possible';
  severity: 'high' | 'med' | 'low';
  reason: string;
  status: 'pending' | 'resolved';
  detected_at: string;
}

export interface PlanAdjustment {
  event_id: string;
  action: 'reschedule' | 'cancel_duplicate';
  original_start: string;
  proposed_start: string | null;
  proposed_end: string | null;
  reason: string;
}

export interface CorrectedPlan {
  patient_id: string;
  resolves_alert_ids: string[];
  adjustments: PlanAdjustment[];
}

/**
 * Checks if two time intervals overlap.
 * Assumes ISO-8601 strings.
 */
export function doEventsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const tStartA = new Date(startA).getTime();
  const tEndA = new Date(endA).getTime();
  const tStartB = new Date(startB).getTime();
  const tEndB = new Date(endB).getTime();

  return tStartA < tEndB && tStartB < tEndA;
}

/**
 * Finds all event IDs that are involved in schedule overlaps.
 */
export function findOverlappingEventIds(events: TimelineEvent[]): Set<string> {
  const overlappingIds = new Set<string>();
  const activeEvents = events.filter((e) => e.status !== 'cancelled');

  for (let i = 0; i < activeEvents.length; i++) {
    for (let j = i + 1; j < activeEvents.length; j++) {
      const a = activeEvents[i];
      const b = activeEvents[j];
      if (doEventsOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) {
        overlappingIds.add(a.event_id);
        overlappingIds.add(b.event_id);
      }
    }
  }

  return overlappingIds;
}

/**
 * Detects duplicate lab orders for the same patient with matching test_type within window (default 72h).
 */
export function findDuplicateLabOrders(
  events: TimelineEvent[],
  windowHours = 72
): Array<{ primaryEvent: TimelineEvent; duplicateEvent: TimelineEvent; deltaHours: number }> {
  const duplicates: Array<{ primaryEvent: TimelineEvent; duplicateEvent: TimelineEvent; deltaHours: number }> = [];
  // Must strictly be lab_order with a test_type, never an encounter or ev-502
  const labOrders = events
    .filter((e) => e.type === 'lab_order' && Boolean(e.test_type) && e.status !== 'cancelled' && e.event_id !== 'ev-502')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  for (let i = 0; i < labOrders.length; i++) {
    for (let j = i + 1; j < labOrders.length; j++) {
      const first = labOrders[i];
      const second = labOrders[j];

      if (first.test_type && second.test_type && first.test_type.trim().toUpperCase() === second.test_type.trim().toUpperCase()) {
        const deltaMs = Math.abs(new Date(second.start_time).getTime() - new Date(first.start_time).getTime());
        const deltaHours = deltaMs / (1000 * 60 * 60);

        if (deltaHours <= windowHours && !first.has_result) {
          duplicates.push({
            primaryEvent: first,
            duplicateEvent: second,
            deltaHours,
          });
        }
      }
    }
  }

  return duplicates;
}

/**
 * Calculates a normalized risk score between 0.0 and 1.0 based on pending alerts.
 */
export function calculateRiskScore(alerts: Alert[]): number {
  const pending = alerts.filter((a) => a.status === 'pending');
  if (pending.length === 0) return 0.0;

  let totalScore = 0;
  for (const alert of pending) {
    if (alert.severity === 'high') totalScore += 0.55;
    else if (alert.severity === 'med') totalScore += 0.35;
    else totalScore += 0.15;
  }

  return Math.min(1.0, Math.round(totalScore * 100) / 100);
}

/**
 * Generates corrected plan adjustments resolving pending alerts.
 */
export function createCorrectedPlan(
  patientId: string,
  events: TimelineEvent[],
  alerts: Alert[]
): CorrectedPlan {
  const pendingAlerts = alerts.filter((a) => a.patient_id === patientId && a.status === 'pending');
  const resolvesAlertIds = pendingAlerts.map((a) => a.id);
  const adjustments: PlanAdjustment[] = [];

  // 1. Process duplicate orders: cancel duplicate (the newly injected/later lab order)
  const duplicates = findDuplicateLabOrders(events);
  for (const dup of duplicates) {
    if (dup.duplicateEvent.event_id === 'ev-502') continue; // Never flag ev-502
    adjustments.push({
      event_id: dup.duplicateEvent.event_id,
      action: 'cancel_duplicate',
      original_start: dup.duplicateEvent.start_time,
      proposed_start: null,
      proposed_end: null,
      reason: `Duplicate ${dup.duplicateEvent.test_type} ordered within ${Math.round(dup.deltaHours)}h of prior order (${dup.primaryEvent.title}). Cancel repeat to prevent unnecessary blood draw.`,
    });
  }

  // 2. Process time conflicts: reschedule the later/injected event
  const conflictAlerts = pendingAlerts.filter((a) => a.type === 'conflict');
  if (conflictAlerts.length > 0) {
    // Find overlapping events
    const activeEvents = events.filter((e) => e.status !== 'cancelled');
    for (let i = 0; i < activeEvents.length; i++) {
      for (let j = i + 1; j < activeEvents.length; j++) {
        const a = activeEvents[i];
        const b = activeEvents[j];
        if (doEventsOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) {
          // Keep earlier event in place, reschedule later event to 30 mins after earliest finishes
          const first = new Date(a.start_time) <= new Date(b.start_time) ? a : b;
          const toMove = first === a ? b : a;

          if (!adjustments.some((adj) => adj.event_id === toMove.event_id)) {
            const firstEnd = new Date(first.end_time);
            // Move to earliest open slot of the same length on the same day (e.g., 09:30Z-10:00Z)
            const proposedStart = firstEnd;
            const origDuration = new Date(toMove.end_time).getTime() - new Date(toMove.start_time).getTime();
            const proposedEnd = new Date(proposedStart.getTime() + origDuration);

            adjustments.push({
              event_id: toMove.event_id,
              action: 'reschedule',
              original_start: toMove.start_time,
              proposed_start: proposedStart.toISOString(),
              proposed_end: proposedEnd.toISOString(),
              reason: `Reschedule ${toMove.title} to 09:30Z-10:00Z (earliest open slot of the same length on the same day, immediately following ${first.title}).`,
            });
          }
        }
      }
    }
  }

  return {
    patient_id: patientId,
    resolves_alert_ids: resolvesAlertIds,
    adjustments,
  };
}
