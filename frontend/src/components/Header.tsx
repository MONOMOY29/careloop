/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity, ShieldAlert, Database, Wifi, MonitorCheck, HelpCircle } from 'lucide-react';
import { getUseMock, setUseMock, isBackendOffline } from '../api.js';

interface HeaderProps {
  activeScreen: string;
  activePatientId: string;
  onSelectPatient: (id: string) => void;
  patients: Array<{ id: string; name: string }>;
  isProjectorMode: boolean;
  onToggleProjectorMode: () => void;
  pendingAlertsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activePatientId,
  onSelectPatient,
  patients,
  isProjectorMode,
  onToggleProjectorMode,
  pendingAlertsCount,
}) => {
  const isMock = getUseMock();
  const offline = isBackendOffline();

  return (
    <header className="bg-white border-b border-teal-100 shadow-xs sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-700 flex items-center justify-center text-white shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-900 tracking-tight">CareLoop</span>
              <span className="text-[11px] font-medium tracking-wide uppercase px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                Staff Coordination
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Hospital schedule conflict & lab order deduplication
            </p>
          </div>
        </div>

        {/* Global Patient Selector & Mode Controls */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Patient Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs">
            <label htmlFor="global-patient-select" className="text-slate-500 font-medium">
              Patient:
            </label>
            <select
              id="global-patient-select"
              value={activePatientId}
              onChange={(e) => onSelectPatient(e.target.value)}
              className="bg-transparent text-slate-900 font-semibold focus:outline-none cursor-pointer"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          {/* Active Alerts Pill */}
          {pendingAlertsCount > 0 && (
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold"
              title={`${pendingAlertsCount} pending alerts require attention`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{pendingAlertsCount} Active {pendingAlertsCount === 1 ? 'Alert' : 'Alerts'}</span>
            </div>
          )}

          {/* Projector High-Contrast Mode Toggle */}
          <button
            type="button"
            onClick={onToggleProjectorMode}
            aria-pressed={isProjectorMode}
            className={`px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              isProjectorMode
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Toggle high-contrast display scale for wall projectors & ward monitors"
          >
            <MonitorCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projector Mode</span>
          </button>

          {/* Mock Mode Switch */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setUseMock(!isMock)}
              className={`px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                isMock
                  ? 'bg-teal-50 text-teal-800 border-teal-300'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
              title="Toggle client-side mock simulation vs live REST API at http://localhost:8000"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isMock ? 'Mock Data (Active)' : 'Live API (8000)'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
