// ============================================================
// VirtualLab-HIL — Component Properties Inspector Panel
// ============================================================

import React, { useRef, useEffect } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import { COMPONENT_REGISTRY } from '@/components/canvas/componentDefs';
import type { WaveformType } from '@/types/circuit';
import { evaluateWaveform } from '@/engine/mnaSolver';
import {
  Sliders, Trash2, X, Activity, Zap, Cpu, Radio, Gauge,
  Layers, Check,
} from 'lucide-react';
import { logger } from '@/utils/logger';

interface WaveformPreviewCanvasProps {
  waveform: WaveformType;
  amplitude: number;
  frequency: number;
  offset: number;
  dutyCycle: number;
  phase: number;
  isDark: boolean;
}

const WaveformPreviewCanvas: React.FC<WaveformPreviewCanvasProps> = ({
  waveform,
  amplitude,
  frequency,
  offset,
  dutyCycle,
  phase,
  isDark,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = isDark ? '#050811' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(203, 213, 225, 0.6)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Zero-voltage center line
    ctx.strokeStyle = isDark ? '#475569' : '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw 2 complete wave cycles
    ctx.strokeStyle = isDark ? '#a855f7' : '#7c3aed';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = isDark ? 'rgba(168, 85, 247, 0.6)' : 'rgba(124, 58, 237, 0.3)';
    ctx.shadowBlur = isDark ? 6 : 0;
    ctx.beginPath();

    const freqSafe = Math.max(0.1, frequency || 1);
    const period = 1 / freqSafe;
    const totalT = period * 2;
    const maxScale = Math.max(Math.abs(amplitude) + Math.abs(offset), 1);

    for (let px = 0; px < w; px++) {
      const t = (px / w) * totalT;
      const v = evaluateWaveform(waveform, amplitude, freqSafe, phase, offset, t, dutyCycle / 100);
      const py = h / 2 - (v / maxScale) * (h / 2 - 8);
      if (px === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [waveform, amplitude, frequency, offset, dutyCycle, phase, isDark]);

  return (
    <div className={`rounded-xl overflow-hidden border p-1 shadow-inner ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
      <canvas ref={canvasRef} width={280} height={90} className="w-full h-[90px] block rounded-lg" />
      <div className="flex items-center justify-between px-2 pt-1 text-[9px] font-mono text-slate-500">
        <span>0V Baseline</span>
        <span className="text-purple-400 font-bold">{amplitude.toFixed(1)}Vpk ({frequency >= 1000 ? `${(frequency/1000).toFixed(1)}kHz` : `${frequency.toFixed(0)}Hz`})</span>
        <span>2 Cycles</span>
      </div>
    </div>
  );
};

export const ComponentInspector: React.FC = () => {
  const selectedComponentId = useCircuitStore((s) => s.selectedComponentId);
  const selectComponent = useCircuitStore((s) => s.selectComponent);
  const components = useCircuitStore((s) => s.components);
  const updateComponentParams = useCircuitStore((s) => s.updateComponentParams);
  const removeComponent = useCircuitStore((s) => s.removeComponent);
  const showInspector = useCircuitStore((s) => s.showInspector);
  const setShowInspector = useCircuitStore((s) => s.setShowInspector);
  const setShowOscilloscope = useCircuitStore((s) => s.setShowOscilloscope);
  const simulationState = useCircuitStore((s) => s.simulationState);
  const performanceMode = useCircuitStore((s) => s.performanceMode);
  const setPerformanceMode = useCircuitStore((s) => s.setPerformanceMode);
  const setSpeedMultiplier = useCircuitStore((s) => s.setSpeedMultiplier);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  if (!showInspector) return null;

  const comp = selectedComponentId ? components[selectedComponentId] : null;
  const compList = Object.values(components);

  if (!comp) {
    return (
      <>
        {/* Backdrop overlay on mobile */}
        <div
          onClick={() => setShowInspector(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden animate-in fade-in duration-150"
        />

        <aside
          className={`fixed inset-y-0 right-0 z-40 lg:relative lg:z-10 w-84 lg:w-80 max-w-[90vw] h-full border-l flex flex-col backdrop-blur-2xl select-none shadow-2xl lg:shadow-none transition-colors duration-200 animate-in slide-in-from-right duration-200 ${
            isDark
              ? 'bg-slate-950/95 border-slate-800 text-slate-100'
              : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
          }`}
        >
        {/* Header */}
        <div
          className={`p-3.5 border-b flex items-center justify-between ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Sliders className="w-4 h-4 text-cyan-500" />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider">Circuit Settings</h2>
              <p className="text-[10px] text-slate-500 font-mono">{compList.length} Components Placed</p>
            </div>
          </div>
          <button
            onClick={() => setShowInspector(false)}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Settings & Component Selection List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs custom-scrollbar">
          {/* Tip Card */}
          <div
            className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
              isDark ? 'bg-cyan-950/30 border-cyan-800/50 text-cyan-200' : 'bg-cyan-50 border-cyan-200 text-cyan-800'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5 mb-1">
              <Sliders className="w-3.5 h-3.5" /> Component Inspector
            </div>
            Click on any widget on the canvas (or select one below) to modify its values, resistance, voltage, frequencies, and model parameters.
          </div>

          {/* Performance Mode (CPU / GPU Optimization) */}
          <div className={`p-3 rounded-xl border space-y-2 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className={`w-3.5 h-3.5 ${performanceMode ? 'text-amber-400 fill-current' : 'text-slate-400'}`} />
                <span className="text-[11px] font-semibold text-slate-300">Performance Mode</span>
              </div>
              <button
                onClick={() => setPerformanceMode(!performanceMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  performanceMode ? 'bg-amber-500' : isDark ? 'bg-slate-800' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    performanceMode ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              {performanceMode
                ? '⚡ Active: 6 sub-steps, downsampled waveforms, and minimal wire effects for maximum frame rates.'
                : 'Full visual quality. Turn on to reduce CPU consumption and prevent thermal throttling.'}
            </p>
          </div>

          {/* Simulation Speed */}
          <div className={`p-3 rounded-xl border space-y-2.5 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex justify-between items-center text-[11px] font-semibold text-slate-400">
              <span>Simulation Speed Multiplier</span>
              <span className="font-mono text-amber-400 font-bold">{simulationState.config.speedMultiplier ?? 1.0}x</span>
            </div>
            <div className="grid grid-cols-5 gap-1 font-mono text-[10px]">
              {[0.05, 0.1, 0.25, 0.5, 1.0].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSpeedMultiplier(spd)}
                  className={`py-1.5 rounded border transition ${
                    (simulationState.config.speedMultiplier ?? 1.0) === spd
                      ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Placed Components Quick Selector */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Placed Circuit Components ({compList.length})
            </h3>
            {compList.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">No components on canvas yet. Drag items from the left palette to begin!</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {compList.map((c) => {
                  const m = COMPONENT_REGISTRY[c.kind] || COMPONENT_REGISTRY.resistor;
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectComponent(c.id)}
                      className={`w-full p-2 rounded-lg border text-left flex items-center justify-between transition ${
                        isDark
                          ? 'bg-slate-900/80 border-slate-800 hover:border-cyan-500 hover:bg-slate-800'
                          : 'bg-white border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/50'
                      }`}
                    >
                      <div className="truncate">
                        <div className="font-bold text-[11px] truncate">{c.label}</div>
                        <div className="text-[9px] text-slate-500 font-mono">{m.name}</div>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-mono font-semibold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800">
                        Configure
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
    );
  }

  const meta = COMPONENT_REGISTRY[comp.kind] || COMPONENT_REGISTRY.resistor;
  const params = comp.params;

  return (
    <>
      {/* Backdrop overlay on mobile */}
      <div
        onClick={() => setShowInspector(false)}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden animate-in fade-in duration-150"
      />

      <aside
        className={`fixed inset-y-0 right-0 z-40 lg:relative lg:z-10 w-84 lg:w-80 max-w-[90vw] h-full border-l flex flex-col backdrop-blur-2xl select-none shadow-2xl lg:shadow-none transition-colors duration-200 animate-in slide-in-from-right duration-200 ${
          isDark
            ? 'bg-slate-950/95 border-slate-800 text-slate-100'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
        }`}
      >
      {/* ── Header ── */}
      <div
        className={`p-3.5 border-b flex items-center justify-between ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <Sliders className="w-4 h-4 text-cyan-500" />
          <div className="truncate">
            <h2 className="text-xs font-bold uppercase tracking-wider">{comp.label}</h2>
            <p className="text-[10px] text-slate-500 font-mono">ID: {comp.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              removeComponent(comp.id);
              logger.info('canvas', `Deleted component "${comp.label}" from Inspector`);
            }}
            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-500/10 transition"
            title="Delete component"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => selectComponent(null)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-500/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Parameter Controls Form ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs custom-scrollbar">
        {/* Component Description Card */}
        <div
          className={`p-2.5 rounded-lg border text-[11px] leading-relaxed ${
            isDark ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-slate-100/80 border-slate-200 text-slate-600'
          }`}
        >
          {meta.description}
        </div>

        {/* ── RESISTOR ── */}
        {comp.kind === 'resistor' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Resistance Value (Ω)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.1"
                  step="10"
                  value={params.resistance ?? 1000}
                  onChange={(e) => updateComponentParams(comp.id, { resistance: Math.max(0.1, parseFloat(e.target.value) || 1) })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-cyan-500 font-bold">Ω</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-[10px] text-slate-500 block mb-1.5">Standard Values</span>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                {[100, 330, 1000, 4700, 10000, 100000].map((r) => (
                  <button
                    key={r}
                    onClick={() => updateComponentParams(comp.id, { resistance: r })}
                    className={`py-1 rounded border transition ${
                      params.resistance === r
                        ? 'bg-cyan-500 text-white border-cyan-600 font-bold'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {r >= 1000 ? `${r / 1000}kΩ` : `${r}Ω`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DIODE ── */}
        {comp.kind === 'diode' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Saturation Current (Is)
              </label>
              <input
                type="number"
                step="1e-15"
                value={params.saturationCurrent ?? 1e-14}
                onChange={(e) => updateComponentParams(comp.id, { saturationCurrent: parseFloat(e.target.value) || 1e-14 })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Ideality Factor (n)
              </label>
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="2.0"
                value={params.ideality ?? 1.0}
                onChange={(e) => updateComponentParams(comp.id, { ideality: parseFloat(e.target.value) || 1.0 })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        )}

        {/* ── CAPACITOR ── */}
        {comp.kind === 'capacitor' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Capacitance Value (Farads)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  value={params.capacitance ?? 10e-6}
                  onChange={(e) => updateComponentParams(comp.id, { capacitance: Math.max(1e-15, parseFloat(e.target.value) || 1e-6) })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-cyan-500 font-bold">F</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-[10px] text-slate-500 block mb-1.5">Common Values</span>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                {[
                  { label: '100pF', val: 100e-12 },
                  { label: '1nF', val: 1e-9 },
                  { label: '10nF', val: 10e-9 },
                  { label: '100nF', val: 100e-9 },
                  { label: '1µF', val: 1e-6 },
                  { label: '10µF', val: 10e-6 },
                  { label: '100µF', val: 100e-6 },
                  { label: '470µF', val: 470e-6 },
                  { label: '1000µF', val: 1000e-6 },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => updateComponentParams(comp.id, { capacitance: item.val })}
                    className={`py-1 rounded border transition ${
                      params.capacitance === item.val
                        ? 'bg-cyan-500 text-white border-cyan-600 font-bold'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── INDUCTOR ── */}
        {comp.kind === 'inductor' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Inductance Value (Henries)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  value={params.inductance ?? 10e-3}
                  onChange={(e) => updateComponentParams(comp.id, { inductance: Math.max(1e-12, parseFloat(e.target.value) || 1e-3) })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-cyan-500 font-bold">H</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-[10px] text-slate-500 block mb-1.5">Common Values</span>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                {[
                  { label: '10µH', val: 10e-6 },
                  { label: '100µH', val: 100e-6 },
                  { label: '1mH', val: 1e-3 },
                  { label: '10mH', val: 10e-3 },
                  { label: '100mH', val: 100e-3 },
                  { label: '1H', val: 1.0 },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => updateComponentParams(comp.id, { inductance: item.val })}
                    className={`py-1 rounded border transition ${
                      params.inductance === item.val
                        ? 'bg-cyan-500 text-white border-cyan-600 font-bold'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ARBITRARY FUNCTION GENERATOR & AC VOLTAGE SOURCE ── */}
        {(comp.kind === 'signal_generator' || comp.kind === 'ac_voltage') && (
          <div className="space-y-4">
            {/* Live Waveform Preview Display */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>Waveform Output Monitor</span>
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  {params.waveform || 'sine'}
                </span>
              </div>
              <WaveformPreviewCanvas
                waveform={(params.waveform as WaveformType) || 'sine'}
                amplitude={params.voltage ?? params.amplitude ?? 5.0}
                frequency={params.frequency ?? 1000}
                offset={params.offset ?? 0}
                dutyCycle={params.dutyCycle ?? 50}
                phase={params.phase ?? 0}
                isDark={isDark}
              />
            </div>

            {/* Waveform Selection Buttons */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                Waveform Type
              </label>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                {(['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'cosine', 'dc'] as WaveformType[]).map((w) => {
                  const isActive = params.waveform === w || (!params.waveform && w === 'sine');
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => updateComponentParams(comp.id, { waveform: w })}
                      className={`py-1.5 uppercase rounded-lg border font-bold transition flex items-center justify-center gap-1 ${
                        isActive
                          ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/30'
                          : isDark
                          ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                          : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{w}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Frequency Settings */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>Frequency</span>
                <span className="font-mono text-purple-400 font-bold">
                  {(params.frequency ?? 1000) >= 1000000
                    ? `${((params.frequency ?? 1000) / 1000000).toFixed(2)} MHz`
                    : (params.frequency ?? 1000) >= 1000
                    ? `${((params.frequency ?? 1000) / 1000).toFixed(2)} kHz`
                    : `${(params.frequency ?? 1000).toFixed(1)} Hz`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.1"
                  step="1"
                  value={params.frequency ?? 1000}
                  onChange={(e) =>
                    updateComponentParams(comp.id, { frequency: Math.max(0.1, parseFloat(e.target.value) || 1) })
                  }
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono text-sm outline-none focus:border-purple-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-purple-400 font-bold text-xs">Hz</span>
              </div>
              {/* Quick Frequency Multipliers */}
              <div className="grid grid-cols-5 gap-1 font-mono text-[9px]">
                {[1, 10, 50, 100, 1000].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => updateComponentParams(comp.id, { frequency: f })}
                    className={`py-1 rounded border text-center transition ${
                      params.frequency === f
                        ? 'bg-purple-900/60 text-purple-200 border-purple-500 font-bold'
                        : isDark
                        ? 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                        : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f >= 1000 ? `${f / 1000}k` : `${f}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Peak Amplitude */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>Peak Amplitude (Vpk)</span>
                <span className="font-mono text-amber-400 font-bold">
                  {(params.voltage ?? params.amplitude ?? 5.0).toFixed(2)} V
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="100"
                  value={params.voltage ?? params.amplitude ?? 5.0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    updateComponentParams(comp.id, { voltage: v, amplitude: v });
                  }}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono text-sm outline-none focus:border-amber-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-amber-400 font-bold text-xs">V</span>
              </div>
              {/* Amplitude Presets */}
              <div className="grid grid-cols-5 gap-1 font-mono text-[9px]">
                {[0.5, 1.0, 2.5, 5.0, 10.0].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateComponentParams(comp.id, { voltage: v, amplitude: v })}
                    className={`py-1 rounded border text-center transition ${
                      (params.voltage ?? params.amplitude) === v
                        ? 'bg-amber-900/60 text-amber-200 border-amber-500 font-bold'
                        : isDark
                        ? 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                        : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {v}V
                  </button>
                ))}
              </div>
            </div>

            {/* DC Offset */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>DC Offset</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-300 font-bold">
                    {(params.offset ?? 0) >= 0 ? `+${(params.offset ?? 0).toFixed(2)}` : (params.offset ?? 0).toFixed(2)} V
                  </span>
                  {(params.offset ?? 0) !== 0 && (
                    <button
                      type="button"
                      onClick={() => updateComponentParams(comp.id, { offset: 0 })}
                      className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 hover:text-white"
                    >
                      Reset 0V
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min="-15"
                max="15"
                step="0.1"
                value={params.offset ?? 0}
                onChange={(e) => updateComponentParams(comp.id, { offset: parseFloat(e.target.value) || 0 })}
                className="w-full h-1 bg-slate-800 rounded accent-purple-400"
              />
            </div>

            {/* Duty Cycle (for square / pulse) */}
            {(params.waveform === 'square' || params.waveform === 'pulse') && (
              <div className="space-y-1 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>Pulse Duty Cycle</span>
                  <span className="font-mono text-purple-300 font-bold">
                    {Math.round((params.dutyCycle ?? 50) <= 1 ? (params.dutyCycle ?? 0.5) * 100 : (params.dutyCycle ?? 50))}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="99"
                  step="1"
                  value={(params.dutyCycle ?? 50) <= 1 ? Math.round((params.dutyCycle ?? 0.5) * 100) : (params.dutyCycle ?? 50)}
                  onChange={(e) => updateComponentParams(comp.id, { dutyCycle: parseInt(e.target.value) || 50 })}
                  className="w-full h-1 bg-slate-800 rounded accent-purple-400"
                />
              </div>
            )}

            {/* Phase Shift */}
            <div className="space-y-1 pt-1 border-t border-slate-800">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>Phase Shift</span>
                <span className="font-mono text-slate-300 font-bold">{(params.phase ?? 0).toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={params.phase ?? 0}
                onChange={(e) => updateComponentParams(comp.id, { phase: parseFloat(e.target.value) || 0 })}
                className="w-full h-1 bg-slate-800 rounded accent-purple-400"
              />
            </div>
          </div>
        )}

        {/* ── OSCILLOSCOPE PROBE ── */}
        {comp.kind === 'oscilloscope' && (
          <div className="space-y-4">
            <div className={`p-3 rounded-xl border space-y-3 ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Channel Assignment</span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  (params.scopeChannel ?? 1) === 1 ? (isDark ? 'bg-cyan-950 text-cyan-300 border-cyan-600' : 'bg-cyan-100 text-cyan-900 border-cyan-400') :
                  (params.scopeChannel ?? 1) === 2 ? (isDark ? 'bg-amber-950 text-amber-300 border-amber-600' : 'bg-amber-100 text-amber-900 border-amber-400') :
                  (params.scopeChannel ?? 1) === 3 ? (isDark ? 'bg-emerald-950 text-emerald-300 border-emerald-600' : 'bg-emerald-100 text-emerald-900 border-emerald-400') :
                  (isDark ? 'bg-purple-950 text-purple-300 border-purple-600' : 'bg-purple-100 text-purple-900 border-purple-400')
                }`}>
                  CH {params.scopeChannel ?? 1}
                </span>
              </div>

              {/* 4-Channel Grid Selector with live collision swapping */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { ch: 1 as const, name: 'CH 1 (Cyan)', activeClass: isDark ? 'bg-cyan-950 border-cyan-500 text-cyan-200' : 'bg-cyan-100 border-cyan-600 text-cyan-950' },
                  { ch: 2 as const, name: 'CH 2 (Amber)', activeClass: isDark ? 'bg-amber-950 border-amber-500 text-amber-200' : 'bg-amber-100 border-amber-600 text-amber-950' },
                  { ch: 3 as const, name: 'CH 3 (Emerald)', activeClass: isDark ? 'bg-emerald-950 border-emerald-500 text-emerald-200' : 'bg-emerald-100 border-emerald-600 text-emerald-950' },
                  { ch: 4 as const, name: 'CH 4 (Purple)', activeClass: isDark ? 'bg-purple-950 border-purple-500 text-purple-200' : 'bg-purple-100 border-purple-600 text-purple-950' },
                ].map((item) => {
                  const isCurrent = (params.scopeChannel ?? 1) === item.ch;
                  const otherOwner = Object.values(components).find(
                    (c) => c.id !== comp.id && c.kind === 'oscilloscope' && (c.params.scopeChannel ?? 1) === item.ch
                  );
                  return (
                    <button
                      key={item.ch}
                      type="button"
                      onClick={() => updateComponentParams(comp.id, { scopeChannel: item.ch })}
                      className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition ${
                        isCurrent
                          ? `${item.activeClass} font-bold shadow-md ring-1 ring-cyan-500/50`
                          : isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>{item.name}</span>
                        {isCurrent && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 truncate">
                        {otherOwner ? `Swaps with ${otherOwner.label}` : 'Available'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowOscilloscope(true)}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                isDark
                  ? 'bg-cyan-600/25 hover:bg-cyan-600/35 border border-cyan-500/50 text-cyan-300 shadow-cyan-950/50'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-500/20'
              }`}
            >
              <Activity className="w-4 h-4" /> Open Full Oscilloscope
            </button>
          </div>
        )}

        {/* ── DC VOLTAGE SOURCE ── */}
        {comp.kind === 'dc_voltage' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                DC Voltage Output (V)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={params.voltage ?? 5.0}
                  onChange={(e) => updateComponentParams(comp.id, { voltage: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-yellow-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-yellow-500 font-bold">V</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
              {[1.8, 3.3, 5.0, 9.0, 12.0, 15.0, 24.0, 48.0].map((v) => (
                <button
                  key={v}
                  onClick={() => updateComponentParams(comp.id, { voltage: v })}
                  className={`py-1 rounded border transition ${
                    params.voltage === v
                      ? 'bg-yellow-500 text-slate-950 border-yellow-600 font-bold'
                      : isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {v}V
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── CURRENT SOURCE ── */}
        {comp.kind === 'current_source' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                DC Current Output (Amperes)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  value={params.current ?? 0.01}
                  onChange={(e) => updateComponentParams(comp.id, { current: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-amber-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-amber-500 font-bold">A</span>
              </div>
            </div>

            {/* Presets */}
            <div>
              <span className="text-[10px] text-slate-500 block mb-1.5">Standard Currents</span>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                {[
                  { label: '1mA', val: 0.001 },
                  { label: '5mA', val: 0.005 },
                  { label: '10mA', val: 0.01 },
                  { label: '20mA', val: 0.02 },
                  { label: '50mA', val: 0.05 },
                  { label: '100mA', val: 0.1 },
                  { label: '500mA', val: 0.5 },
                  { label: '1A', val: 1.0 },
                  { label: '2A', val: 2.0 },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => updateComponentParams(comp.id, { current: item.val })}
                    className={`py-1 rounded border transition ${
                      params.current === item.val
                        ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── BJT TRANSISTORS (NPN / PNP) ── */}
        {(comp.kind === 'bjt_npn' || comp.kind === 'bjt_pnp') && (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                <span>Current Gain (Beta / hFE)</span>
                <span className="text-purple-400 font-mono font-bold">{params.beta ?? 100}</span>
              </div>
              <input
                type="range"
                min="10"
                max="500"
                step="5"
                value={params.beta ?? 100}
                onChange={(e) => updateComponentParams(comp.id, { beta: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
              {[50, 100, 200, 300].map((b) => (
                <button
                  key={b}
                  onClick={() => updateComponentParams(comp.id, { beta: b })}
                  className={`py-1 rounded border transition ${
                    params.beta === b
                      ? 'bg-purple-500 text-white border-purple-600 font-bold'
                      : isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  β={b}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Early Voltage (Va)
              </label>
              <input
                type="number"
                step="10"
                min="10"
                max="1000"
                value={params.earlyVoltage ?? 100}
                onChange={(e) => updateComponentParams(comp.id, { earlyVoltage: parseFloat(e.target.value) || 100 })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-purple-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        )}

        {/* ── MOSFETS ── */}
        {(comp.kind.startsWith('mosfet')) && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Threshold Voltage (Vth)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={params.vth ?? 2.0}
                  onChange={(e) => updateComponentParams(comp.id, { vth: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-purple-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-purple-400 font-bold">V</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Process Transconductance (kn)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.0005"
                  value={params.kn ?? 0.002}
                  onChange={(e) => updateComponentParams(comp.id, { kn: parseFloat(e.target.value) || 0.001 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-purple-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-purple-400 font-bold">A/V²</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Channel Length Mod (λ)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.005"
                  min="0"
                  max="0.5"
                  value={params.lambda ?? 0.02}
                  onChange={(e) => updateComponentParams(comp.id, { lambda: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-purple-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── ZENER DIODE ── */}
        {comp.kind === 'zener' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Zener Breakdown Voltage (Vz)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={params.zenerVoltage ?? 5.1}
                  onChange={(e) => updateComponentParams(comp.id, { zenerVoltage: parseFloat(e.target.value) || 5.1 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-amber-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-amber-500 font-bold">V</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
              {[3.3, 5.1, 6.2, 9.1, 12.0, 15.0].map((vz) => (
                <button
                  key={vz}
                  onClick={() => updateComponentParams(comp.id, { zenerVoltage: vz })}
                  className={`py-1 rounded border transition ${
                    params.zenerVoltage === vz
                      ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                      : isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {vz}V
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Dynamic Impedance (Zz)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="100"
                value={params.zenerImpedance ?? 10}
                onChange={(e) => updateComponentParams(comp.id, { zenerImpedance: parseFloat(e.target.value) || 10 })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-amber-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        )}

        {/* ── OP-AMP (OPERATIONAL AMPLIFIER) ── */}
        {comp.kind === 'opamp' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Open-Loop Differential Gain (Aol)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10000"
                  value={params.openLoopGain ?? 100000}
                  onChange={(e) => updateComponentParams(comp.id, { openLoopGain: parseFloat(e.target.value) || 1000 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-cyan-400 font-bold">V/V</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Positive Rail (+Vcc)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    value={params.vcc ?? 15}
                    onChange={(e) => updateComponentParams(comp.id, { vcc: parseFloat(e.target.value) || 5 })}
                    className={`w-full px-2 py-1 rounded-lg border font-mono text-xs outline-none focus:border-cyan-500 ${
                      isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <span className="font-mono text-slate-400">V</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Negative Rail (-Vee)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    value={params.vee ?? -15}
                    onChange={(e) => updateComponentParams(comp.id, { vee: parseFloat(e.target.value) || 0 })}
                    className={`w-full px-2 py-1 rounded-lg border font-mono text-xs outline-none focus:border-cyan-500 ${
                      isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <span className="font-mono text-slate-400">V</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Output Resistance (Rout)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="5"
                  value={params.rout ?? 50}
                  onChange={(e) => updateComponentParams(comp.id, { rout: parseFloat(e.target.value) || 10 })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="font-mono text-cyan-400 font-bold">Ω</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Gain-Bandwidth Product (Hz)
              </label>
              <input
                type="number"
                value={params.gbw ?? 1000000}
                onChange={(e) => updateComponentParams(comp.id, { gbw: parseFloat(e.target.value) || 1000000 })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        )}

        {/* ── NE555 TIMER IC ── */}
        {comp.kind === 'ic555' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/40 text-[11px] font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-amber-400 font-bold">Internal Ladder:</span>
                <span className="text-slate-200">3x 5.0 kΩ (VCC/3 & 2VCC/3)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-400 font-bold">Discharge Transistor:</span>
                <span className="text-slate-200">Open-Collector NPN (10Ω On)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-400 font-bold">Output Stage:</span>
                <span className="text-slate-200">Totem-Pole High Current</span>
              </div>
            </div>
          </div>
        )}

        {/* ── CLOCK SOURCE ── */}
        {comp.kind === 'clock_source' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Period (s)
              </label>
              <input
                type="number"
                step="0.001"
                value={params.pulsePeriod ?? 0.001}
                onChange={(e) => updateComponentParams(comp.id, { pulsePeriod: parseFloat(e.target.value) || 0.001 })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-purple-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <div className="text-[10px] text-slate-500 mt-1">
                Frequency: {(params.pulsePeriod && params.pulsePeriod > 0) ? (1 / params.pulsePeriod).toFixed(2) : 1000} Hz
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Duty Cycle (%)
              </label>
              <input
                type="range"
                min="1"
                max="99"
                step="1"
                value={params.dutyCycle ?? 50}
                onChange={(e) => updateComponentParams(comp.id, { dutyCycle: parseInt(e.target.value) || 50 })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="text-[10px] text-slate-500 mt-1">{params.dutyCycle ?? 50}%</div>
            </div>
          </div>
        )}

        {/* ── DIGITAL INPUT ── */}
        {comp.kind === 'digital_input' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Input Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                {(['Toggle', 'Momentary', 'External'] as const).map((mode) => {
                  const m = mode.toLowerCase() as 'toggle' | 'momentary' | 'external';
                  return (
                    <button
                      key={m}
                      onClick={() => updateComponentParams(comp.id, { inputMode: m })}
                      className={`py-1.5 rounded border transition font-bold ${
                        (params.inputMode ?? 'toggle') === m
                          ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                          : isDark
                          ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isTruthTableInput"
                checked={!!params.isTruthTableInput}
                onChange={(e) => updateComponentParams(comp.id, { isTruthTableInput: e.target.checked })}
                className="rounded border-slate-700 text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="isTruthTableInput" className="text-[11px] font-semibold text-slate-400 cursor-pointer">
                Use as Truth Table Input
              </label>
            </div>
            {params.isTruthTableInput && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  placeholder="A"
                  value={params.truthTableLabel ?? ''}
                  onChange={(e) => updateComponentParams(comp.id, { truthTableLabel: e.target.value })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-blue-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            )}
          </div>
        )}

        {/* ── DIGITAL OUTPUT ── */}
        {comp.kind === 'digital_output' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isTruthTableOutput"
                checked={!!params.isTruthTableOutput}
                onChange={(e) => updateComponentParams(comp.id, { isTruthTableOutput: e.target.checked })}
                className="rounded border-slate-700 text-green-500 focus:ring-green-500"
              />
              <label htmlFor="isTruthTableOutput" className="text-[11px] font-semibold text-slate-400 cursor-pointer">
                Use as Truth Table Output
              </label>
            </div>
            {params.isTruthTableOutput && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  placeholder="Y"
                  value={params.truthTableLabel ?? ''}
                  onChange={(e) => updateComponentParams(comp.id, { truthTableLabel: e.target.value })}
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-green-500 ${
                    isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            )}
          </div>
        )}

        {/* ── DIGITAL LOGIC GATES (Configurable Input Count) ── */}
        {comp.kind.startsWith('gate_') && (
          <div className="space-y-3">
            {(comp.kind === 'gate_and' ||
              comp.kind === 'gate_or' ||
              comp.kind === 'gate_nand' ||
              comp.kind === 'gate_nor' ||
              comp.kind === 'gate_xor' ||
              comp.kind === 'gate_xnor') && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Number of Inputs
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
                    {[2, 3, 4, 8].map((num) => (
                      <button
                        key={num}
                        onClick={() => updateComponentParams(comp.id, { inputCount: num })}
                        className={`py-1.5 rounded border transition font-bold ${
                          (params.inputCount ?? 2) === num
                            ? 'bg-green-600 text-white border-green-500 shadow-sm'
                            : isDark
                            ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {num}-In
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[10px] font-mono text-slate-300 space-y-1 shadow-inner">
                  <div className="flex justify-between">
                    <span className="text-green-400 font-bold">Input Pins:</span>
                    <span>{Array.from({ length: params.inputCount ?? 2 }, (_, i) => String.fromCharCode(65 + i)).join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cyan-400 font-bold">Output Pin:</span>
                    <span>Y (50Ω CMOS)</span>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Propagation Delay (s)
              </label>
              <input
                type="number"
                step="0.00001"
                min="0"
                max="0.01"
                value={params.propagationDelay ?? 0.0001}
                onChange={(e) => updateComponentParams(comp.id, { propagationDelay: parseFloat(e.target.value) || 0.0001 })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-green-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        )}

        {/* ── SEQUENTIAL FLIP-FLOPS & LATCHES (JK, SR, D, T) ── */}
        {(comp.kind === 'ff_jk' ||
          comp.kind === 'ff_sr' ||
          comp.kind === 'ff_d' ||
          comp.kind === 'ff_t' ||
          comp.kind === 'latch_sr' ||
          comp.kind === 'latch_d' ||
          comp.kind === 'latch_jk') && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Clock / Enable Trigger Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                {[
                  { mode: 'rising_edge', label: '↑ Rising Edge' },
                  { mode: 'falling_edge', label: '↓ Falling Edge' },
                  { mode: 'level_high', label: '▔ Active High' },
                  { mode: 'level_low', label: '  Active Low' },
                ].map((item) => (
                  <button
                    key={item.mode}
                    onClick={() => updateComponentParams(comp.id, { triggerType: item.mode as any })}
                    className={`py-1.5 px-2 rounded border text-left transition ${
                      (params.triggerType ?? (comp.kind.startsWith('ff_') ? 'rising_edge' : 'level_high')) === item.mode
                        ? 'bg-purple-600 text-white border-purple-500 font-bold shadow-sm'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">{item.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Function / Truth Table Summary */}
            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[10px] font-mono text-slate-300 space-y-1.5 shadow-inner">
              <div className="font-bold text-purple-400 border-b border-slate-800 pb-1">
                {comp.kind === 'ff_jk' ? 'JK Flip-Flop Function Table' :
                 comp.kind === 'ff_sr' ? 'SR Flip-Flop Function Table' :
                 comp.kind === 'ff_d' ? 'D Flip-Flop Function Table' :
                 comp.kind === 'ff_t' ? 'T Flip-Flop Function Table' :
                 comp.kind === 'latch_sr' ? 'SR Latch Function Table' :
                 comp.kind === 'latch_d' ? 'D Latch Function Table' : 'JK Latch Function Table'}
              </div>
              {comp.kind === 'ff_jk' && (
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-400">J=0, K=0</span><span>Q (Hold / No Change)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">J=0, K=1</span><span>0 (Reset)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">J=1, K=0</span><span>1 (Set)</span></div>
                  <div className="flex justify-between"><span className="text-purple-400 font-bold">J=1, K=1</span><span className="text-purple-300 font-bold">Q̄ (Toggle)</span></div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-0.5 text-amber-400"><span>CLR=1 / SET=1</span><span>Async Clear / Preset</span></div>
                </div>
              )}
              {comp.kind === 'ff_sr' && (
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-400">S=0, R=0</span><span>Q (Hold / No Change)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">S=0, R=1</span><span>0 (Reset)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">S=1, R=0</span><span>1 (Set)</span></div>
                  <div className="flex justify-between"><span className="text-red-400 font-bold">S=1, R=1</span><span className="text-red-400 font-bold">X (Forbidden / Invalid)</span></div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-0.5 text-amber-400"><span>CLR=1 / SET=1</span><span>Async Clear / Preset</span></div>
                </div>
              )}
              {comp.kind === 'ff_d' && (
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-400">D=0</span><span>Q=0 (Reset)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">D=1</span><span>Q=1 (Set)</span></div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-0.5 text-amber-400"><span>CLR=1 / SET=1</span><span>Async Clear / Preset</span></div>
                </div>
              )}
              {comp.kind === 'ff_t' && (
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-400">T=0</span><span>Q (Hold)</span></div>
                  <div className="flex justify-between"><span className="text-purple-400 font-bold">T=1</span><span className="text-purple-300 font-bold">Q̄ (Toggle)</span></div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-0.5 text-amber-400"><span>CLR=1 / SET=1</span><span>Async Clear / Preset</span></div>
                </div>
              )}
              {comp.kind === 'latch_sr' && (
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-400">S=0, R=0</span><span>Q (Hold)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">S=1, R=0</span><span>1 (Set)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">S=0, R=1</span><span>0 (Reset)</span></div>
                  <div className="flex justify-between text-red-400"><span>S=1, R=1</span><span>X (Forbidden)</span></div>
                </div>
              )}
              {comp.kind === 'latch_d' && (
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-400">EN=1</span><span>Q = D (Transparent)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">EN=0</span><span>Q (Latched / Hold)</span></div>
                </div>
              )}
              {comp.kind === 'latch_jk' && (
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-400">J=0, K=0</span><span>Q (Hold)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">J=1, K=0</span><span>1 (Set)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">J=0, K=1</span><span>0 (Reset)</span></div>
                  <div className="flex justify-between text-purple-400 font-bold"><span>J=1, K=1</span><span>Q̄ (Toggle)</span></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DIGITAL SIGNAL MARKER & LOGIC ANALYZER ASSIGNMENT ── */}
        {(comp.kind === 'clock_source' ||
          comp.kind === 'digital_input' ||
          comp.kind === 'digital_output' ||
          comp.kind.startsWith('gate_') ||
          comp.kind.startsWith('ff_') ||
          comp.kind.startsWith('latch_') ||
          comp.kind === 'counter_4bit' ||
          comp.kind === 'decoder_2to4') && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Logic Analyzer Channel</span>
              </label>
              {params.logicAnalyzerChannel !== undefined && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                  CH{params.logicAnalyzerChannel}
                </span>
              )}
            </div>

            <div className="grid grid-cols-5 gap-1 font-mono text-[10px]">
              {[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((ch) => (
                <button
                  key={ch}
                  onClick={() => {
                    const newCh = ch === -1 ? undefined : ch;
                    updateComponentParams(comp.id, { logicAnalyzerChannel: newCh });
                  }}
                  className={`py-1 rounded border text-center transition font-bold ${
                    (params.logicAnalyzerChannel === undefined && ch === -1) ||
                    params.logicAnalyzerChannel === ch
                      ? ch === -1
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                      : isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {ch === -1 ? 'None' : `CH${ch}`}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Signal / Variable Name (Optional)
              </label>
              <input
                type="text"
                placeholder={comp.label || comp.kind}
                value={params.truthTableLabel ?? ''}
                onChange={(e) => updateComponentParams(comp.id, { truthTableLabel: e.target.value })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono text-xs outline-none focus:border-cyan-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
            <p className="text-[9px] text-slate-500">
              Assign to a channel to pin this component's signal directly in the Logic Analyzer.
            </p>
          </div>
        )}

        {/* ── LED ── */}
        {comp.kind === 'led' && (
          <div className="space-y-3">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">LED Color</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { name: 'Green', hex: '#22c55e' },
                { name: 'Red', hex: '#ef4444' },
                { name: 'Blue', hex: '#3b82f6' },
                { name: 'Yellow', hex: '#eab308' },
                { name: 'Orange', hex: '#f97316' },
                { name: 'Purple', hex: '#a855f7' },
                { name: 'Cyan', hex: '#06b6d4' },
                { name: 'White', hex: '#f8fafc' },
              ].map((c) => (
                <button
                  key={c.name}
                  onClick={() => updateComponentParams(comp.id, { color: c.hex })}
                  style={{ backgroundColor: c.hex }}
                  className={`h-8 rounded-lg border-2 shadow flex items-center justify-center transition ${
                    params.color === c.hex ? 'border-white scale-110' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  title={c.name}
                >
                  {params.color === c.hex && <Check className="w-4 h-4 text-slate-950" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── POTENTIOMETER ── */}
        {comp.kind === 'potentiometer' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Total Resistance (Ω)</label>
              <input
                type="number"
                value={params.resistance ?? 10000}
                onChange={(e) => updateComponentParams(comp.id, { resistance: Math.max(1, parseFloat(e.target.value) || 1000) })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none focus:border-cyan-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                <span>Wiper Position</span>
                <span className="font-mono text-cyan-400 font-bold">{Math.round((params.wiper ?? 0.5) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params.wiper ?? 0.5}
                onChange={(e) => updateComponentParams(comp.id, { wiper: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>
        )}

        {/* ── ADC & DAC DATA CONVERTERS ── */}
        {(comp.kind === 'adc' || comp.kind === 'dac') && (() => {
          const isAdc = comp.kind === 'adc';
          const bits = Math.max(1, Math.min(16, params.resolution ?? 4));
          const vMin = params.vMin ?? 0.0;
          const vMax = params.vMax ?? 5.0;
          const totalLevels = Math.pow(2, bits);
          const maxCode = totalLevels - 1;
          const lsbStep = (vMax - vMin) / (maxCode || 1);

          return (
            <div className="space-y-4">
              {/* Header Info Banner */}
              <div className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
                isAdc
                  ? isDark ? 'bg-cyan-950/30 border-cyan-800/50 text-cyan-200' : 'bg-cyan-50 border-cyan-200 text-cyan-900'
                  : isDark ? 'bg-purple-950/30 border-purple-800/50 text-purple-200' : 'bg-purple-50 border-purple-200 text-purple-900'
              }`}>
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isAdc ? 'Analog-to-Digital Converter (ADC)' : 'Digital-to-Analog Converter (DAC)'}</span>
                </div>
                {isAdc
                  ? 'Quantizes continuous analog input voltage into discrete binary bit lines.'
                  : 'Reconstructs continuous analog voltage from binary input digital pins.'}
              </div>

              {/* Bit Resolution Configuration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>Bit Resolution</span>
                  <span className={`font-mono font-bold ${isAdc ? 'text-cyan-400' : 'text-purple-400'}`}>
                    {bits}-bit ({totalLevels} Levels)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
                  {[2, 3, 4, 6, 8, 10, 12, 16].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => updateComponentParams(comp.id, { resolution: b })}
                      className={`py-1.5 rounded-lg border font-bold transition ${
                        bits === b
                          ? isAdc
                            ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                            : 'bg-purple-600 text-white border-purple-500 shadow-sm'
                          : isDark
                          ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {b}-bit
                    </button>
                  ))}
                </div>
              </div>

              {/* Voltage Range (Vmin .. Vmax) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Min Voltage (0b0..0)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      value={vMin}
                      onChange={(e) => updateComponentParams(comp.id, { vMin: parseFloat(e.target.value) || 0 })}
                      className={`w-full px-2.5 py-1.5 rounded-lg border font-mono text-xs outline-none ${
                        isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className="text-slate-400 text-xs font-mono">V</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Max / Vref (0b1..1)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      value={vMax}
                      onChange={(e) => updateComponentParams(comp.id, { vMax: parseFloat(e.target.value) || 1 })}
                      className={`w-full px-2.5 py-1.5 rounded-lg border font-mono text-xs outline-none ${
                        isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className="text-slate-400 text-xs font-mono">V</span>
                  </div>
                </div>
              </div>

              {/* Quick Voltage Presets */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Voltage Range Presets</label>
                <div className="grid grid-cols-5 gap-1 font-mono text-[9px]">
                  {[
                    { label: '0-1.8V', min: 0, max: 1.8 },
                    { label: '0-3.3V', min: 0, max: 3.3 },
                    { label: '0-5.0V', min: 0, max: 5.0 },
                    { label: '±5.0V', min: -5.0, max: 5.0 },
                    { label: '0-12V', min: 0, max: 12.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => updateComponentParams(comp.id, { vMin: p.min, vMax: p.max })}
                      className={`py-1 rounded border text-center transition ${
                        vMin === p.min && vMax === p.max
                          ? 'bg-amber-600/30 text-amber-300 border-amber-500/60 font-bold'
                          : isDark
                          ? 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantization Metrics Card */}
              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-[10px] font-mono space-y-1.5 text-slate-300 shadow-inner">
                <div className="text-[11px] font-bold text-amber-400 border-b border-slate-800/80 pb-1 flex justify-between">
                  <span>Conversion Characteristics</span>
                  <span>{bits} Output Pins</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Resolution:</span>
                  <span className="font-bold">{bits} bits (D0 ... D{bits - 1})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">LSB Step Size (ΔV):</span>
                  <span className="font-bold text-emerald-400">
                    {lsbStep < 0.001
                      ? `${(lsbStep * 1e6).toFixed(1)} µV/step`
                      : lsbStep < 1
                      ? `${(lsbStep * 1e3).toFixed(2)} mV/step`
                      : `${lsbStep.toFixed(4)} V/step`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Hex Code:</span>
                  <span className="text-purple-300 font-bold">0x{maxCode.toString(16).toUpperCase()} ({maxCode})</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── AUDIO SPEAKER ── */}
        {comp.kind === 'speaker' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Coil Impedance / Resistance
              </label>
              <div className="grid grid-cols-4 gap-1 font-mono text-xs">
                {[4, 8, 16, 32].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => updateComponentParams(comp.id, { resistance: r })}
                    className={`py-1.5 rounded-lg border font-bold transition ${
                      (params.resistance ?? 8) === r
                        ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {r}Ω
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-[11px] font-semibold text-slate-400 mb-1">
                <span>Output Volume</span>
                <span className="text-cyan-400 font-mono font-bold">{params.speakerMuted ? 'Muted' : `${params.speakerVolume ?? 50}%`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={params.speakerMuted ? 0 : (params.speakerVolume ?? 50)}
                onChange={(e) => updateComponentParams(comp.id, { speakerVolume: parseInt(e.target.value), speakerMuted: false })}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
              <span className="text-slate-300 font-medium">Mute Audio</span>
              <input
                type="checkbox"
                checked={params.speakerMuted ?? false}
                onChange={(e) => updateComponentParams(comp.id, { speakerMuted: e.target.checked })}
                className="accent-cyan-500 w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ── OHMMETER ── */}
        {comp.kind === 'ohmmeter' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1 font-mono">
              <span className="text-emerald-400 font-bold block">Autoranging Bench Ohmmeter</span>
              <p className="text-[10px] text-slate-400">
                Measures equivalent loop resistance between Ω+ and COM probes using an internal test reference.
              </p>
            </div>
          </div>
        )}

        {/* ── HIL PINS ── */}
        {(comp.kind === 'hil_ingress' || comp.kind === 'hil_egress') && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target ESP32 Pin</label>
              <select
                value={params.hilPin || (comp.kind === 'hil_ingress' ? 'A0' : 'DAC0')}
                onChange={(e) => updateComponentParams(comp.id, { hilPin: e.target.value })}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono text-xs outline-none focus:border-orange-500 ${
                  isDark ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                {comp.kind === 'hil_ingress' ? (
                  <>
                    <option value="A0">A0 (GPIO 36 ADC1_0)</option>
                    <option value="A1">A1 (GPIO 39 ADC1_3)</option>
                    <option value="A2">A2 (GPIO 34 ADC1_6)</option>
                    <option value="A3">A3 (GPIO 35 ADC1_7)</option>
                    <option value="A4">A4 (GPIO 32 ADC1_4)</option>
                    <option value="A5">A5 (GPIO 33 ADC1_5)</option>
                    <option value="D0">D0 (GPIO 4 Digital In)</option>
                    <option value="D1">D1 (GPIO 5 Digital In)</option>
                    <option value="D4">D4 (GPIO 13 Digital In)</option>
                    <option value="D5">D5 (GPIO 14 Digital In)</option>
                    <option value="D6">D6 (GPIO 15 Digital In)</option>
                  </>
                ) : (
                  <>
                    <option value="DAC0">DAC0 (GPIO 25 8-bit DAC)</option>
                    <option value="DAC1">DAC1 (GPIO 26 8-bit DAC)</option>
                    <option value="PWM0">PWM0 (GPIO 18 5kHz PWM)</option>
                    <option value="PWM1">PWM1 (GPIO 19 5kHz PWM)</option>
                    <option value="PWM2">PWM2 (GPIO 21 5kHz PWM)</option>
                    <option value="PWM3">PWM3 (GPIO 22 5kHz PWM)</option>
                    <option value="D2">D2 (GPIO 2 Onboard LED)</option>
                    <option value="D3">D3 (GPIO 23 Digital Out)</option>
                    <option value="D7">D7 (GPIO 27 Digital Out)</option>
                  </>
                )}
              </select>
            </div>
          </div>
        )}
      </div>
    </aside>
  </>
  );
};
