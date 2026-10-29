/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar, ScreenId } from './components/Sidebar';
import { Footer } from './components/Footer';
import { OfflineBanner } from './components/OfflineBanner';
import { ToastContainer } from './components/ToastContainer';
import { PatientsPage } from './pages/PatientsPage';
import { TimelinePage } from './pages/TimelinePage';
import { AlertsPage } from './pages/AlertsPage';
import { CorrectedPlanPage } from './pages/CorrectedPlanPage';
import { InjectTestPage } from './pages/InjectTestPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { getPatients, getAlerts, subscribeApiChanges } from './api.js';
import { Menu, X } from 'lucide-react';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('patients');
  const [activePatientId, setActivePatientId] = useState<string>('p-101');
  const [patients, setPatients] = useState<Array<{ id: string; name: string }>>([
    { id: 'p-101', name: 'Eleanor Vance' },
    { id: 'p-102', name: 'Arthur Pendelton' },
  ]);
  const [pendingAlertsCount, setPendingAlertsCount] = useState<number>(0);
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const refreshGlobalState = useCallback(() => {
    getPatients()
      .then((data) => {
        if (Array.isArray(data)) {
          setPatients(data.map((p: any) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => {});

    getAlerts({ status: 'pending' })
      .then((data) => {
        if (Array.isArray(data)) {
          setPendingAlertsCount(data.length);
        }
      })
      .catch(() => {});

    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    refreshGlobalState();
    const unsubscribe = subscribeApiChanges(() => {
      refreshGlobalState();
    });
    return () => {
      unsubscribe();
    };
  }, [refreshGlobalState]);

  const handleOpenTimeline = (patientId: string) => {
    setActivePatientId(patientId);
    setCurrentScreen('timeline');
    setMobileMenuOpen(false);
  };

  const handleOpenInject = (patientId: string) => {
    setActivePatientId(patientId);
    setCurrentScreen('inject-test');
    setMobileMenuOpen(false);
  };

  const handleOpenCorrectedPlan = (patientId: string) => {
    setActivePatientId(patientId);
    setCurrentScreen('corrected-plan');
    setMobileMenuOpen(false);
  };

  const handleNavigate = (screen: ScreenId) => {
    setCurrentScreen(screen);
    setMobileMenuOpen(false);
  };

  return (
    <div
      className={`min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased ${
        isProjectorMode ? 'contrast-125 text-base font-medium' : 'text-sm'
      }`}
    >
      {/* Offline Alert Banner */}
      <OfflineBanner onRetry={refreshGlobalState} />

      {/* Main Header */}
      <Header
        activeScreen={currentScreen}
        activePatientId={activePatientId}
        onSelectPatient={setActivePatientId}
        patients={patients}
        isProjectorMode={isProjectorMode}
        onToggleProjectorMode={() => setIsProjectorMode((prev) => !prev)}
        pendingAlertsCount={pendingAlertsCount}
      />

      {/* Mobile Nav Toggle */}
      <div className="md:hidden bg-white border-b border-teal-100 px-4 py-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-700 p-1.5 rounded hover:bg-slate-100"
        >
          {mobileMenuOpen ? <X className="w-5 h-5 text-teal-700" /> : <Menu className="w-5 h-5 text-teal-700" />}
          <span>Menu ({currentScreen})</span>
        </button>
        {pendingAlertsCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
            {pendingAlertsCount} Pending
          </span>
        )}
      </div>

      {/* Body Layout: Sidebar + Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex shrink-0">
          <Sidebar
            currentScreen={currentScreen}
            onNavigate={handleNavigate}
            pendingAlertsCount={pendingAlertsCount}
          />
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-72 bg-white flex flex-col z-50 shadow-xl">
              <Sidebar
                currentScreen={currentScreen}
                onNavigate={handleNavigate}
                pendingAlertsCount={pendingAlertsCount}
              />
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {currentScreen === 'patients' && (
              <PatientsPage
                onOpenTimeline={handleOpenTimeline}
                onOpenInject={handleOpenInject}
                refreshKey={refreshKey}
              />
            )}

            {currentScreen === 'timeline' && (
              <TimelinePage
                patientId={activePatientId}
                onSelectPatient={setActivePatientId}
                patients={patients}
                onViewCorrectedPlan={handleOpenCorrectedPlan}
                refreshKey={refreshKey}
              />
            )}

            {currentScreen === 'alerts' && (
              <AlertsPage
                onViewCorrectedPlan={handleOpenCorrectedPlan}
                onOpenTimeline={handleOpenTimeline}
                patients={patients}
                refreshKey={refreshKey}
              />
            )}

            {currentScreen === 'corrected-plan' && (
              <CorrectedPlanPage
                patientId={activePatientId}
                onSelectPatient={setActivePatientId}
                patients={patients}
                onPlanAccepted={refreshGlobalState}
                onOpenInject={handleOpenInject}
                refreshKey={refreshKey}
              />
            )}

            {currentScreen === 'inject-test' && (
              <InjectTestPage
                patientId={activePatientId}
                onSelectPatient={setActivePatientId}
                patients={patients}
                onOpenCorrectedPlan={handleOpenCorrectedPlan}
                onDataChanged={refreshGlobalState}
              />
            )}

            {currentScreen === 'audit-log' && (
              <AuditLogPage
                patients={patients}
                refreshKey={refreshKey}
              />
            )}
          </div>
        </main>
      </div>

      {/* Notification Toasts */}
      <ToastContainer />

      {/* Mandatory Footer */}
      <Footer />
    </div>
  );
}
