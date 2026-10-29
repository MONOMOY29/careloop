/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => {
  return (
    <div className="w-full bg-white rounded-lg border border-teal-100 overflow-hidden divide-y divide-teal-50 animate-pulse">
      <div className="bg-teal-50/50 p-4 flex gap-4">
        <div className="h-4 bg-teal-200/60 rounded w-1/4"></div>
        <div className="h-4 bg-teal-200/60 rounded w-1/6"></div>
        <div className="h-4 bg-teal-200/60 rounded w-1/4"></div>
        <div className="h-4 bg-teal-200/60 rounded w-1/6"></div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex gap-4 items-center">
          <div className="h-5 bg-slate-200 rounded w-1/3"></div>
          <div className="h-4 bg-slate-100 rounded w-1/5"></div>
          <div className="h-4 bg-slate-200 rounded w-1/4"></div>
          <div className="h-6 bg-slate-100 rounded w-1/6"></div>
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-teal-100 rounded-lg p-5 space-y-3">
          <div className="flex justify-between items-center">
            <div className="h-5 bg-teal-200/50 rounded w-1/3"></div>
            <div className="h-4 bg-slate-200 rounded w-1/5"></div>
          </div>
          <div className="h-4 bg-slate-100 rounded w-full"></div>
          <div className="h-4 bg-slate-100 rounded w-4/5"></div>
          <div className="h-8 bg-teal-50 rounded w-1/2 pt-2"></div>
        </div>
      ))}
    </div>
  );
};

export const TimelineSkeleton: React.FC = () => {
  return (
    <div className="bg-white border border-teal-100 rounded-lg p-6 space-y-6 animate-pulse">
      <div className="flex justify-between items-center pb-4 border-b border-teal-50">
        <div className="h-6 bg-teal-200/60 rounded w-48"></div>
        <div className="h-8 bg-slate-100 rounded w-32"></div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4].map((lane) => (
          <div key={lane} className="flex gap-4 items-center">
            <div className="w-28 h-6 bg-slate-100 rounded shrink-0"></div>
            <div className="flex-1 h-16 bg-teal-50/60 rounded border border-dashed border-teal-200/50 flex items-center px-4">
              <div className="h-8 bg-slate-200 rounded w-1/3"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
