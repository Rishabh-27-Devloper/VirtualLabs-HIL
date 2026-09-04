// ============================================================
// VirtualLab-HIL — Advanced Digital Logic Analyzer Modal
// (Customizable Channels, Readable Signal Names, Pause, Image Export)
// ============================================================

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useCircuitStore, computeNetlist } from '@/store/circuitStore';
import {
  Cpu, X, Play, Pause, Download, Plus, Trash2,
  Sparkles, Layers, Sliders, Check, Eye, EyeOff, Camera,
} from 'lucide-react';
import type { LogicLevel, ComponentInstance, Wire, NetNode } from '@/types/circuit';

// ── Color palette for up to 16 distinct channels ──
export const CHANNEL_COLORS = [
  '#22c55e', // CH0: Emerald
  '#06b6d4', // CH1: Cyan
  '#a855f7', // CH2: Purple
  '#eab308', // CH3: Yellow
  '#f97316', // CH4: Orange
  '#ec4899', // CH5: Pink
  '#3b82f6', // CH6: Blue
  '#14b8a6', // CH7: Teal
  '#84cc16', // CH8: Lime
  '#6366f1', // CH9: Indigo
  '#d946ef', // CH10: Fuchsia
  '#f43f5e', // CH11: Rose
  '#10b981', // CH12: Mint
  '#0ea5e9', // CH13: Sky
  '#8b5cf6', // CH14: Violet
  '#f59e0b', // CH15: Amber
];

export const TIME_DIV_STEPS = [
  { label: '10 µs/div', value: 10e-6 },
  { label: '50 µs/div', value: 50e-6 },
  { label: '100 µs/div', value: 100e-6 },
  { label: '200 µs/div', value: 200e-6 },
  { label: '500 µs/div', value: 500e-6 },
  { label: '1.0 ms/div', value: 1e-3 },
  { label: '2.0 ms/div', value: 2e-3 },
  { label: '5.0 ms/div', value: 5e-3 },
  { label: '10.0 ms/div', value: 10e-3 },
  { label: '20.0 ms/div', value: 20e-3 },
  { label: '50.0 ms/div', value: 50e-3 },
];

export const LogicAnalyzerModal: React.FC = () => {
  const show = useCircuitStore((s) => s.showLogicAnalyzer);
  const setShow = useCircuitStore((s) => s.setShowLogicAnalyzer);
  const simulationState = useCircuitStore((s) => s.simulationState);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const netlist = useMemo(() => computeNetlist(components, edges), [components, edges]);
  const wires: Wire[] = netlist.wires;
  const logicSettings = useCircuitStore((s) => s.logicSettings);
  const updateLogicSettings = useCircuitStore((s) => s.updateLogicSettings);
  const circuitError = useCircuitStore((s) => s.circuitError);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const pausedTimeRef = useRef<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const [channelCount, setChannelCount] = useState<number>(() => {
    return logicSettings.channels?.length ? Math.max(4, logicSettings.channels.length) : 4;
  });

  const [selectedChannels, setSelectedChannels] = useState<(string | null)[]>(() => {
    const existing = logicSettings.channels || [];
    const initial: (string | null)[] = [];
    for (let i = 0; i < Math.max(4, channelCount); i++) {
      initial.push(existing[i] || null);
    }
    return initial;
  });

  const logicTraces = simulationState.logicTraces;

  // ── Build Human-Readable Signal Mappings ──
  const signalOptions = useMemo(() => {
    const options: { netId: string; label: string; group: string; marker?: string }[] = [];
    const netIdSeen = new Set<string>();

    // 1. Scan components and their connected pins
    Object.values(components).forEach((comp) => {
      const compWires = wires.filter(
        (w) => w.sourceComponentId === comp.id || w.targetComponentId === comp.id,
      );

      // Collect pins for this component
      const pinMap: Record<string, string> = {};
      compWires.forEach((w) => {
        if (w.sourceComponentId === comp.id) pinMap[w.sourcePinId] = w.netNodeId;
        if (w.targetComponentId === comp.id) pinMap[w.targetPinId] = w.netNodeId;
      });

      const ttMarker = comp.params.truthTableLabel ? `[${comp.params.truthTableLabel}] ` : '';
      const groupName = `${comp.label || comp.kind} (${comp.id.slice(0, 6)})`;

      Object.entries(pinMap).forEach(([pinId, netId]) => {
        const pinDisplayName = `${ttMarker}${comp.label || comp.kind} (${pinId})`;
        options.push({
          netId,
          label: pinDisplayName,
          group: groupName,
          marker: comp.params.truthTableLabel,
        });
        netIdSeen.add(netId);
      });
    });

    // 2. Include any unassigned active probe nets
    Object.keys(logicTraces).forEach((netId) => {
      if (!netIdSeen.has(netId)) {
        options.push({
          netId,
          label: `Net: ${netId}`,
          group: 'Other Signals',
        });
      }
    });

    return options;
  }, [components, wires, logicTraces]);

  // ── Helper to get clean readable name for a selected netId ──
  const getNetDisplayName = useCallback(
    (netId: string | null): string => {
      if (!netId) return 'None (Unassigned)';
      const match = signalOptions.find((opt) => opt.netId === netId);
      if (match) return match.label;

      // Fallback parser if raw netId
      const parts = netId.replace(/^net_/, '').split(':');
      if (parts.length >= 2) {
        const compId = parts[0];
        const pinId = parts[1];
        const comp = components[compId];
        if (comp) {
          const marker = comp.params.truthTableLabel ? `[${comp.params.truthTableLabel}] ` : '';
          return `${marker}${comp.label || comp.kind} (${pinId})`;
        }
        return `${compId.slice(0, 8)} (${pinId})`;
      }
      return netId;
    },
    [signalOptions, components],
  );

  // ── Sync auto-assigned channels from Component Inspector ──
  useEffect(() => {
    let changed = false;
    const updated = [...selectedChannels];

    Object.values(components).forEach((comp) => {
      if (comp.params.logicAnalyzerChannel !== undefined) {
        const ch = comp.params.logicAnalyzerChannel;
        if (ch >= 0 && ch < 16) {
          // Find the primary output or clock pin for this component
          const pinId =
            comp.kind === 'clock_source'
              ? 'out'
              : comp.kind === 'digital_input'
              ? 'out'
              : comp.kind === 'digital_output'
              ? 'in'
              : comp.kind.startsWith('ff_') || comp.kind.startsWith('latch_')
              ? 'Q'
              : 'out';

          const wire = wires.find(
            (w) =>
              (w.sourceComponentId === comp.id && w.sourcePinId === pinId) ||
              (w.targetComponentId === comp.id && w.targetPinId === pinId),
          );

          if (wire && updated[ch] !== wire.netNodeId) {
            while (updated.length <= ch) updated.push(null);
            updated[ch] = wire.netNodeId;
            changed = true;
          }
        }
      }
    });

    if (changed) {
      setSelectedChannels(updated);
      updateLogicSettings({ channels: updated });
    }
  }, [components, wires, selectedChannels, updateLogicSettings]);

  // ── Auto-assign default channels on startup if all empty ──
  useEffect(() => {
    if (selectedChannels.every((c) => c === null) && signalOptions.length > 0) {
      const newChannels = selectedChannels.map((_, idx) => {
        return signalOptions[idx]?.netId || null;
      });
      setSelectedChannels(newChannels);
      updateLogicSettings({ channels: newChannels });
    }
  }, [signalOptions, selectedChannels, updateLogicSettings]);

  // ── Adjust Channel Count ──
  const setChannelsCapacity = (count: number) => {
    setChannelCount(count);
    const newChannels = [...selectedChannels];
    while (newChannels.length < count) newChannels.push(null);
    if (newChannels.length > count) newChannels.length = count;
    setSelectedChannels(newChannels);
    updateLogicSettings({ channels: newChannels, channelCount: count });
  };

  const addChannel = () => {
    if (channelCount >= 16) return;
    setChannelsCapacity(channelCount + 1);
  };

  const removeChannel = (indexToRemove: number) => {
    if (channelCount <= 2) return;
    const newChannels = selectedChannels.filter((_, idx) => idx !== indexToRemove);
    setChannelCount(newChannels.length);
    setSelectedChannels(newChannels);
    updateLogicSettings({ channels: newChannels, channelCount: newChannels.length });
  };

  const clearAllChannels = () => {
    const empty = selectedChannels.map(() => null);
    setSelectedChannels(empty);
    updateLogicSettings({ channels: empty });
  };

  // ── Render Waveforms on Canvas ──
  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number | null = null;
    const isSimRunning = simulationState.status === 'running' && !circuitError && !isPaused;

    if (!isSimRunning) {
      if (pausedTimeRef.current === null) {
        pausedTimeRef.current = simulationState.currentTime;
      }
    } else {
      pausedTimeRef.current = null;
    }

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const numChannels = Math.max(1, selectedChannels.length);
      const channelHeight = h / numChannels;

      // 1. Dark CRT Phosphor Background
      ctx.fillStyle = '#060910';
      ctx.fillRect(0, 0, w, h);

      // 2. Channel Horizontal Division Bands & Dividers
      for (let i = 0; i <= numChannels; i++) {
        const y = i * channelHeight;
        ctx.strokeStyle = '#152033';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        // Subtle alternating lane background
        if (i < numChannels && i % 2 === 1) {
          ctx.fillStyle = '#0a0f1d33';
          ctx.fillRect(0, y, w, channelHeight);
        }
      }

      // 3. Vertical Timing Grid Lines (10 Divisions)
      const timeDiv = logicSettings.timeDiv || 0.001;
      const totalTimeSpan = timeDiv * 10;
      const divX = w / 10;

      for (let j = 0; j <= 10; j++) {
        const x = j * divX;
        ctx.beginPath();
        ctx.strokeStyle = j === 0 || j === 10 ? '#1e293b' : '#0f172a';
        ctx.lineWidth = 1;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      const currentTime = isPaused && pausedTimeRef.current !== null
        ? pausedTimeRef.current
        : simulationState.currentTime;

      // 4. Render Timing Waveforms for each Channel
      selectedChannels.forEach((netId, chIdx) => {
        const color = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
        const topY = chIdx * channelHeight;
        const highY = topY + channelHeight * 0.22;
        const lowY = topY + channelHeight * 0.78;

        // Channel Header Label & Current State
        const readableName = getNetDisplayName(netId);
        const trace = netId ? logicTraces[netId] : null;
        const currentVal = trace && trace.values.length > 0 ? trace.values[trace.values.length - 1] : 'Z';

        // Draw Channel Badge
        ctx.fillStyle = color;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(`CH${chIdx}: ${readableName}`, 12, topY + Math.min(14, channelHeight * 0.3));

        // Draw State Indicator Pill on Right Edge
        if (netId) {
          const stateText = currentVal === 1 ? '1' : currentVal === 0 ? '0' : currentVal === 'X' ? 'X' : 'Z';
          const badgeX = w - 30;
          const badgeY = topY + channelHeight * 0.5 - 7;

          ctx.fillStyle = currentVal === 1 ? '#22c55e33' : '#33415566';
          ctx.strokeStyle = currentVal === 1 ? '#22c55e' : '#64748b';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, 22, 14, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = currentVal === 1 ? '#4ade80' : '#94a3b8';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(stateText, badgeX + 8, badgeY + 10);
        }

        if (!netId || !trace || trace.times.length === 0) {
          // Unassigned / Flatline low
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, lowY);
          ctx.lineTo(w, lowY);
          ctx.stroke();
          return;
        }

        // Draw Step-Waveform Trace with Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();

        let prevX = 0;
        let prevY = lowY;

        for (let i = 0; i < trace.times.length; i++) {
          const t = trace.times[i];
          const val = trace.values[i];
          const x = w - ((currentTime - t) / totalTimeSpan) * w;
          const y = val === 1 ? highY : lowY;

          if (x >= 0 && x <= w) {
            if (prevX === 0) {
              ctx.moveTo(x, y);
            } else {
              // Draw step transition
              ctx.lineTo(x, prevY);
              ctx.lineTo(x, y);
            }
            prevX = x;
            prevY = y;
          }
        }
        // Extend to current right edge
        ctx.lineTo(w, prevY);
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
      });

      // 5. Draw Vertical Hover Measurement Cursor
      if (hoverX !== null && hoverX >= 0 && hoverX <= w) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hoverX, 0);
        ctx.lineTo(hoverX, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cursor Timestamp
        const cursorTime = currentTime - ((w - hoverX) / w) * totalTimeSpan;
        const timeLabel = `t = ${(cursorTime * 1000).toFixed(2)} ms`;
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(Math.min(hoverX + 4, w - 85), 6, 80, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(timeLabel, Math.min(hoverX + 8, w - 81), 18);
      }

      if (isSimRunning) {
        animId = requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, [show, selectedChannels, logicTraces, logicSettings, simulationState.status, simulationState.currentTime, circuitError, isPaused, getNetDisplayName, hoverX]);

  // ── Save Paused Screen as PNG Image ──
  const handleSaveImage = () => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    // Create high-res export canvas (1280x720)
    const exportCanvas = document.createElement('canvas');
    const exportW = 1280;
    const exportH = 720;
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // 1. Dark Background & Outer Frame
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, exportW, exportH);

    // 2. Header Banner
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, exportW, 50);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(exportW, 50);
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 16px "JetBrains Mono", sans-serif';
    ctx.fillText('VirtualLab — Digital Logic Analyzer Waveform Capture', 20, 32);

    const timeDiv = logicSettings.timeDiv || 0.001;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(
      `Timebase: ${(timeDiv * 1000).toFixed(2)} ms/div  ·  Channels: ${selectedChannels.length}  ·  Captured: ${new Date().toLocaleTimeString()}`,
      exportW - 480,
      32,
    );

    // 3. Draw Main Timing Grid & Traces
    const graphY = 60;
    const graphH = exportH - 100;
    const numChannels = selectedChannels.length;
    const channelHeight = graphH / numChannels;
    const totalTimeSpan = timeDiv * 10;
    const currentTime = isPaused && pausedTimeRef.current !== null
      ? pausedTimeRef.current
      : simulationState.currentTime;

    for (let i = 0; i <= numChannels; i++) {
      const y = graphY + i * channelHeight;
      ctx.strokeStyle = '#152033';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(exportW - 40, y);
      ctx.stroke();
    }

    const divX = (exportW - 80) / 10;
    for (let j = 0; j <= 10; j++) {
      const x = 40 + j * divX;
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(x, graphY);
      ctx.lineTo(x, graphY + graphH);
      ctx.stroke();
    }

    // Render channels on export canvas
    selectedChannels.forEach((netId, chIdx) => {
      const color = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
      const topY = graphY + chIdx * channelHeight;
      const highY = topY + channelHeight * 0.25;
      const lowY = topY + channelHeight * 0.75;
      const readableName = getNetDisplayName(netId);

      ctx.fillStyle = color;
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillText(`CH${chIdx}: ${readableName}`, 50, topY + Math.min(18, channelHeight * 0.35));

      if (!netId) return;
      const trace = logicTraces[netId];
      if (!trace || trace.times.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      let prevX = 0;
      let prevY = lowY;

      for (let i = 0; i < trace.times.length; i++) {
        const t = trace.times[i];
        const val = trace.values[i];
        const x = 40 + (1 - (currentTime - t) / totalTimeSpan) * (exportW - 80);
        const y = val === 1 ? highY : lowY;

        if (x >= 40 && x <= exportW - 40) {
          if (prevX === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
          }
          prevX = x;
          prevY = y;
        }
      }
      ctx.lineTo(exportW - 40, prevY);
      ctx.stroke();
    });

    // 4. Footer Timestamp & Scale
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText('Generated with VirtualLab-HIL Logic Simulation Engine', 40, exportH - 16);

    // 5. Download PNG
    const link = document.createElement('a');
    link.download = `logic_analyzer_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-green-950/60 border border-green-700/50">
              <Cpu className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Digital Logic Analyzer
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-green-900/40 text-green-300 border border-green-700/40">
                  {selectedChannels.length} Channels Active
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 ${
                    isPaused
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-600 animate-pulse'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-600'
                  }`}
                >
                  {isPaused ? <Pause className="w-2.5 h-2.5" /> : <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
                  {isPaused ? 'PAUSED / FROZEN' : 'LIVE STREAM'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Real-time multi-channel digital logic trace with nanosecond timing resolution
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Pause / Live Button */}
            <button
              onClick={() => {
                if (!isPaused) {
                  pausedTimeRef.current = simulationState.currentTime;
                }
                setIsPaused(!isPaused);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                isPaused
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20 shadow-md'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title={isPaused ? 'Resume live logic streaming' : 'Freeze logic traces for timing measurement'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'RESUME' : 'PAUSE'}</span>
            </button>

            {/* Save Image Button */}
            <button
              onClick={handleSaveImage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition shadow-sm"
              title="Export high-resolution PNG image of logic timing diagram"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>SAVE IMAGE</span>
            </button>

            {/* Close Button */}
            <button
              onClick={() => setShow(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition border border-transparent hover:border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Main Content Area ── */}
        <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 bg-slate-950 overflow-hidden flex-1">
          {/* Left: Waveform Canvas */}
          <div className="lg:col-span-3 flex flex-col gap-2">
            <div className="rounded-xl overflow-hidden border-2 border-slate-800 shadow-inner relative bg-[#060910]">
              <canvas
                ref={canvasRef}
                width={760}
                height={Math.max(340, selectedChannels.length * 48)}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoverX(((e.clientX - rect.left) / rect.width) * 760);
                }}
                onMouseLeave={() => setHoverX(null)}
                className="w-full h-auto block cursor-crosshair"
              />
            </div>

            {/* Timebase Scale Controls */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold text-[11px]">Timebase:</span>
                <div className="flex items-center gap-1">
                  {TIME_DIV_STEPS.slice(3, 9).map((step) => (
                    <button
                      key={step.label}
                      onClick={() => updateLogicSettings({ timeDiv: step.value })}
                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition border ${
                        Math.abs(logicSettings.timeDiv - step.value) < 1e-7
                          ? 'bg-green-600 text-white border-green-500 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {step.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px] text-green-400 font-bold">
                <span>{(logicSettings.timeDiv * 1000).toFixed(2)} ms/div</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400 text-[10px]">Total: {(logicSettings.timeDiv * 10000).toFixed(1)} ms</span>
              </div>
            </div>
          </div>

          {/* Right: Channel Configuration Sidebar */}
          <div className="flex flex-col gap-3 p-3.5 bg-slate-900/95 rounded-xl border border-slate-800 text-xs overflow-y-auto max-h-[75vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-green-400" /> Channel Setup
              </h3>
              <div className="flex items-center gap-1">
                {[4, 8, 16].map((count) => (
                  <button
                    key={count}
                    onClick={() => setChannelsCapacity(count)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition ${
                      channelCount === count
                        ? 'bg-green-600 text-white border-green-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {count}CH
                  </button>
                ))}
              </div>
            </div>

            {/* Channel Rows */}
            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
              {selectedChannels.map((netId, chIdx) => {
                const color = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
                return (
                  <div
                    key={chIdx}
                    className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 transition hover:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-mono font-bold text-[11px]" style={{ color }}>
                          CH{chIdx}
                        </span>
                        {netId && (
                          <span className="text-[9px] text-slate-400 font-mono truncate max-w-[110px]">
                            {getNetDisplayName(netId)}
                          </span>
                        )}
                      </div>

                      {channelCount > 2 && (
                        <button
                          onClick={() => removeChannel(chIdx)}
                          className="text-slate-500 hover:text-red-400 p-0.5 rounded transition"
                          title="Remove this channel strip"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Signal Dropdown with Readable Names */}
                    <select
                      value={netId || ''}
                      onChange={(e) => {
                        const newChannels = [...selectedChannels];
                        newChannels[chIdx] = e.target.value || null;
                        setSelectedChannels(newChannels);
                        updateLogicSettings({ channels: newChannels });
                      }}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-2 py-1 text-slate-200 text-[11px] font-mono outline-none focus:border-green-500"
                    >
                      <option value="">-- Disconnected / None --</option>
                      {signalOptions.map((opt, oIdx) => (
                        <option key={`${opt.netId}-${oIdx}`} value={opt.netId}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={addChannel}
                disabled={channelCount >= 16}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Add Channel
              </button>

              <button
                onClick={clearAllChannels}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-red-400 bg-slate-950 border border-slate-800 transition"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
