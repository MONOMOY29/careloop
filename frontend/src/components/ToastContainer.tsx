/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast, ToastMessage } from '../utils/toast';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return subscribeToasts((updated) => setToasts(updated));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-12 right-6 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        let bg = 'bg-white border-teal-200 text-slate-800';
        let icon = <Info className="w-5 h-5 text-teal-600 shrink-0" />;

        if (toast.type === 'success') {
          bg = 'bg-emerald-50 border-emerald-300 text-emerald-950';
          icon = <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
        } else if (toast.type === 'error') {
          bg = 'bg-rose-50 border-rose-300 text-rose-950';
          icon = <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />;
        } else if (toast.type === 'warning') {
          bg = 'bg-amber-50 border-amber-300 text-amber-950';
          icon = <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto p-4 rounded-lg border shadow-lg flex items-start gap-3 transition-all ${bg}`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-5">{toast.title}</div>
              {toast.message && (
                <div className="text-xs mt-1 text-slate-700 break-words leading-relaxed">
                  {toast.message}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-200/50"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
