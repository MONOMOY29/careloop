/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getCorrectedPlan, getPatientTimeline, acceptAlert } from '../api.js';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { showApiErrorToast, showToast } from '../utils/toast';
import { TimelineEvent } from '../utils/logic';
import {
  GitCompare,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  Clock,
  Ban,
  ShieldCheck,
  User,
  CalendarCheck2,
  CalendarX,
  FileCheck,
} from 'lucide-react';

interface CorrectedPlanPageProps {
  patientId: string;
  onSelectPatient: (id: string) => void;
  patients: Array<{ id: string; name: string }>;
  onPlanAccepted?: () => void;
  onOpenInject?: (patientId: string) => void;
  refreshKey: number;
}

interface Adjustment {
  event_id: string;
  action: 'reschedule' | 'cancel_duplicate';
  original_start: string;
  proposed_start: string | null;
  proposed_end: string | null;
  reason: string;
}

interface PlanResponse {
  patient_id: string;
  resolves_alert_ids: string[];
  adjustments: Adjustment[];
}

export const CorrectedPlanPage: React.FC<CorrectedPlanPageProps> = ({
  patientId,
  onSelectPatient,
  patients,
  onPlanAccepted,
  onOpenInject,
  refreshKey,
}) => {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [accepting, setAccepting] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      getCorrectedPlan(patientId),
      getPatientTimeline(patientId),
    ])
      .then(([planData, timelineData]) => {
        if (mounted) {
          setPlan(planData);
          setEvents(timelineData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          showApiErrorToast(err, 'Failed to fetch corrected plan');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [patientId, refreshKey]);

  const handleAcceptPlan = async () => {
    if (!plan || plan.resolves_alert_ids.length === 0) return;

    setAccepting(true);
    try {
      // Calls POST /alerts/{id}/accept for each alert in resolves_alert_ids with actor_id "staff-04"
      for (const alertId of plan.resolves_alert_ids) {
        await acceptAlert(alertId, {
          actor_id: 'staff-04',
          notes: 'Accepted proposed plan adjustment in Corrected Plan view',
        });
      }

      showToast({
        type: 'success',
        title: 'Plan Accepted Successfully',
        message: `Resolved ${plan.resolves_alert_ids.length} alerts for patient ${patientId} as staff-04.`,
      });

      if (onPlanAccepted) {
        onPlanAccepted();
      }

      // Reload plan and timeline
      const [newPlan, newTimeline] = await Promise.all([
        getCorrectedPlan(patientId),
        getPatientTimeline(patientId),
      ]);
      setPlan(newPlan);
      setEvents(newTimeline);
    } catch (err) {
      showApiErrorToast(err, 'Failed to accept plan');
    } finally {
      setAccepting(false);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return 'N/A';
    try {
      return new Date(iso).toISOString().substring(11, 16) + ' UTC';
    } catch {
      return iso;
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const currentPatient = patients.find((p) => p.id === patientId);

  const hasAdjustments = plan && plan.adjustments && plan.adjustments.length > 0;
  const hasResolves = plan && plan.resolves_alert_ids && plan.resolves_alert_ids.length > 0;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="bg-white border border-teal-100 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <GitCompare className="w-6 h-6 text-teal-700" />
              Corrected Plan: Before vs. After
            </h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
              {patientId}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Compare current conflicting schedule with algorithmic proposed adjustments (rescheduling overlaps and canceling duplicate orders).
          </p>
        </div>

        {/* Patient Switcher & Accept Plan Action */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={patientId}
              onChange={(e) => onSelectPatient(e.target.value)}
              className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
              aria-label="Select Patient"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!hasResolves || accepting}
            onClick={handleAcceptPlan}
            className={`px-4 py-2 rounded-md text-xs font-bold shadow-sm flex items-center gap-2 transition-all ${
              hasResolves && !accepting
                ? 'bg-teal-700 hover:bg-teal-800 text-white cursor-pointer ring-2 ring-teal-600/30'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            {accepting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Applying Plan Adjustments...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Accept Plan ({plan?.resolves_alert_ids.length || 0} Alerts)
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <CardSkeleton count={2} />
      ) : !hasAdjustments && !hasResolves ? (
        <EmptyState
          icon={ShieldCheck}
          title="Schedule is already optimal"
          description={`Patient ${currentPatient?.name || patientId} currently has 0 unresolved alerts. All events are conflict-free and deduplicated.`}
          actionText="Inject Conflict / Duplicate to Test"
          onAction={() => onOpenInject && onOpenInject(patientId)}
        />
      ) : (
        <div className="space-y-6">
          {/* Plan Summary Banner */}
          <div className="bg-teal-50/70 border border-teal-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-teal-700" />
              <span>
                Resolves alerts: <strong>{plan?.resolves_alert_ids.join(', ')}</strong> with actor ID <strong className="font-mono">staff-04</strong>
              </span>
            </div>
            <div className="font-semibold text-teal-900">
              {plan?.adjustments.length} Proposed Modifications
            </div>
          </div>

          {/* Side by side comparison layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: Current State (Before) */}
            <div className="bg-white border-2 border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <CalendarX className="w-4 h-4 text-rose-600" />
                  <span>Current Schedule (Before)</span>
                </div>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                  With Collisions & Duplicates
                </span>
              </div>

              <div className="space-y-3">
                {events.map((event) => {
                  const adjustment = plan?.adjustments.find((a) => a.event_id === event.event_id);
                  const isConflict = adjustment?.action === 'reschedule';
                  const isDuplicate = adjustment?.action === 'cancel_duplicate';

                  let itemClasses = 'bg-slate-50 border-slate-200';
                  if (isConflict) itemClasses = 'bg-rose-50/80 border-rose-300 border-2';
                  if (isDuplicate) itemClasses = 'bg-amber-50/80 border-amber-300 border-2';

                  return (
                    <div
                      key={event.event_id}
                      className={`p-3.5 rounded-lg border transition-all text-xs ${itemClasses}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {event.title}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {event.event_id} | {event.type} {event.test_type ? `(${event.test_type})` : ''}
                          </div>
                        </div>

                        {isConflict && (
                          <span className="font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-rose-600 text-white flex items-center gap-1">
                            <AlertOctagon className="w-3 h-3" /> Overlapping
                          </span>
                        )}
                        {isDuplicate && (
                          <span className="font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-amber-500 text-white flex items-center gap-1">
                            <Ban className="w-3 h-3" /> Duplicate Order
                          </span>
                        )}
                        {!adjustment && (
                          <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                            Nominal
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-slate-600 flex items-center gap-1.5 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                        <span className="text-slate-400 font-sans">({formatDate(event.start_time)})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Proposed Adjusted Plan (After) */}
            <div className="bg-white border-2 border-teal-300 rounded-lg p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-teal-100 pb-3">
                <div className="flex items-center gap-2 font-bold text-sm text-teal-950">
                  <CalendarCheck2 className="w-4 h-4 text-teal-700" />
                  <span>Proposed Resolution (After Plan)</span>
                </div>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                  Adjusted & De-conflicted
                </span>
              </div>

              <div className="space-y-3">
                {events.map((event) => {
                  const adjustment = plan?.adjustments.find((a) => a.event_id === event.event_id);

                  // Reschedule action
                  if (adjustment?.action === 'reschedule') {
                    return (
                      <div
                        key={event.event_id}
                        className="p-3.5 rounded-lg border-2 border-emerald-400 bg-emerald-50 text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-emerald-950 text-sm">
                              {event.title}
                            </div>
                            <div className="font-mono text-[11px] text-emerald-700">
                              {event.event_id} | Rescheduled Session
                            </div>
                          </div>
                          <span className="font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-700 text-white">
                            Rescheduled
                          </span>
                        </div>

                        {/* Shows original_start to proposed_start */}
                        <div className="bg-white/80 p-2.5 rounded border border-emerald-200 flex items-center gap-2 text-xs font-mono">
                          <span className="line-through text-slate-400">
                            {formatTime(adjustment.original_start)}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="font-bold text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded">
                            {formatTime(adjustment.proposed_start)} - {formatTime(adjustment.proposed_end)}
                          </span>
                          <span className="text-[11px] text-slate-500 font-sans">
                            ({formatDate(adjustment.proposed_start)})
                          </span>
                        </div>

                        <div className="text-[11px] text-emerald-900 leading-relaxed font-medium">
                          <strong>Rationale: </strong> {adjustment.reason}
                        </div>
                      </div>
                    );
                  }

                  // Cancel duplicate action: shows event struck through with reason
                  if (adjustment?.action === 'cancel_duplicate') {
                    return (
                      <div
                        key={event.event_id}
                        className="p-3.5 rounded-lg border-2 border-slate-300 bg-slate-100 text-xs space-y-2 opacity-80"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-500 text-sm line-through">
                              {event.title}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400 line-through">
                              {event.event_id} | {event.type} ({event.test_type})
                            </div>
                          </div>
                          <span className="font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-rose-600 text-white flex items-center gap-1">
                            <Ban className="w-3 h-3" /> Cancel Duplicate
                          </span>
                        </div>

                        <div className="line-through text-slate-400 font-mono text-[11px]">
                          Originally scheduled: {formatTime(adjustment.original_start)}
                        </div>

                        <div className="text-[11px] text-slate-700 bg-white/70 p-2 rounded border border-slate-200 leading-relaxed">
                          <strong className="text-rose-700">Reason for cancellation: </strong> {adjustment.reason}
                        </div>
                      </div>
                    );
                  }

                  // Unchanged nominal events
                  return (
                    <div
                      key={event.event_id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-800 text-sm">
                            {event.title}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {event.event_id} | Retained As Scheduled
                          </div>
                        </div>
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                          Retained
                        </span>
                      </div>
                      <div className="mt-2 text-slate-600 flex items-center gap-1.5 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                        <span className="text-slate-400 font-sans">({formatDate(event.start_time)})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
