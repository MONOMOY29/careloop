/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Users,
  CalendarDays,
  AlertTriangle,
  GitCompare,
  FlaskConical,
  ClipboardList,
} from 'lucide-react';

export type ScreenId = 'patients' | 'timeline' | 'alerts' | 'corrected-plan' | 'inject-test' | 'audit-log';

interface SidebarProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  pendingAlertsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  pendingAlertsCount,
}) => {
  const navItems: Array<{
    id: ScreenId;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    description: string;
  }> = [
    {
      id: 'patients',
      label: 'Patients',
      icon: Users,
      description: 'Ranked by risk score',
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: CalendarDays,
      description: 'Lanes, overlaps & duplicates',
    },
    {
      id: 'alerts',
      label: 'Alerts',
      icon: AlertTriangle,
      badge: pendingAlertsCount,
      description: 'Collisions & duplicate orders',
    },
    {
      id: 'corrected-plan',
      label: 'Corrected Plan',
      icon: GitCompare,
      description: 'Before vs after proposal',
    },
    {
      id: 'inject-test',
      label: 'Inject Test',
      icon: FlaskConical,
      description: 'Simulate anomalies & demo',
    },
    {
      id: 'audit-log',
      label: 'Audit Log',
      icon: ClipboardList,
      description: 'Traceability & state history',
    },
  ];

  return (
    <aside
      className="w-64 bg-slate-50 border-r border-teal-100 flex flex-col shrink-0"
      aria-label="Staff Navigation"
    >
      <nav className="p-4 space-y-1.5 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-2 pt-1">
          Coordination Workspace
        </div>
        {navItems.map((item) => {
          const isActive = currentScreen === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between text-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal-600 ${
                isActive
                  ? 'bg-teal-700 text-white font-medium shadow-sm'
                  : 'text-slate-700 hover:bg-teal-100/50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-teal-100' : 'text-teal-700'
                  }`}
                />
                <div className="truncate">
                  <div className="leading-tight">{item.label}</div>
                  <div
                    className={`text-[11px] truncate ${
                      isActive ? 'text-teal-100/80' : 'text-slate-500'
                    }`}
                  >
                    {item.description}
                  </div>
                </div>
              </div>

              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  className={`ml-2 px-2 py-0.5 text-xs font-bold rounded-full ${
                    isActive
                      ? 'bg-white text-rose-700'
                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick context info */}
      <div className="p-4 border-t border-teal-100 bg-white/60 text-xs text-slate-500 space-y-1">
        <div className="font-semibold text-slate-700">Active Session</div>
        <div>Actor ID: <span className="font-mono text-slate-800">staff-04</span></div>
        <div className="text-[11px] text-teal-800 font-medium">Local Seed: Eleanor & Arthur</div>
      </div>
    </aside>
  );
};
