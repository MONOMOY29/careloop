/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { isBackendOffline, setUseMock, getUseMock } from '../api.js';

interface OfflineBannerProps {
  onRetry?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ onRetry }) => {
  const offline = isBackendOffline();
  const usingMock = getUseMock();

  if (!offline && usingMock) {
    return null;
  }

  if (!offline) {
    return null;
  }

  return (
    <div
      role="alert"
      className="bg-rose-600 text-white px-4 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-3 text-sm z-30"
    >
      <div className="flex items-center gap-2 font-medium">
        <WifiOff className="w-5 h-5 shrink-0 animate-pulse text-rose-200" />
        <span>
          <strong>Backend offline:</strong> Unable to connect to live API at http://localhost:8000.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setUseMock(true);
            if (onRetry) onRetry();
          }}
          className="bg-white text-rose-700 hover:bg-rose-50 px-3 py-1 rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Switch to Mock Mode (Self-contained)
        </button>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="bg-rose-700 hover:bg-rose-800 text-white px-3 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Connection
          </button>
        )}
      </div>
    </div>
  );
};
