// ============================================================
// VirtualLab-HIL — Main Application Container
// ============================================================

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar/Navbar';
import { ComponentPalette } from '@/components/palette/ComponentPalette';
import { CircuitCanvas } from '@/components/canvas/CircuitCanvas';
import { ComponentInspector } from '@/components/inspector/ComponentInspector';
import { OscilloscopeModal } from '@/components/instruments/OscilloscopeModal';
import { LogicAnalyzerModal } from '@/components/instruments/LogicAnalyzerModal';
import { SignalGeneratorModal } from '@/components/instruments/SignalGeneratorModal';
import { HILBridgeBar } from '@/components/hil/HILBridgeBar';
import { DebugConsole } from '@/components/debugger/DebugConsole';
import { CircuitErrorModal } from '@/components/modals/CircuitErrorModal';
import { SplashScreen } from '@/components/common/SplashScreen';
import { MobileBottomBar } from '@/components/common/MobileBottomBar';
import { useCircuitStore } from '@/store/circuitStore';
import { getBackendHttpUrl } from '@/services/geminiCircuitService';

export function App() {
  const [showSplash, setShowSplash] = useState(true);
  const loadPreset = useCircuitStore((s) => s.loadPreset);
  const restoreSessionFromCache = useCircuitStore((s) => s.restoreSessionFromCache);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  // Early warm-up ping to Render backend so it wakes up before user triggers HIL or AI features
  useEffect(() => {
    const backendUrl = getBackendHttpUrl();
    fetch(`${backendUrl}/api/health`, { method: 'GET', mode: 'cors' }).catch(() => {});
    fetch(`${backendUrl}/api/ai/keys-status`, { method: 'GET', mode: 'cors' }).catch(() => {});
  }, []);

  // Restore active circuit session from browser cache, or load default starter circuit
  useEffect(() => {
    const restored = restoreSessionFromCache();
    if (!restored) {
      loadPreset('default_empty');
    }
  }, [loadPreset, restoreSessionFromCache]);

  // Sync dark class on document root
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDark]);

  return (
    <div
      className={`w-screen h-[100dvh] flex flex-col overflow-hidden select-none transition-colors duration-200 ${
        isDark ? 'bg-[#0a0c10] text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Top Header & Simulation Controls */}
      <Navbar />

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Component Palette (Left Sidebar / Mobile Drawer) */}
        <ComponentPalette />

        {/* Interactive Circuit Canvas (React Flow) */}
        <main className="flex-1 h-full relative">
          <CircuitCanvas />
        </main>

        {/* Component Properties Inspector (Right Sidebar / Mobile Drawer) */}
        <ComponentInspector />
      </div>

      {/* Mobile Floating Action Dock (< 768px) */}
      <MobileBottomBar />

      {/* Floating Instrument Modals */}
      <OscilloscopeModal />
      <LogicAnalyzerModal />
      <SignalGeneratorModal />
      <HILBridgeBar />

      {/* Circuit Electrical Rules Check Diagnostic Error Modal */}
      <CircuitErrorModal />

      {/* Bottom Collapsible Debugging & Solver Log Console */}
      <DebugConsole />

      {/* High-Tech 2-Second Animated Splash Screen */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </div>
  );
}

export default App;
