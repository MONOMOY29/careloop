/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getAlerts, acceptAlert } from '../api.js';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { showApiErrorToast, showToast } from '../utils/toast';
import { Alert } from '../utils/logic';
import {
  AlertTriangle,
  AlertOctagon,
  Copy,
  Clock,
  CheckCircle2,
  Filter,
  ArrowRight,
  GitCompare,
  User,
  ShieldCheck,
} from 'lucide-react';

interface AlertsPageProps {
  onViewCorrectedPlan: (patientId: string) => void;
  onOpenTimeline: (patientId: string) => void;
  patients: Array<{ id: string; name: string }>;
  refreshKey: number;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({
  onViewCorrectedPlan,
  onOpenTimeline,
  patients,
  refreshKey,
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const [patientFilter, setPatientFilter] = useState<string>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const filters: { status?: string; patient_id?: string } = {};
    if (statusFilter !== 'all') filters.status = statusFilter;
    if (patientFilter !== 'all') filters.patient_id = patientFilter;

    getAlerts(filters)
      .then((data) => {
        if (mounted) {
          setAlerts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          showApiErrorToast(err, 'Failed to fetch alerts');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [statusFilter, patientFilter, refreshKey]);

  const handleQuickAccept = async (alertId: string) => {
    setResolvingId(alertId);
    try {
      await acceptAlert(alertId, {
        actor_id: 'staff-04',
        notes: 'Individual alert accepted from alerts dashboard',
      });
      showToast({
        type: 'success',
        title: 'Alert Resolved',
        message: `Alert ${alertId} has been resolved and audit record logged.`,
      });
      // Refresh list
      const updated = await getAlerts({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        patient_id: patientFilter !== 'all' ? patientFilter : undefined,
      });
      setAlerts(updated);
    } catch (err) {
      showApiErrorToast(err, 'Failed to resolve alert');
    } finally {
      setResolvingId(null);
    }
  };

  const getSeverityChip = (severity: 'high' | 'med' | 'low') => {
    if (severity === 'high') {
      return (
        <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-600 inline-block animate-pulse"></span>
          HIGH SEVERITY
        </span>
      );
    }
    if (severity === 'med') {
      return (
        <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
          MEDIUM SEVERITY
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
        LOW SEVERITY
      </span>
    );
  };

  const getTypeIcon = (type: string) => {
    if (type === 'conflict') {
      return <AlertOctagon className="w-5 h-5 text-rose-600" />;
    }
    if (type === 'duplicate') {
      return <Copy className="w-5 h-5 text-amber-600" />;
    }
    return <AlertTriangle className="w-5 h-5 text-slate-600" />;
  };

  const getConfidenceBadge = (confidence: 'Definite' | 'Possible') => {
    if (confidence === 'Definite') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wide bg-rose-600 text-white">
          Definite
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide bg-amber-500 text-white">
        Possible
      </span>
    );
  };

  const formatDetectedAt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' +
        d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const pendingCount = alerts.filter((a) => a.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-teal-100 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-teal-700" />
            Scheduling & Order Anomaly Alerts
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Automated conflict and duplicate lab detections with root cause rationales and proposed schedule corrections.
          </p>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md p-1">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Alerts
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                statusFilter === 'pending'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('resolved')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                statusFilter === 'resolved'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Resolved
            </button>
          </div>

          {/* Patient Filter */}
          <select
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-teal-600"
            aria-label="Filter by patient"
          >
            <option value="all">All Patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Alert Cards Grid */}
      {loading ? (
        <CardSkeleton count={3} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No alerts found"
          description={
            statusFilter === 'pending'
              ? 'No pending conflicts or duplicate orders exist for this selection. All patient schedules are nominal.'
              : 'No alerts match the chosen filters.'
          }
          actionText="Simulate New Conflict / Duplicate"
          onAction={() => onViewCorrectedPlan('p-101')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((alert) => {
            const patient = patients.find((p) => p.id === alert.patient_id);
            const isPending = alert.status === 'pending';

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-lg border transition-all p-5 shadow-xs flex flex-col justify-between ${
                  isPending
                    ? 'border-teal-200 hover:border-teal-400'
                    : 'border-slate-200 bg-slate-50/70 opacity-90'
                }`}
              >
                <div>
                  {/* Card Header: Type, Severity, Confidence */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-md bg-teal-50 border border-teal-200">
                        {getTypeIcon(alert.type)}
                      </div>
                      <div>
                        <div className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wide">
                          {alert.type.replace('_', ' ')} alert
                        </div>
                        <div className="text-sm font-bold text-slate-900">
                          {alert.id}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getSeverityChip(alert.severity)}
                      {getConfidenceBadge(alert.confidence)}
                    </div>
                  </div>

                  {/* Patient context */}
                  <div className="flex items-center gap-2 text-xs text-slate-600 mb-3 bg-slate-50 px-3 py-1.5 rounded border border-slate-100">
                    <User className="w-3.5 h-3.5 text-teal-700" />
                    <span className="font-semibold text-slate-900">
                      {patient?.name || alert.patient_id}
                    </span>
                    <span className="text-slate-400">({alert.patient_id})</span>
                    <span className="text-slate-300">|</span>
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Detected {formatDetectedAt(alert.detected_at)}</span>
                  </div>

                  {/* "Why this was flagged" line */}
                  <div className="space-y-1 mb-4">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Why this was flagged:
                    </div>
                    <div className="text-sm text-slate-900 bg-teal-50/50 p-3 rounded-md border border-teal-100 font-medium leading-relaxed">
                      {alert.reason}
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Status:</span>
                    {isPending ? (
                      <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Pending Staff Review
                      </span>
                    ) : (
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Resolved
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenTimeline(alert.patient_id)}
                      className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded font-medium transition-colors"
                    >
                      Timeline
                    </button>
                    {isPending && (
                      <button
                        type="button"
                        onClick={() => onViewCorrectedPlan(alert.patient_id)}
                        className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        View corrected plan
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
