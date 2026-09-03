import React, { useState, useRef, useEffect } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  Play, Pause, RotateCcw, Activity, Cpu, Radio, Zap,
  BookOpen, FolderOpen, FilePlus, Table2, LineChart,
  Undo2, Redo2, Sun, Moon, Sliders, Sparkles,
  Menu, X, Layers, Settings,
} from 'lucide-react';
import { SaveLoadCircuitModal } from '@/components/modals/SaveLoadCircuitModal';
import { NewProjectModal } from '@/components/modals/NewProjectModal';
import { TruthTableModal } from '@/components/instruments/TruthTableModal';
import { AICircuitModal } from '@/components/ai/AICircuitModal';
import { CharacteristicCurveModal } from '@/components/instruments/CharacteristicCurveModal';
import { APP_VERSION } from '@/version';

export const Navbar: React.FC = () => {
  const theme = useCircuitStore((s) => s.theme);
  const toggleTheme = useCircuitStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  const simulationState = useCircuitStore((s) => s.simulationState);
  const performanceMode = useCircuitStore((s) => s.performanceMode);
  const setPerformanceMode = useCircuitStore((s) => s.setPerformanceMode);
  const hilState = useCircuitStore((s) => s.hilState);
  const startSimulation = useCircuitStore((s) => s.startSimulation);
  const pauseSimulation = useCircuitStore((s) => s.pauseSimulation);
  const resetSimulation = useCircuitStore((s) => s.resetSimulation);
  const setSimulationMode = useCircuitStore((s) => s.setSimulationMode);
  const setSpeedMultiplier = useCircuitStore((s) => s.setSpeedMultiplier);

  const canUndo = useCircuitStore((s) => s.canUndo);
  const canRedo = useCircuitStore((s) => s.canRedo);
  const undo = useCircuitStore((s) => s.undo);
  const redo = useCircuitStore((s) => s.redo);

  const showOscilloscope = useCircuitStore((s) => s.showOscilloscope);
  const setShowOscilloscope = useCircuitStore((s) => s.setShowOscilloscope);
  const showLogicAnalyzer = useCircuitStore((s) => s.showLogicAnalyzer);
  const setShowLogicAnalyzer = useCircuitStore((s) => s.setShowLogicAnalyzer);
  const showHILBridge = useCircuitStore((s) => s.showHILBridge);
  const setShowHILBridge = useCircuitStore((s) => s.setShowHILBridge);
  const showInspector = useCircuitStore((s) => s.showInspector);
  const setShowInspector = useCircuitStore((s) => s.setShowInspector);
  const showPalette = useCircuitStore((s) => s.showPalette);
  const setShowPalette = useCircuitStore((s) => s.setShowPalette);
  const showTruthTable = useCircuitStore((s) => s.showTruthTable);
  const setShowTruthTable = useCircuitStore((s) => s.setShowTruthTable);
  const showCharacteristicCurve = useCircuitStore((s) => s.showCharacteristicCurve);
  const setShowCharacteristicCurve = useCircuitStore((s) => s.setShowCharacteristicCurve);
  const showAICircuitModal = useCircuitStore((s) => s.showAICircuitModal);
  const setShowAICircuitModal = useCircuitStore((s) => s.setShowAICircuitModal);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const loadPreset = useCircuitStore((s) => s.loadPreset);

  const [isSaveLoadModalOpen, setIsSaveLoadModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isRunning = simulationState.status === 'running';

  const handleNewProjectClick = () => {
    const compKeys = Object.keys(components);
    const hasActiveCircuit =
      compKeys.length > 1 ||
      edges.length > 0 ||
      (compKeys.length === 1 && components[compKeys[0]].kind !== 'ground');

    if (hasActiveCircuit) {
      setIsNewProjectModalOpen(true);
    } else {
      loadPreset('default_empty');
    }
  };

  // Global Keyboard Shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const presetsRef = React.useRef<HTMLDivElement>(null);

  // Close Presets dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (presetsRef.current && !presetsRef.current.contains(event.target as Node)) {
        setIsPresetsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header
        className={`h-14 border-b px-4 flex items-center justify-between select-none relative z-30 backdrop-blur-md transition-colors duration-200 gap-4 overflow-visible ${
          isDark
            ? 'bg-slate-950/95 border-slate-800 text-slate-100'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        {/* ── Brand ── */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-md shadow-cyan-500/20">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <h1 className="text-xs font-bold tracking-tight">VirtualLab-HIL</h1>
              <span
                className={`text-[9px] uppercase font-mono px-1 py-0.2 rounded border ${
                  isDark
                    ? 'bg-cyan-950 text-cyan-400 border-cyan-800/60'
                    : 'bg-cyan-50 text-cyan-700 border-cyan-300'
                }`}
              >
                {APP_VERSION}
              </span>
            </div>
            <p className="text-[9px] text-slate-400 font-mono mt-0.5 whitespace-nowrap">Mixed-Signal & HIL</p>
          </div>
        </div>

        {/* ── Desktop Simulation Controls & Undo/Redo (Center Bar) ── */}
        <div
          className={`hidden xl:flex items-center gap-2 border rounded-lg px-2 py-1 shadow-inner shrink-0 ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-100 border-slate-300'
          }`}
        >
          {/* Undo / Redo */}
          <div className="flex items-center border-r border-slate-700/50 pr-1 gap-0.5">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-1 rounded transition ${
                canUndo
                  ? isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200'
                  : 'text-slate-500/40 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-1 rounded transition ${
                canRedo
                  ? isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200'
                  : 'text-slate-500/40 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode Selector */}
          <div
            className={`flex items-center rounded p-0.5 border ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <button
              onClick={() => setSimulationMode('virtual')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                simulationState.mode === 'virtual'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Virtual
            </button>
            <button
              onClick={() => setSimulationMode('hil')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                simulationState.mode === 'hil'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Radio className="w-3 h-3" /> HIL
            </button>
          </div>

          {/* Play/Pause */}
          {isRunning ? (
            <button
              onClick={pauseSimulation}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600/20 text-amber-500 dark:text-amber-300 hover:bg-amber-600/30 border border-amber-500/40 text-xs font-bold transition"
            >
              <Pause className="w-3 h-3 fill-current" /> Pause
            </button>
          ) : (
            <button
              onClick={startSimulation}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-green-600/20 text-green-600 dark:text-green-300 hover:bg-green-600/30 border border-green-500/40 text-xs font-bold transition"
            >
              <Play className="w-3 h-3 fill-current" /> Run
            </button>
          )}

          <button
            onClick={resetSimulation}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-500/10 transition"
            title="Reset Simulation Clock"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Clock Time */}
          <div
            className={`px-2 py-0.5 rounded text-[11px] font-mono border min-w-[60px] text-center ${
              isDark ? 'bg-slate-950 text-cyan-400 border-slate-800' : 'bg-white text-cyan-700 border-slate-300'
            }`}
          >
            {simulationState.currentTime.toFixed(2)}s
          </div>

          {/* Simulation Speed */}
          <select
            value={simulationState.config.speedMultiplier ?? 0.05}
            onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono border outline-none cursor-pointer ${
              isDark
                ? 'bg-slate-950 text-amber-400 border-slate-800 focus:border-amber-500'
                : 'bg-white text-amber-700 border-slate-300 focus:border-amber-500'
            }`}
            title="Simulation Speed Multiplier"
          >
            <option value="0.05">0.05x</option>
            <option value="0.1">0.1x</option>
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="2">2.0x</option>
          </select>

          {/* Performance Mode Toggle */}
          <button
            onClick={() => setPerformanceMode(!performanceMode)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
              performanceMode
                ? isDark
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500 shadow-sm'
                  : 'bg-amber-100 text-amber-900 border-amber-500 font-bold'
                : isDark
                ? 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
            title={performanceMode ? 'Performance Mode Active: 6 sub-steps, downsampled waveforms, minimal graphics' : 'Enable Performance Mode: Reduces CPU load and maximizes FPS'}
          >
            <Zap className={`w-3 h-3 ${performanceMode ? 'text-amber-400 fill-current' : 'text-slate-400'}`} />
            <span>{performanceMode ? '⚡ Perf ON' : '⚡ Perf'}</span>
          </button>
        </div>

        {/* ── Desktop Virtual Instruments ── */}
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowOscilloscope(!showOscilloscope)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition ${
              showOscilloscope
                ? isDark
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-600'
                  : 'bg-cyan-100 text-cyan-800 border-cyan-400'
                : isDark
                ? 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Scope</span>
          </button>

          <button
            onClick={() => setShowLogicAnalyzer(!showLogicAnalyzer)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition ${
              showLogicAnalyzer
                ? isDark
                  ? 'bg-green-950 text-green-300 border-green-600'
                  : 'bg-green-100 text-green-800 border-green-400'
                : isDark
                ? 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Logic</span>
          </button>

          <button
            onClick={() => setShowHILBridge(!showHILBridge)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition ${
              showHILBridge
                ? isDark
                  ? 'bg-orange-950 text-orange-300 border-orange-600'
                  : 'bg-orange-100 text-orange-800 border-orange-400'
                : isDark
                ? 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>HIL</span>
            {hilState.connected && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hilState.hardwareConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
                }`}
                title={hilState.hardwareConnected ? 'ESP32 Hardware Online' : 'Gateway Connected (ESP32 Offline)'}
              />
            )}
          </button>

          <button
            onClick={() => setShowInspector(!showInspector)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition ${
              showInspector
                ? isDark
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-600'
                  : 'bg-cyan-100 text-cyan-800 border-cyan-400'
                : isDark
                ? 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
            }`}
            title="Toggle Component Settings & Inspector Panel"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Inspector</span>
          </button>

          <button
            onClick={() => setShowTruthTable(!showTruthTable)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition ${
              showTruthTable
                ? isDark
                  ? 'bg-violet-950 text-violet-300 border-violet-600'
                  : 'bg-violet-100 text-violet-800 border-violet-400'
                : isDark
                ? 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Truth Table</span>
          </button>

          <button
            onClick={() => setShowCharacteristicCurve(!showCharacteristicCurve)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition ${
              showCharacteristicCurve
                ? isDark
                  ? 'bg-amber-950 text-amber-300 border-amber-600'
                  : 'bg-amber-100 text-amber-800 border-amber-400'
                : isDark
                ? 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
            }`}
            title="Open Characteristic Curve Analyzer & X-Y Parameter Sweeper"
          >
            <LineChart className="w-3.5 h-3.5 text-amber-400" />
            <span>Curve</span>
          </button>

          <button
            onClick={() => setShowAICircuitModal(!showAICircuitModal)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border transition shadow-sm ${
              showAICircuitModal
                ? 'bg-purple-900 text-purple-200 border-purple-500 shadow-purple-900/40'
                : 'bg-gradient-to-r from-purple-950/80 to-indigo-950/80 hover:from-purple-900 hover:to-indigo-900 text-purple-300 border-purple-700/60 hover:border-purple-500'
            }`}
            title="Open Gemini AI Circuit Synthesis Assistant"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400 fill-current" />
            <span>AI Circuit</span>
          </button>
        </div>

        {/* ── Desktop Actions & Themes ── */}
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-lg border transition ${
              isDark
                ? 'bg-slate-900 text-yellow-400 border-slate-800 hover:bg-slate-800 hover:border-yellow-500/50'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 hover:text-slate-950'
            }`}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          <button
            onClick={handleNewProjectClick}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold shadow-sm transition ${
              isDark
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900'
                : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
            }`}
            title="Start a new project (Reset canvas to default Ground)"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>

          <button
            onClick={() => setIsSaveLoadModalOpen(true)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold shadow-sm transition ${
              isDark
                ? 'bg-cyan-950 text-cyan-300 border-cyan-700/80 hover:bg-cyan-900'
                : 'bg-cyan-600 text-white border-cyan-700 hover:bg-cyan-700'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" /> Save/Load
          </button>

          <div className="relative" ref={presetsRef}>
            <button
              onClick={() => setIsPresetsOpen(!isPresetsOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold shadow-sm transition ${
                isPresetsOpen
                  ? isDark
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                    : 'bg-cyan-100 text-cyan-900 border-cyan-400'
                  : isDark
                  ? 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-500" />
              <span>Presets</span>
            </button>

            {isPresetsOpen && (
              <div
                className={`absolute right-0 top-full mt-1.5 w-64 border rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 ${
                  isDark ? 'bg-slate-900/98 border-slate-700 text-slate-200 backdrop-blur-md' : 'bg-white border-slate-200 shadow-2xl text-slate-800'
                }`}
              >
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800/40 mb-1">
                  Standard Lab Experiments
                </div>
                <button
                  onClick={() => {
                    loadPreset('bjt_small_signal_amp');
                    setIsPresetsOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-cyan-500/15 hover:text-cyan-400 transition flex flex-col group"
                >
                  <span className="font-semibold text-slate-200 group-hover:text-cyan-400">⚡ BJT Small Signal Amplifier</span>
                  <span className="text-[10px] text-slate-400 font-mono">AC Amp + Cin/Cout + Dual Scope</span>
                </button>
                <button
                  onClick={() => {
                    loadPreset('full_adder');
                    setIsPresetsOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-cyan-500/15 hover:text-cyan-400 transition flex flex-col group"
                >
                  <span className="font-semibold text-slate-200 group-hover:text-cyan-400">🧮 Full Adder (3-Input Logic)</span>
                  <span className="text-[10px] text-slate-400 font-mono">XOR + AND + OR + SUM/Cout LEDs</span>
                </button>
                <button
                  onClick={() => {
                    loadPreset('full_wave_rectifier_cap');
                    setIsPresetsOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-cyan-500/15 hover:text-cyan-400 transition flex flex-col group"
                >
                  <span className="font-semibold text-slate-200 group-hover:text-cyan-400">〰️ Full Wave Rectifier + Cap</span>
                  <span className="text-[10px] text-slate-400 font-mono">4-Diode Bridge + Smoothing Filter</span>
                </button>
                <button
                  onClick={() => {
                    loadPreset('full_wave_rectifier');
                    setIsPresetsOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-cyan-500/15 hover:text-cyan-400 transition flex flex-col group"
                >
                  <span className="font-semibold text-slate-200 group-hover:text-cyan-400">⚡ Full Wave Bridge Rectifier</span>
                  <span className="text-[10px] text-slate-400 font-mono">4-Diode Unfiltered Pulsating DC</span>
                </button>
                <button
                  onClick={() => {
                    loadPreset('bjt_dc_bias');
                    setIsPresetsOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-cyan-500/15 hover:text-cyan-400 transition flex flex-col group"
                >
                  <span className="font-semibold text-slate-200 group-hover:text-cyan-400">🔌 BJT Transistor Circuit (DC Bias)</span>
                  <span className="text-[10px] text-slate-400 font-mono">Q-point Characterization + Meters</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile/Tablet Controls (< 1024px) ── */}
        <div className="flex lg:hidden items-center gap-1.5">
          {/* Quick Play/Pause */}
          {isRunning ? (
            <button
              onClick={pauseSimulation}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-bold text-xs shadow-md transition"
              title="Pause Simulation"
            >
              <Pause className="w-3.5 h-3.5 fill-slate-950" />
              <span>{simulationState.currentTime.toFixed(1)}s</span>
            </button>
          ) : (
            <button
              onClick={startSimulation}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-gradient-to-r from-green-500 to-emerald-400 text-slate-950 font-bold text-xs shadow-md transition"
              title="Run Simulation"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>Run</span>
            </button>
          )}

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-lg border transition ${
              isDark
                ? 'bg-slate-900 text-yellow-400 border-slate-800'
                : 'bg-slate-100 text-slate-700 border-slate-300'
            }`}
            title="Toggle Theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
          </button>

          {/* Mobile Hamburger Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`p-2 rounded-xl border transition ${
              isMobileMenuOpen
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                : isDark ? 'bg-slate-900 text-slate-200 border-slate-800' : 'bg-slate-100 text-slate-800 border-slate-300'
            }`}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── Mobile Menu Dropdown Drawer ── */}
      {isMobileMenuOpen && (
        <>
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden animate-in fade-in duration-150"
          />
          <div
            className={`fixed top-14 left-0 right-0 z-30 lg:hidden p-3 border-b max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-top-2 duration-200 ${
              isDark
                ? 'bg-slate-950/95 border-slate-800 text-slate-100 backdrop-blur-xl'
                : 'bg-white/95 border-slate-200 text-slate-900 backdrop-blur-xl'
            }`}
          >
            <div className="space-y-3">
              {/* Simulation Mode & Speed Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className={`p-2 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Mode</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSimulationMode('virtual')}
                      className={`flex-1 py-1 rounded text-xs font-semibold ${
                        simulationState.mode === 'virtual' ? 'bg-cyan-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      Virtual
                    </button>
                    <button
                      onClick={() => setSimulationMode('hil')}
                      className={`flex-1 py-1 rounded text-xs font-semibold flex items-center justify-center gap-1 ${
                        simulationState.mode === 'hil' ? 'bg-orange-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      <Radio className="w-3 h-3" /> HIL
                    </button>
                  </div>
                </div>

                <div className={`p-2 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Speed & Clock</label>
                  <div className="flex items-center gap-1">
                    <select
                      value={simulationState.config.speedMultiplier ?? 0.05}
                      onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                      className="w-full bg-transparent text-xs font-mono font-bold outline-none"
                    >
                      <option value="0.05">0.05x Speed</option>
                      <option value="0.1">0.1x Speed</option>
                      <option value="0.25">0.25x Speed</option>
                      <option value="0.5">0.5x Speed</option>
                      <option value="1">1.0x Realtime</option>
                    </select>
                    <button
                      onClick={resetSimulation}
                      className="p-1 rounded text-slate-400 hover:text-slate-200"
                      title="Reset Clock"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Performance Mode */}
              <button
                onClick={() => setPerformanceMode(!performanceMode)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                  performanceMode
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : isDark ? 'bg-slate-900/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${performanceMode ? 'text-amber-400 fill-current' : 'text-slate-400'}`} />
                  <span>Performance Mode (Low CPU)</span>
                </div>
                <span className="text-[10px] font-mono font-bold">{performanceMode ? 'ON' : 'OFF'}</span>
              </button>

              {/* Virtual Instruments Grid */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Instruments</label>
                <div className="grid grid-cols-3 gap-1.5 font-medium text-xs">
                  <button
                    onClick={() => {
                      setShowOscilloscope(!showOscilloscope);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 ${
                      showOscilloscope ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'
                    }`}
                  >
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>Oscilloscope</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowLogicAnalyzer(!showLogicAnalyzer);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 ${
                      showLogicAnalyzer ? 'bg-green-500/20 text-green-400 border-green-500/40' : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'
                    }`}
                  >
                    <Cpu className="w-4 h-4 text-green-400" />
                    <span>Logic Pod</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowHILBridge(!showHILBridge);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 ${
                      showHILBridge ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'
                    }`}
                  >
                    <Radio className="w-4 h-4 text-orange-400" />
                    <span>HIL Bridge</span>
                  </button>
                </div>
              </div>

              {/* AI, Truth Table & Characteristic Curve */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setShowAICircuitModal(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-gradient-to-r from-purple-900/80 to-indigo-900/80 border border-purple-600 text-purple-200 text-xs font-bold shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>AI Gen</span>
                </button>

                <button
                  onClick={() => {
                    setShowTruthTable(!showTruthTable);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold ${
                    showTruthTable ? 'bg-violet-900/40 text-violet-300 border-violet-500' : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5 text-violet-400" />
                  <span>Truth Table</span>
                </button>

                <button
                  onClick={() => {
                    setShowCharacteristicCurve(!showCharacteristicCurve);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold ${
                    showCharacteristicCurve ? 'bg-amber-900/40 text-amber-300 border-amber-500' : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'
                  }`}
                >
                  <LineChart className="w-3.5 h-3.5 text-amber-400" />
                  <span>Curve</span>
                </button>
              </div>

              {/* Projects & Presets */}
              <div className="grid grid-cols-3 gap-1.5 text-xs font-semibold pt-1 border-t border-slate-800/60">
                <button
                  onClick={() => {
                    handleNewProjectClick();
                    setIsMobileMenuOpen(false);
                  }}
                  className="py-2 px-2 rounded-xl bg-emerald-950/60 text-emerald-300 border border-emerald-800 flex items-center justify-center gap-1"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>

                <button
                  onClick={() => {
                    setIsSaveLoadModalOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="py-2 px-2 rounded-xl bg-blue-950/60 text-blue-300 border border-blue-800 flex items-center justify-center gap-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Save/Load</span>
                </button>

                <button
                  onClick={() => {
                    loadPreset('starter_rlc');
                    setIsMobileMenuOpen(false);
                  }}
                  className="py-2 px-2 rounded-xl bg-purple-950/60 text-purple-300 border border-purple-800 flex items-center justify-center gap-1"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>RLC Demo</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <SaveLoadCircuitModal
        isOpen={isSaveLoadModalOpen}
        onClose={() => setIsSaveLoadModalOpen(false)}
      />

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
      />

      <TruthTableModal />
      <CharacteristicCurveModal />
      <AICircuitModal />
    </>
  );
};
