/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { injectAnomaly, resetDemo } from '../api.js';
import { showApiErrorToast, showToast } from '../utils/toast';
import {
  FlaskConical,
  Play,
  RotateCcw,
  Zap,
  Clock,
  AlertOctagon,
  Copy,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Sliders,
} from 'lucide-react';

interface InjectTestPageProps {
  patientId: string;
  onSelectPatient: (id: string) => void;
  patients: Array<{ id: string; name: string }>;
  onOpenCorrectedPlan: (patientId: string) => void;
  onDataChanged: () => void;
}

interface InjectedResult {
  status: string;
  injected_event_id: string;
  triggered_alert_id: string;
  alert: {
    id: string;
    patient_id: string;
    type: 'conflict' | 'duplicate' | 'missing_step';
    confidence: 'Definite' | 'Possible';
    severity: 'high' | 'med' | 'low';
    reason: string;
    status: string;
    detected_at: string;
  };
  latency_ms: number;
}

export const InjectTestPage: React.FC<InjectTestPageProps> = ({
  patientId,
  onSelectPatient,
  patients,
  onOpenCorrectedPlan,
  onDataChanged,
}) => {
  const [testType, setTestType] = useState<string>('HbA1c');
  const [customTestType, setCustomTestType] = useState<string>('');
  const [injecting, setInjecting] = useState<boolean>(false);
  const [demoRunning, setDemoRunning] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<InjectedResult | null>(null);

  const activeTestType = customTestType.trim() || testType;

  const handleInjectConflict = async () => {
    setInjecting(true);
    try {
      const res = await injectAnomaly({
        patient_id: patientId,
        anomaly_type: 'conflict',
        payload: {
          title: 'Ultrasound Scan',
          start_time: '2026-10-28T09:10:00Z',
          end_time: '2026-10-28T09:40:00Z',
        },
      });

      setLastResult(res);
      showToast({
        type: 'warning',
        title: 'Conflict Anomaly Injected',
        message: `Ultrasound Scan injected (${res.injected_event_id}). Alert ${res.triggered_alert_id} triggered in ${res.latency_ms}ms.`,
      });
      onDataChanged();
    } catch (err) {
      showApiErrorToast(err, 'Failed to inject conflict');
    } finally {
      setInjecting(false);
    }
  };

  const handleInjectDuplicate = async () => {
    setInjecting(true);
    try {
      const res = await injectAnomaly({
        patient_id: patientId,
        anomaly_type: 'duplicate',
        payload: {
          title: `${activeTestType} Test Repeat`,
          test_type: activeTestType,
          start_time: '2026-10-29T11:00:00Z',
          end_time: '2026-10-29T11:30:00Z',
        },
      });

      setLastResult(res);
      showToast({
        type: 'warning',
        title: 'Duplicate Lab Order Injected',
        message: `Duplicate ${activeTestType} ordered (${res.injected_event_id}). Alert ${res.triggered_alert_id} triggered in ${res.latency_ms}ms.`,
      });
      onDataChanged();
    } catch (err) {
      showApiErrorToast(err, 'Failed to inject duplicate order');
    } finally {
      setInjecting(false);
    }
  };

  const handleRunDemo = async () => {
    setDemoRunning(true);
    try {
      // Step 1: Inject Conflict
      showToast({
        type: 'info',
        title: 'Demo Step 1/3',
        message: 'Injecting schedule conflict: Ultrasound Scan vs CMP...',
      });
      const conflictRes = await injectAnomaly({
        patient_id: patientId,
        anomaly_type: 'conflict',
        payload: {
          title: 'Ultrasound Scan',
          start_time: '2026-10-28T09:10:00Z',
          end_time: '2026-10-28T09:40:00Z',
        },
      });

      // Small delay for staff pacing
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Inject Duplicate Lab Order
      showToast({
        type: 'info',
        title: 'Demo Step 2/3',
        message: 'Injecting duplicate lab order: HbA1c repeat within 72h...',
      });
      const dupRes = await injectAnomaly({
        patient_id: patientId,
        anomaly_type: 'duplicate',
        payload: {
          title: 'HbA1c Test Repeat',
          test_type: 'HbA1c',
          start_time: '2026-10-29T11:00:00Z',
          end_time: '2026-10-29T11:30:00Z',
        },
      });

      setLastResult(dupRes);
      onDataChanged();

      // Step 3: Open Corrected Plan
      showToast({
        type: 'success',
        title: 'Demo Step 3/3',
        message: 'Anomalies injected! Opening Corrected Plan resolution screen...',
      });

      await new Promise((r) => setTimeout(r, 400));
      onOpenCorrectedPlan(patientId);
    } catch (err) {
      showApiErrorToast(err, 'Demo sequence failed');
    } finally {
      setDemoRunning(false);
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    try {
      const res = await resetDemo();
      setLastResult(null);
      showToast({
        type: 'success',
        title: 'Environment Reset',
        message: `Restored initial EHR seed (${res.patients} patients, 0 alerts).`,
      });
      onDataChanged();
    } catch (err) {
      showApiErrorToast(err, 'Failed to reset demo data');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white border border-teal-100 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-teal-700" />
            Anomaly Injection & Demo Suite
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Simulate EHR scheduling conflicts and redundant duplicate orders to test system alerts and corrected plan adjustments.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={demoRunning || resetting}
            onClick={handleRunDemo}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            {demoRunning ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Running Demo...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Demo (Conflict + Duplicate)</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={resetting || demoRunning}
            onClick={handleResetDemo}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Real-time Result on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Injection Controls */}
        <div className="bg-white border border-teal-100 rounded-lg p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-teal-50 pb-3">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-700" />
              <span>Target Patient & Anomaly Parameters</span>
            </div>
          </div>

          {/* Patient Dropdown */}
          <div className="space-y-1.5">
            <label htmlFor="inject-patient-select" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Target Patient
            </label>
            <select
              id="inject-patient-select"
              value={patientId}
              onChange={(e) => onSelectPatient(e.target.value)}
              className="w-full border border-slate-300 rounded-md p-2.5 text-sm bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Eleanor Vance (p-101) is pre-configured with CMP (09:00-09:30) and baseline HbA1c.
            </p>
          </div>

          {/* Button 1: Inject Conflict */}
          <div className="p-4 rounded-lg bg-rose-50/70 border border-rose-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wide text-rose-900 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-rose-600" />
                Schedule Conflict Test
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-800">
                High Severity
              </span>
            </div>
            <p className="text-xs text-rose-800">
              Injects <strong>ev-991 Ultrasound Scan</strong> (09:10Z - 09:40Z), directly colliding with the scheduled 09:00Z Comprehensive Metabolic Panel.
            </p>
            <button
              type="button"
              disabled={injecting || demoRunning}
              onClick={handleInjectConflict}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>Inject Conflict (Ultrasound 09:10-09:40)</span>
            </button>
          </div>

          {/* Button 2: Inject Duplicate Lab Order */}
          <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
                <Copy className="w-4 h-4 text-amber-600" />
                Duplicate Lab Order Test
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-800">
                Medium Severity
              </span>
            </div>

            {/* Test Type Input (asks test_type, default HbA1c) */}
            <div className="space-y-1">
              <label htmlFor="test-type-select" className="text-xs font-semibold text-slate-700">
                Test Type (default: HbA1c)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  id="test-type-select"
                  value={testType}
                  onChange={(e) => {
                    setTestType(e.target.value);
                    setCustomTestType('');
                  }}
                  className="border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                >
                  <option value="HbA1c">HbA1c (Glycated Hemoglobin)</option>
                  <option value="CMP">CMP (Metabolic Panel)</option>
                  <option value="CBC">CBC (Complete Blood Count)</option>
                  <option value="Lipid">Lipid Panel</option>
                </select>
                <input
                  type="text"
                  placeholder="Or custom test_type"
                  value={customTestType}
                  onChange={(e) => setCustomTestType(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>

            <p className="text-xs text-amber-800">
              Injects duplicate order within 72 hours of previous order with no completed results yet.
            </p>

            <button
              type="button"
              disabled={injecting || demoRunning}
              onClick={handleInjectDuplicate}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              <span>Inject Duplicate Lab Order ({activeTestType})</span>
            </button>
          </div>
        </div>

        {/* Right Column: Real-time Returned Alert & Latency Badge */}
        <div className="bg-white border border-teal-100 rounded-lg p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-teal-50 pb-3 mb-4">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-teal-700" />
                <span>Detection Response & Returned Alert</span>
              </div>
            </div>

            {!lastResult ? (
              <div className="p-10 text-center flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Clock className="w-10 h-10 text-slate-300 stroke-1" />
                <div className="font-semibold text-slate-600 text-sm">No recent injection triggered</div>
                <div className="text-xs max-w-sm">
                  Click &ldquo;Inject Conflict&rdquo; or &ldquo;Inject Duplicate&rdquo; to execute the test. The returned alert and latency badge will appear here instantaneously.
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                {/* Latency Badge Requirement: green under 2000, red otherwise */}
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-600 font-medium">Detection Engine Latency:</div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border ${
                      lastResult.latency_ms < 2000
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        lastResult.latency_ms < 2000 ? 'bg-emerald-600' : 'bg-rose-600'
                      }`}
                    />
                    Detected in {lastResult.latency_ms} ms
                  </span>
                </div>

                {/* Returned Alert Card */}
                <div className="p-4 rounded-lg border-2 border-teal-300 bg-teal-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-teal-900">
                      Alert ID: {lastResult.triggered_alert_id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-600 text-white">
                        {lastResult.alert.confidence}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-white">
                        {lastResult.alert.severity}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm font-bold text-slate-900">
                    Why this was flagged:
                  </div>
                  <div className="text-xs text-slate-800 bg-white p-3 rounded border border-teal-200 leading-relaxed font-medium">
                    {lastResult.alert.reason}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                    <div>
                      <span className="text-slate-400">Injected Event: </span>
                      <span className="font-mono font-bold text-slate-800">
                        {lastResult.injected_event_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Patient: </span>
                      <span className="font-mono font-bold text-slate-800">
                        {lastResult.alert.patient_id}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Navigate to Corrected Plan */}
          {lastResult && (
            <div className="pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => onOpenCorrectedPlan(patientId)}
                className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-md text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>Proceed to Corrected Plan for {patientId}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
