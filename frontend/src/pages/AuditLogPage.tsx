/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getAudit } from '../api.js';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { showApiErrorToast } from '../utils/toast';
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  ShieldCheck,
  Search,
  Filter,
} from 'lucide-react';

interface AuditEntry {
  id: string;
  alert_id: string | null;
  patient_id: string;
  action: string;
  performed_by: string;
  timestamp: string;
  details: string;
  prior_state: any;
  new_state: any;
}

interface AuditLogPageProps {
  patients: Array<{ id: string; name: string }>;
  refreshKey: number;
}

function formatState(val: any): string {
  if (val === null || val === undefined) {
    return '// None';
  }
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2);
  }
  return String(val);
}

export const AuditLogPage: React.FC<AuditLogPageProps> = ({
  patients,
  refreshKey,
}) => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [patientFilter, setPatientFilter] = useState<string>('all');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const filters: { patient_id?: string } = {};
    if (patientFilter !== 'all') filters.patient_id = patientFilter;

    getAudit(filters)
      .then((data) => {
        if (mounted) {
          setLogs(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          showApiErrorToast(err, 'Failed to fetch audit trail');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [patientFilter, refreshKey]);

  const toggleRow = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' +
        d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('accepted')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          Alert Accepted
        </span>
      );
    }
    if (action.includes('conflict')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
          Conflict Injected
        </span>
      );
    }
    if (action.includes('duplicate')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          Duplicate Injected
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
        {action.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white border border-teal-100 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-teal-700" />
            Coordination Audit & Traceability Log
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Complete append-only log of scheduling overrides, plan acceptances, and anomaly injections. Expand any row to inspect prior and new state.
          </p>
        </div>

        {/* Filter by Patient */}
        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-semibold text-slate-700">Filter Patient:</span>
          <select
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-teal-600"
            aria-label="Filter audit by patient"
          >
            <option value="all">All Patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Table */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit entries"
          description="There are currently no recorded action events for the selected patient."
        />
      ) : (
        <div className="bg-white border border-teal-100 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" aria-label="Audit Log Table">
              <thead>
                <tr className="bg-teal-50/70 border-b border-teal-100 text-xs font-semibold text-teal-900 uppercase tracking-wider">
                  <th scope="col" className="w-8 py-3.5 pl-4 pr-1"></th>
                  <th scope="col" className="py-3.5 px-3">Time</th>
                  <th scope="col" className="py-3.5 px-3">Patient</th>
                  <th scope="col" className="py-3.5 px-3">Action</th>
                  <th scope="col" className="py-3.5 px-3">Performed By</th>
                  <th scope="col" className="py-3.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map((entry) => {
                  const isExpanded = expandedRowId === entry.id;
                  const patient = patients.find((p) => p.id === entry.patient_id);

                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        onClick={() => toggleRow(entry.id)}
                        className={`hover:bg-teal-50/40 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-teal-50/30' : ''
                        }`}
                      >
                        {/* Expand chevron */}
                        <td className="py-3.5 pl-4 pr-1 text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-teal-700" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>

                        {/* Time */}
                        <td className="py-3.5 px-3 text-xs text-slate-600 whitespace-nowrap font-mono">
                          {formatTime(entry.timestamp)}
                        </td>

                        {/* Patient */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 text-xs">
                            {patient?.name || entry.patient_id}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {entry.patient_id}
                          </div>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {getActionBadge(entry.action)}
                        </td>

                        {/* Performed By */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {entry.performed_by}
                          </span>
                        </td>

                        {/* Details */}
                        <td className="py-3.5 px-4 text-xs text-slate-700">
                          <div className="font-medium line-clamp-2">
                            {entry.details}
                          </div>
                          {entry.alert_id && (
                            <div className="font-mono text-[10px] text-teal-700 mt-0.5">
                              Alert Ref: {entry.alert_id}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expandable row: prior_state vs new_state */}
                      {isExpanded && (
                        <tr className="bg-slate-50 border-b border-teal-100">
                          <td colSpan={6} className="p-4 sm:p-6">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                  State Transition Audit Trace (Entry {entry.id})
                                </div>
                                <div className="text-xs font-mono text-slate-500">
                                  Alert ID: {entry.alert_id || 'N/A'}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Prior State */}
                                <div className="bg-white border border-slate-200 rounded-lg p-3">
                                  <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                                    <span>Prior State</span>
                                    <span className="text-[10px] font-mono text-slate-400">before action</span>
                                  </div>
                                  <pre className="text-[11px] font-mono bg-slate-50 p-2.5 rounded border border-slate-100 text-slate-700 overflow-x-auto max-h-48 whitespace-pre-wrap">
                                    {formatState(entry.prior_state)}
                                  </pre>
                                </div>

                                {/* New State */}
                                <div className="bg-white border border-teal-200 rounded-lg p-3">
                                  <div className="text-xs font-bold text-teal-900 mb-1.5 flex items-center justify-between">
                                    <span>New State</span>
                                    <span className="text-[10px] font-mono text-teal-600">after action applied</span>
                                  </div>
                                  <pre className="text-[11px] font-mono bg-teal-50/50 p-2.5 rounded border border-teal-100 text-teal-950 overflow-x-auto max-h-48 whitespace-pre-wrap">
                                    {formatState(entry.new_state)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
