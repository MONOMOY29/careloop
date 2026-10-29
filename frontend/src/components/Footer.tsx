/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-teal-100 py-3 px-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
      <AlertCircle className="w-4 h-4 text-teal-600 shrink-0" />
      <span className="font-medium text-slate-700 tracking-wide">
        Coordination only, not clinical decision-making.
      </span>
      <span className="text-slate-400 hidden sm:inline">|</span>
      <span className="text-slate-400 hidden sm:inline">
        CareLoop Operational Support v1.0
      </span>
    </footer>
  );
};
