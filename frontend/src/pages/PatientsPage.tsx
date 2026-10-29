/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { getPatients } from '../api.js';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { showApiErrorToast } from '../utils/toast';
import {
  Users,
  Search,
  ArrowRight,
  ShieldAlert,
  Clock,
  Sparkles,
  CheckCircle,
} from 'lucide-react';

interface Patient {
  id: string;
  name: string;
  risk_score: number;
  active_alerts_count: number;
  last_updated: string;
}

interface PatientsPageProps {
  onOpenTimeline: (patientId: string) => void;
  onOpenInject: (patientId: string) => void;
  refreshKey: number;
}

export const PatientsPage: React.FC<PatientsPageProps> = ({
  onOpenTimeline,
  onOpenInject,
  refreshKey,
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    getPatients()
      .then((data) => {
        if (mounted) {
          setPatients(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          showApiErrorToast(err, 'Failed to fetch patient roster');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' +
        new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 0.5) {
      return {
        bar: 'bg-rose-600',
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        label: 'High Risk',
      };
    }
    if (score > 0.0) {
      return {
        bar: 'bg-amber-500',
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        label: 'Medium Risk',
      };
    }
    return {
      bar: 'bg-emerald-500',
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      label: 'Nominal',
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Summary */}
      <div className="bg-white border border-teal-100 rounded-lg p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-700" />
            Patient Coordination Roster
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Ranked by scheduling risk score. Click any patient to inspect multi-lane timeline, conflict overlaps, and duplicate orders.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search patient name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
          />
        </div>
      </div>

      {/* Main Table or Loading */}
      {loading ? (
        <TableSkeleton rows={3} />
      ) : filteredPatients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patients match query"
          description="Try clearing search filters to see all admitted patients in the coordination system."
          actionText="Clear Search"
          onAction={() => setSearchTerm('')}
        />
      ) : (
        <div className="bg-white border border-teal-100 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" aria-label="Patients Table">
              <thead>
                <tr className="bg-teal-50/70 border-b border-teal-100 text-xs font-semibold text-teal-900 uppercase tracking-wider">
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Patient</th>
                  <th scope="col" className="py-3.5 px-4">Scheduling Risk Score</th>
                  <th scope="col" className="py-3.5 px-4 text-center">Active Alerts</th>
                  <th scope="col" className="py-3.5 px-4">Last Updated</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPatients.map((patient) => {
                  const risk = getRiskColor(patient.risk_score);
                  const percent = Math.round(patient.risk_score * 100);

                  return (
                    <tr
                      key={patient.id}
                      onClick={() => onOpenTimeline(patient.id)}
                      className="hover:bg-teal-50/40 transition-colors cursor-pointer group"
                    >
                      {/* Name & ID */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="font-semibold text-slate-900 group-hover:text-teal-800 transition-colors">
                          {patient.name}
                        </div>
                        <div className="text-xs font-mono text-slate-500">{patient.id}</div>
                      </td>

                      {/* Risk Score + Colored Bar */}
                      <td className="py-4 px-4 w-64">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-mono font-bold text-slate-800">
                            {patient.risk_score.toFixed(2)}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${risk.bg}`}>
                            {risk.label}
                          </span>
                        </div>
                        {/* Progress Bar Container */}
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-300 ${risk.bar}`}
                            style={{ width: `${Math.max(percent, 4)}%` }}
                          />
                        </div>
                      </td>

                      {/* Active Alerts */}
                      <td className="py-4 px-4 text-center">
                        {patient.active_alerts_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            {patient.active_alerts_count} Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            0 Alerts
                          </span>
                        )}
                      </td>

                      {/* Last Updated */}
                      <td className="py-4 px-4 text-slate-600 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatTimestamp(patient.last_updated)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenInject(patient.id);
                            }}
                            className="text-xs text-slate-600 hover:text-teal-700 px-2.5 py-1 rounded border border-slate-200 hover:border-teal-300 bg-white"
                          >
                            Inject Test
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTimeline(patient.id);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 px-3 py-1.5 rounded-md shadow-xs transition-colors"
                          >
                            <span>Timeline</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
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
