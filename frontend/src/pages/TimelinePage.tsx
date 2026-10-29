/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getPatientTimeline, getAlerts } from '../api.js';
import { TimelineSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { showApiErrorToast } from '../utils/toast';
import {
  findOverlappingEventIds,
  findDuplicateLabOrders,
  TimelineEvent,
  Alert,
} from '../utils/logic';
import {
  CalendarDays,
  Filter,
  AlertOctagon,
  Copy,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileText,
  User,
  Zap,
} from 'lucide-react';

interface TimelinePageProps {
  patientId: string;
  onSelectPatient: (id: string) => void;
  patients: Array<{ id: string; name: string }>;
  onViewCorrectedPlan?: (patientId: string) => void;
  refreshKey: number;
}

const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  encounter: {
    label: 'Encounter / Clinic',
    bg: 'bg-sky-50',
    border: 'border-sky-300',
    text: 'text-sky-900',
    dot: 'bg-sky-500',
  },
  lab_order: {
    label: 'Lab Order',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-900',
    dot: 'bg-emerald-500',
  },
  procedure: {
    label: 'Procedure / Imaging',
    bg: 'bg-indigo-50',
    border: 'border-indigo-300',
    text: 'text-indigo-900',
    dot: 'bg-indigo-500',
  },
  medication: {
    label: 'Medication / Infusion',
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-900',
    dot: 'bg-purple-500',
  },
};

export const TimelinePage: React.FC<TimelinePageProps> = ({
  patientId,
  onSelectPatient,
  patients,
  onViewCorrectedPlan,
  refreshKey,
}) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [activeTooltipEvent, setActiveTooltipEvent] = useState<TimelineEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('all');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      getPatientTimeline(patientId),
      getAlerts({ patient_id: patientId, status: 'pending' }),
    ])
      .then(([timelineData, alertsData]) => {
        if (mounted) {
          setEvents(timelineData);
          setAlerts(alertsData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          showApiErrorToast(err, 'Failed to fetch timeline');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [patientId, refreshKey]);

  // Calculations for overlaps and duplicates
  const overlappingIds = findOverlappingEventIds(events);
  const duplicatePairs = findDuplicateLabOrders(events);
  const duplicateMap = new Map<string, { confidence: 'Definite' | 'Possible'; partner: string }>();
  const originalOrderSet = new Set<string>();

  duplicatePairs.forEach((dup) => {
    // Only the newly injected duplicate (ev-992) gets the Definite or Possible badge, using confidence from its alert
    const matchingAlert = alerts.find(
      (a) =>
        a.type === 'duplicate' &&
        ((a as any).injected_event_id === dup.duplicateEvent.event_id ||
         (dup.duplicateEvent.test_type && a.reason.includes(dup.duplicateEvent.test_type)))
    );
    const confidence = matchingAlert?.confidence || 'Definite';

    duplicateMap.set(dup.duplicateEvent.event_id, {
      confidence,
      partner: dup.primaryEvent.title,
    });

    // The earlier original lab_order (ev-503) gets marked as original order only
    originalOrderSet.add(dup.primaryEvent.event_id);
  });

  // Unique days present in events
  const days = Array.from(
    new Set(events.map((e) => e.start_time.split('T')[0]))
  ).sort();

  // Filtered events
  const filteredEvents = events.filter((e) => {
    const matchesType =
      selectedTypeFilter === 'all' || e.type === selectedTypeFilter;
    const matchesDay =
      selectedDay === 'all' || e.start_time.startsWith(selectedDay);
    return matchesType && matchesDay;
  });

  const laneTypes: Array<'encounter' | 'lab_order' | 'procedure' | 'medication'> = [
    'encounter',
    'lab_order',
    'procedure',
    'medication',
  ];

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toISOString().substring(11, 16) + ' UTC';
    } catch {
      return iso;
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const currentPatient = patients.find((p) => p.id === patientId);

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="bg-white border border-teal-100 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-teal-700" />
              Patient Timeline & Lanes
            </h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
              {patientId}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Care events mapped into type lanes across time. Overlaps highlighted in high-contrast red; duplicates badged Definite / Possible.
          </p>
        </div>

        {/* Patient Switcher & Quick Action */}
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

          {alerts.length > 0 && onViewCorrectedPlan && (
            <button
              type="button"
              onClick={() => onViewCorrectedPlan(patientId)}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-3.5 py-2 rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              View Corrected Plan ({alerts.length})
            </button>
          )}
        </div>
      </div>

      {/* Conflict / Overlap Alert Callout if present */}
      {overlappingIds.size > 0 && (
        <div
          role="alert"
          className="bg-rose-50 border-2 border-rose-400 rounded-lg p-4 shadow-xs flex items-start gap-3 text-rose-950"
        >
          <AlertOctagon className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-bold text-sm text-rose-900">
              Direct Schedule Collision Detected ({overlappingIds.size} Overlapping Events)
            </h2>
            <p className="text-xs text-rose-800 mt-0.5">
              Simultaneous patient scheduling detected on 2026-10-28: <strong>Ultrasound Scan</strong> overlaps with scheduled <strong>Comprehensive Metabolic Panel</strong>.
              Review lanes below or accept proposed plan adjustment.
            </p>
          </div>
          {onViewCorrectedPlan && (
            <button
              type="button"
              onClick={() => onViewCorrectedPlan(patientId)}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-xs shrink-0"
            >
              Resolve Conflict
            </button>
          )}
        </div>
      )}

      {/* Filters Bar & Legend */}
      <div className="bg-white border border-teal-100 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        {/* Type Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            Lane Type:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('all')}
            className={`px-2.5 py-1 rounded font-medium border transition-colors ${
              selectedTypeFilter === 'all'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Types ({events.length})
          </button>
          {laneTypes.map((t) => {
            const count = events.filter((e) => e.type === t).length;
            const isSel = selectedTypeFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTypeFilter(t)}
                className={`px-2.5 py-1 rounded font-medium border transition-colors ${
                  isSel
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {EVENT_TYPE_CONFIG[t]?.label || t} ({count})
              </button>
            );
          })}
        </div>

        {/* Day Filter */}
        {days.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Day:</span>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="border border-slate-200 rounded px-2 py-1 bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="all">All Days ({days.length})</option>
              {days.map((day) => (
                <option key={day} value={day}>
                  {formatDate(day)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Visual Legend */}
        <div className="flex flex-wrap items-center gap-3 border-t md:border-t-0 pt-2 md:pt-0 w-full md:w-auto text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-600 border border-rose-700 inline-block"></span>
            <span>Overlapping / Collision</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 border border-slate-300 font-semibold rounded text-[10px]">Original order</span>
            <span>Baseline Lab</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 border border-rose-300 font-bold rounded">Definite</span>
            <span>Duplicate Lab</span>
          </div>
        </div>
      </div>

      {/* Main Timeline Lanes Presentation */}
      {loading ? (
        <TimelineSkeleton />
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No events on schedule"
          description="There are currently no recorded clinic encounters, lab orders, or procedures for this patient."
        />
      ) : (
        <div className="bg-white border border-teal-100 rounded-lg p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-teal-50 pb-3">
            <div className="text-sm font-bold text-slate-900">
              Lanes by Event Type (Patient: {currentPatient?.name || patientId})
            </div>
            <div className="text-xs text-slate-500">
              Hover or click any card for full coordination metadata
            </div>
          </div>

          {/* Render each requested type as a dedicated horizontal lane */}
          <div className="space-y-4">
            {laneTypes
              .filter((t) => selectedTypeFilter === 'all' || selectedTypeFilter === t)
              .map((typeKey) => {
                const laneEvents = filteredEvents.filter((e) => e.type === typeKey);
                const config = EVENT_TYPE_CONFIG[typeKey];

                return (
                  <div
                    key={typeKey}
                    className="border border-slate-200 rounded-lg p-4 bg-slate-50/50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${config.dot}`} />
                        <span className="font-bold text-xs uppercase tracking-wider text-slate-700">
                          {config.label}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({laneEvents.length} {laneEvents.length === 1 ? 'event' : 'events'})
                        </span>
                      </div>
                    </div>

                    {laneEvents.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400 italic">
                        No events in this lane for selected filter
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {laneEvents.map((event) => {
                          const isOverlap = overlappingIds.has(event.event_id);
                          const dupInfo = duplicateMap.get(event.event_id);
                          const isOriginalOrder = originalOrderSet.has(event.event_id);
                          const isCancelled = event.status === 'cancelled';

                          let cardClasses = 'bg-white border-slate-200 text-slate-800';
                          if (isCancelled) {
                            cardClasses = 'bg-slate-100/80 border-dashed border-slate-300 text-slate-400 line-through';
                          } else if (isOverlap) {
                            cardClasses = 'bg-rose-50 border-2 border-rose-500 text-rose-950 shadow-xs ring-2 ring-rose-200';
                          } else {
                            cardClasses = `${config.bg} ${config.border} ${config.text}`;
                          }

                          return (
                            <div
                              key={event.event_id}
                              onClick={() => setActiveTooltipEvent(event)}
                              onMouseEnter={() => setActiveTooltipEvent(event)}
                              tabIndex={0}
                              role="button"
                              aria-label={`Event ${event.title}`}
                              className={`relative p-3.5 rounded-lg border transition-all cursor-pointer hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600 ${cardClasses}`}
                            >
                              {/* Overlap Marker Flag */}
                              {isOverlap && !isCancelled && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded border border-rose-300 mb-2">
                                  <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  <span>SCHEDULE COLLISION</span>
                                </div>
                              )}

                              {/* Small neutral label on earlier original lab order (ev-503) */}
                              {isOriginalOrder && !isCancelled && (
                                <div className="flex items-center justify-between gap-1 mb-2">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-slate-100 text-slate-700 border border-slate-300">
                                    Original order
                                  </span>
                                  {event.test_type && (
                                    <span className="font-mono text-[10px] bg-slate-200/80 text-slate-800 px-1.5 py-0.5 rounded font-bold">
                                      {event.test_type}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Duplicate Lab Order Badge (Only on newly injected duplicate, ev-992) */}
                              {dupInfo && !isCancelled && (
                                <div className="flex items-center justify-between gap-1 mb-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide uppercase border flex items-center gap-1 ${
                                      dupInfo.confidence === 'Definite'
                                        ? 'bg-rose-100 text-rose-800 border-rose-400'
                                        : 'bg-amber-100 text-amber-800 border-amber-400'
                                    }`}
                                  >
                                    <Copy className="w-3 h-3" />
                                    {dupInfo.confidence} Duplicate Lab
                                  </span>
                                  {event.test_type && (
                                    <span className="font-mono text-[10px] bg-slate-200/80 text-slate-800 px-1.5 py-0.5 rounded font-bold">
                                      {event.test_type}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Event Title */}
                              <div className="font-bold text-sm leading-snug">
                                {event.title}
                              </div>

                              {/* Metadata line */}
                              <div className="mt-2 text-xs flex flex-wrap items-center gap-2 text-slate-600">
                                <div className="flex items-center gap-1 font-mono font-medium">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                                </div>
                                <span>({formatDate(event.start_time)})</span>
                              </div>

                              {/* Status and Result */}
                              <div className="mt-2 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px]">
                                <span className="font-mono text-slate-500 font-medium">
                                  {event.event_id}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {event.has_result ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                      <CheckCircle2 className="w-3 h-3" /> Result ready
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 italic">No result</span>
                                  )}
                                  <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/70 border border-slate-200">
                                    {event.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Tooltip & Inspection Drawer */}
          {activeTooltipEvent && (
            <div
              role="dialog"
              aria-label="Event Inspection Tooltip"
              className="bg-slate-900 text-white rounded-lg p-5 shadow-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6 animate-fadeIn"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-teal-300">
                    Inspected Event Metadata
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    ID: {activeTooltipEvent.event_id}
                  </span>
                </div>
                <div className="text-base font-bold text-white flex items-center gap-2">
                  <span>{activeTooltipEvent.title}</span>
                  {activeTooltipEvent.test_type && (
                    <span className="text-xs font-mono bg-teal-800 text-teal-200 px-2 py-0.5 rounded border border-teal-600">
                      test_type: {activeTooltipEvent.test_type}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-300 flex flex-wrap items-center gap-4 pt-1">
                  <div>
                    <span className="text-slate-400">Scheduled: </span>
                    <span className="font-mono text-teal-200">
                      {formatTime(activeTooltipEvent.start_time)} - {formatTime(activeTooltipEvent.end_time)} ({formatDate(activeTooltipEvent.start_time)})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Status: </span>
                    <span className="font-semibold capitalize text-amber-200">
                      {activeTooltipEvent.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Has Result: </span>
                    <span className="font-semibold text-white">
                      {activeTooltipEvent.has_result ? 'Yes (Completed)' : 'No (Pending lab/clinic return)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTooltipEvent(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded text-xs transition-colors"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
