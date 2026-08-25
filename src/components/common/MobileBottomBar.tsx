// ============================================================
// VirtualLab-HIL — Mobile Floating Action Bar & Quick Dock
// ============================================================

import React from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  Layers, Play, Pause, Activity, Sparkles, Sliders,
} from 'lucide-react';

export const MobileBottomBar: React.FC = () => {
  const showPalette = useCircuitStore((s) => s.showPalette);
  const togglePalette = useCircuitStore((s) => s.togglePalette);
  const showInspector = useCircuitStore((s) => s.showInspector);
  const toggleInspector = useCircuitStore((s) => s.toggleInspector);
  const showOscilloscope = useCircuitStore((s) => s.showOscilloscope);
  const setShowOscilloscope = useCircuitStore((s) => s.setShowOscilloscope);
  const setShowAICircuitModal = useCircuitStore((s) => s.setShowAICircuitModal);
  const simulationState = useCircuitStore((s) => s.simulationState);
  const startSimulation = useCircuitStore((s) => s.startSimulation);
  const pauseSimulation = useCircuitStore((s) => s.pauseSimulation);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';
  const isRunning = simulationState.status === 'running';

  return (
    <nav
      aria-label="Mobile Navigation"
      className={`md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-2 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-200 ${
        isDark
          ? 'bg-slate-950/90 border-slate-800/90 shadow-cyan-950/20 text-slate-200'
          : 'bg-white/95 border-slate-200/90 shadow-slate-900/15 text-slate-800'
      }`}
    >
      {/* Component Palette Toggle */}
      <button
        onClick={togglePalette}
        className={`flex flex-col items-center justify-center w-12 h-11 rounded-xl transition ${
          showPalette
            ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/40'
            : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
        }`}
        title="Component Palette"
      >
        <Layers className="w-4 h-4" />
        <span className="text-[9px] font-medium tracking-tight mt-0.5">Parts</span>
      </button>

      {/* Play / Pause Toggle Button */}
      {isRunning ? (
        <button
          onClick={pauseSimulation}
          className="flex flex-col items-center justify-center w-13 h-11 px-2 rounded-xl bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/30 active:scale-95 transition"
          title="Pause Simulation"
        >
          <Pause className="w-4 h-4 fill-slate-950" />
          <span className="text-[9px] uppercase tracking-wider font-extrabold mt-0.5">Pause</span>
        </button>
      ) : (
        <button
          onClick={startSimulation}
          className="flex flex-col items-center justify-center w-13 h-11 px-2 rounded-xl bg-gradient-to-tr from-green-500 to-emerald-400 text-slate-950 font-bold shadow-lg shadow-green-500/30 active:scale-95 transition"
          title="Run Simulation"
        >
          <Play className="w-4 h-4 fill-slate-950" />
          <span className="text-[9px] uppercase tracking-wider font-extrabold mt-0.5">Run</span>
        </button>
      )}

      {/* 4-CH Oscilloscope Modal Toggle */}
      <button
        onClick={() => setShowOscilloscope(!showOscilloscope)}
        className={`flex flex-col items-center justify-center w-12 h-11 rounded-xl transition ${
          showOscilloscope
            ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/40'
            : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
        }`}
        title="Virtual Oscilloscope"
      >
        <Activity className="w-4 h-4" />
        <span className="text-[9px] font-medium tracking-tight mt-0.5">Scope</span>
      </button>

      {/* Gemini AI Circuit Generator */}
      <button
        onClick={() => setShowAICircuitModal(true)}
        className="flex flex-col items-center justify-center w-12 h-11 rounded-xl text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition"
        title="Gemini AI Circuit Generator"
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-[9px] font-medium tracking-tight mt-0.5">AI</span>
      </button>

      {/* Component Properties Inspector Toggle */}
      <button
        onClick={toggleInspector}
        className={`flex flex-col items-center justify-center w-12 h-11 rounded-xl transition ${
          showInspector
            ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/40'
            : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
        }`}
        title="Properties Inspector"
      >
        <Sliders className="w-4 h-4" />
        <span className="text-[9px] font-medium tracking-tight mt-0.5">Params</span>
      </button>
    </nav>
  );
};
