// ============================================================
// VirtualLab-HIL — Custom Component Node Renderer (With Rotation & Live Meters)
// ============================================================

import React, { memo, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  COMPONENT_REGISTRY,
  PIN_COLOR_MAP,
  getComponentPins,
  getComponentDimensions,
} from '@/components/canvas/componentDefs';
import type { ComponentKind, ComponentParams, PinDefinition } from '@/types/circuit';
import {
  Zap, Activity, Cpu, Sliders, ToggleLeft, ToggleRight,
  Radio, Trash2, Gauge, RotateCw,
} from 'lucide-react';
import { logger } from '@/utils/logger';

interface NodeData {
  componentId: string;
  kind: ComponentKind;
  label: string;
  params: ComponentParams;
}

function getRotatedPin(pin: PinDefinition, rotation = 0): { x: number; y: number; pos: Position } {
  const rot = ((rotation % 360) + 360) % 360;
  let x = pin.x;
  let y = pin.y;

  if (rot === 90) {
    x = 1 - pin.y;
    y = pin.x;
  } else if (rot === 180) {
    x = 1 - pin.x;
    y = 1 - pin.y;
  } else if (rot === 270) {
    x = pin.y;
    y = 1 - pin.x;
  }

  let pos = Position.Left;
  if (x === 1) pos = Position.Right;
  else if (x === 0) pos = Position.Left;
  else if (y === 0) pos = Position.Top;
  else if (y === 1) pos = Position.Bottom;

  return { x, y, pos };
}

export const CustomComponentNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const nodeData = data as unknown as NodeData;
  const components = useCircuitStore((s) => s.components);
  const comp = components[id];
  const kind = (comp?.kind || nodeData.kind) as ComponentKind;
  const meta = COMPONENT_REGISTRY[kind] || COMPONENT_REGISTRY.resistor;
  const params: ComponentParams = {
    ...(meta.defaultParams || {}),
    ...(nodeData.params || {}),
    ...(comp?.params || {}),
  };
  const rotation = params.rotation ?? 0;
  const edges = useCircuitStore((s) => s.edges);
  const selectComponent = useCircuitStore((s) => s.selectComponent);
  const setShowInspector = useCircuitStore((s) => s.setShowInspector);
  const setShowOscilloscope = useCircuitStore((s) => s.setShowOscilloscope);
  const updateComponentParams = useCircuitStore((s) => s.updateComponentParams);
  const removeComponent = useCircuitStore((s) => s.removeComponent);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  const compSimState = useCircuitStore((s) => s.simulationState.componentStates?.[id]) || comp?.simState;
  const vP = compSimState?.nodeVoltages?.['p'] ?? 0;
  const vN = compSimState?.nodeVoltages?.['n'] ?? 0;
  const vDiff = vP - vN;
  const currentA = vDiff / 1e-5; // For ammeter shunt

  const probeEdge = edges.find(e => (e.source === id && (e.sourceHandle === 'p' || !e.sourceHandle)) || (e.target === id && (e.targetHandle === 'p' || !e.targetHandle)));
  const gndEdge = edges.find(e => (e.source === id && e.sourceHandle === 'n') || (e.target === id && e.targetHandle === 'n'));
  const posComp = probeEdge ? (probeEdge.source === id ? components[probeEdge.target] : components[probeEdge.source]) : null;
  const posPin = probeEdge ? (probeEdge.source === id ? (probeEdge.targetHandle || 'p') : (probeEdge.sourceHandle || 'p')) : null;
  const refComp = gndEdge ? (gndEdge.source === id ? components[gndEdge.target] : components[gndEdge.source]) : null;
  const refPin = gndEdge ? (gndEdge.source === id ? (gndEdge.targetHandle || 'n') : (gndEdge.sourceHandle || 'n')) : null;

  // Keyboard shortcut 'R' to rotate when component is selected
  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const nextRot = (rotation + 90) % 360;
        updateComponentParams(id, { rotation: nextRot });
        logger.info('canvas', `Rotated component "${meta.name}" to ${nextRot}°`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, rotation, id, meta.name, updateComponentParams]);

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRot = (rotation + 90) % 360;
    updateComponentParams(id, { rotation: nextRot });
    logger.info('canvas', `Rotated component "${meta.name}" to ${nextRot}°`);
  };

  const formatVal = (val?: number, unit = '') => {
    if (val === undefined) return '';
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M${unit}`;
    if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(1)}k${unit}`;
    if (Math.abs(val) < 1e-9) return `${(val * 1e12).toFixed(0)}p${unit}`;
    if (Math.abs(val) < 1e-6) return `${(val * 1e9).toFixed(0)}n${unit}`;
    if (Math.abs(val) < 1e-3) return `${(val * 1e6).toFixed(1)}µ${unit}`;
    if (Math.abs(val) < 1) return `${(val * 1e3).toFixed(1)}m${unit}`;
    return `${val.toFixed(1)}${unit}`;
  };

  const renderSymbol = () => {
    return (
      <div
        style={{ transform: `rotate(${rotation}deg)` }}
        className="transition-transform duration-200 flex items-center justify-center"
      >
        {kind === 'resistor' && (
          <svg className={`w-16 h-8 stroke-2 fill-none ${isDark ? 'stroke-cyan-400' : 'stroke-cyan-700'}`} viewBox="0 0 80 30">
            <path d="M 0 15 L 15 15 L 20 5 L 30 25 L 40 5 L 50 25 L 60 5 L 65 15 L 80 15" />
          </svg>
        )}
        {kind === 'capacitor' && (
          <svg className={`w-16 h-8 stroke-2 fill-none ${isDark ? 'stroke-cyan-400' : 'stroke-cyan-700'}`} viewBox="0 0 80 30">
            <path d="M 0 15 L 35 15 M 35 3 L 35 27 M 45 3 L 45 27 M 45 15 L 80 15" />
          </svg>
        )}
        {kind === 'inductor' && (
          <svg className={`w-16 h-8 stroke-2 fill-none ${isDark ? 'stroke-cyan-400' : 'stroke-cyan-700'}`} viewBox="0 0 80 30">
            <path d="M 0 15 L 15 15 C 15 5, 25 5, 25 15 C 25 5, 35 5, 35 15 C 35 5, 45 5, 45 15 C 45 5, 55 5, 55 15 C 55 5, 65 5, 65 15 L 80 15" />
          </svg>
        )}
        {kind === 'ground' && (
          <svg className={`w-10 h-8 stroke-2 fill-none ${isDark ? 'stroke-slate-400' : 'stroke-slate-700'}`} viewBox="0 0 40 30">
            <path d="M 20 0 L 20 12 M 5 12 L 35 12 M 10 18 L 30 18 M 15 24 L 25 24" />
          </svg>
        )}
        {kind === 'current_source' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-amber-400' : 'stroke-amber-600'}`} viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="18" className={isDark ? 'stroke-amber-400' : 'stroke-amber-600'} />
            <line x1="25" y1="35" x2="25" y2="15" className={isDark ? 'stroke-amber-300 stroke-2' : 'stroke-amber-700 stroke-2'} />
            <polygon points="25,12 21,18 29,18" className={isDark ? 'fill-amber-300 stroke-none' : 'fill-amber-700 stroke-none'} />
          </svg>
        )}
        {kind === 'dc_voltage' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-yellow-400' : 'stroke-amber-600'}`} viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="18" className={isDark ? 'stroke-yellow-400' : 'stroke-amber-600'} />
            <text x="25" y="21" textAnchor="middle" className={`${isDark ? 'fill-yellow-400' : 'fill-amber-700'} text-[12px] font-bold font-mono stroke-none`}>+</text>
            <text x="25" y="36" textAnchor="middle" className={`${isDark ? 'fill-yellow-400' : 'fill-amber-700'} text-[14px] font-bold font-mono stroke-none`}>-</text>
          </svg>
        )}
        {(kind === 'ac_voltage' || kind === 'signal_generator') && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-purple-400' : 'stroke-purple-600'}`} viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="18" className={isDark ? 'stroke-purple-400' : 'stroke-purple-600'} />
            <path d="M 14 25 Q 19 14 25 25 T 36 25" className={isDark ? 'stroke-purple-300 stroke-2' : 'stroke-purple-700 stroke-2'} />
          </svg>
        )}
        {kind === 'opamp' && (
          <svg className={`w-20 h-14 stroke-2 fill-none ${isDark ? 'stroke-cyan-400 fill-cyan-950/30' : 'stroke-cyan-700 fill-cyan-50/80'}`} viewBox="0 0 100 70">
            <polygon points="20,10 20,60 80,35" className={isDark ? 'stroke-cyan-400 fill-cyan-950/30' : 'stroke-cyan-700 fill-cyan-100/50'} />
            <line x1="0" y1="22" x2="20" y2="22" />
            <line x1="0" y1="48" x2="20" y2="48" />
            <text x="24" y="27" className={`${isDark ? 'fill-cyan-400' : 'fill-cyan-800'} text-[12px] font-bold font-mono stroke-none`}>+</text>
            <text x="25" y="52" className={`${isDark ? 'fill-cyan-400' : 'fill-cyan-800'} text-[14px] font-bold font-mono stroke-none`}>-</text>
            <line x1="80" y1="35" x2="100" y2="35" />
            <line x1="50" y1="0" x2="50" y2="23" className="stroke-slate-500 stroke-1 stroke-dasharray-[2,2]" />
            <line x1="50" y1="47" x2="50" y2="70" className="stroke-slate-500 stroke-1 stroke-dasharray-[2,2]" />
          </svg>
        )}
        {kind === 'ic555' && (
          <div className={`w-24 h-14 rounded-lg border-2 p-1 flex flex-col items-center justify-between shadow-inner ${
            isDark ? 'bg-slate-950 border-amber-500/80' : 'bg-slate-900 border-amber-500 text-white'
          }`}>
            <div className="w-3 h-1 rounded-full bg-slate-700 mx-auto" />
            <div className="text-[10px] font-mono font-black text-amber-400 tracking-wider">NE555</div>
            <div className="text-[8px] font-mono text-slate-300">TIMER IC</div>
          </div>
        )}
        {(kind === 'diode' || kind === 'zener') && (
          <svg className={`w-16 h-8 stroke-2 fill-none ${isDark ? 'stroke-amber-400 fill-amber-950/30' : 'stroke-amber-600 fill-amber-100/60'}`} viewBox="0 0 80 30">
            <path d="M 0 15 L 30 15 M 30 5 L 30 25 L 50 15 Z M 50 5 L 50 25 M 50 15 L 80 15" />
            {kind === 'zener' && <path d="M 45 5 L 50 5 M 50 25 L 55 25" />}
          </svg>
        )}
        {/* NPN BJT (Outward emitter arrow) */}
        {kind === 'bjt_npn' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-purple-400' : 'stroke-purple-700'}`} viewBox="0 0 60 50">
            <circle cx="30" cy="25" r="22" className={isDark ? 'stroke-purple-500/40' : 'stroke-purple-300'} />
            <path d="M 10 25 L 25 25 M 25 10 L 25 40 M 25 18 L 45 8 M 25 32 L 45 42" />
            <polygon points="45,42 37,39 42,46" className={isDark ? 'fill-purple-400 stroke-none' : 'fill-purple-700 stroke-none'} />
          </svg>
        )}

        {/* PNP BJT (Inward emitter arrow pointing to Base) */}
        {kind === 'bjt_pnp' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-purple-400' : 'stroke-purple-700'}`} viewBox="0 0 60 50">
            <circle cx="30" cy="25" r="22" className={isDark ? 'stroke-purple-500/40' : 'stroke-purple-300'} />
            <path d="M 10 25 L 25 25 M 25 10 L 25 40 M 25 18 L 45 8 M 25 32 L 45 42" />
            <polygon points="26,18 34,14 31,23" className={isDark ? 'fill-purple-400 stroke-none' : 'fill-purple-700 stroke-none'} />
          </svg>
        )}

        {/* N-Channel Enhancement MOSFET (3 broken channel segments + Inward arrow) */}
        {kind === 'mosfet_n_enh' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-indigo-400' : 'stroke-indigo-700'}`} viewBox="0 0 60 50">
            <circle cx="30" cy="25" r="22" className={isDark ? 'stroke-indigo-500/30' : 'stroke-indigo-300'} />
            {/* Gate */}
            <line x1="8" y1="25" x2="20" y2="25" />
            <line x1="20" y1="12" x2="20" y2="38" />
            {/* 3 Broken Channel Segments */}
            <line x1="26" y1="10" x2="26" y2="18" />
            <line x1="26" y1="21" x2="26" y2="29" />
            <line x1="26" y1="32" x2="26" y2="40" />
            {/* Drain & Source leads */}
            <path d="M 26 14 L 46 14 L 46 8 M 26 36 L 46 36 L 46 42 M 26 25 L 46 25 L 46 36" />
            {/* Inward Arrow */}
            <polygon points="26,25 34,21 34,29" className={isDark ? 'fill-indigo-400 stroke-none' : 'fill-indigo-700 stroke-none'} />
          </svg>
        )}

        {/* P-Channel Enhancement MOSFET (3 broken channel segments + Outward arrow) */}
        {kind === 'mosfet_p_enh' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-indigo-400' : 'stroke-indigo-700'}`} viewBox="0 0 60 50">
            <circle cx="30" cy="25" r="22" className={isDark ? 'stroke-indigo-500/30' : 'stroke-indigo-300'} />
            {/* Gate */}
            <line x1="8" y1="25" x2="20" y2="25" />
            <line x1="20" y1="12" x2="20" y2="38" />
            {/* 3 Broken Channel Segments */}
            <line x1="26" y1="10" x2="26" y2="18" />
            <line x1="26" y1="21" x2="26" y2="29" />
            <line x1="26" y1="32" x2="26" y2="40" />
            {/* Drain & Source leads */}
            <path d="M 26 14 L 46 14 L 46 42 M 26 36 L 46 36 L 46 8 M 26 25 L 46 25 L 46 8" />
            {/* Outward Arrow */}
            <polygon points="38,25 30,21 30,29" className={isDark ? 'fill-indigo-400 stroke-none' : 'fill-indigo-700 stroke-none'} />
          </svg>
        )}

        {/* N-Channel Depletion MOSFET (Solid continuous channel bar + Inward arrow) */}
        {kind === 'mosfet_n_dep' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-teal-400' : 'stroke-teal-700'}`} viewBox="0 0 60 50">
            <circle cx="30" cy="25" r="22" className={isDark ? 'stroke-teal-500/30' : 'stroke-teal-300'} />
            {/* Gate */}
            <line x1="8" y1="25" x2="20" y2="25" />
            <line x1="20" y1="12" x2="20" y2="38" />
            {/* Solid Channel Bar */}
            <line x1="26" y1="10" x2="26" y2="40" strokeWidth="3.5" />
            {/* Drain & Source leads */}
            <path d="M 26 14 L 46 14 L 46 8 M 26 36 L 46 36 L 46 42 M 26 25 L 46 25 L 46 36" />
            {/* Inward Arrow */}
            <polygon points="26,25 34,21 34,29" className={isDark ? 'fill-teal-400 stroke-none' : 'fill-teal-700 stroke-none'} />
          </svg>
        )}

        {/* P-Channel Depletion MOSFET (Solid continuous channel bar + Outward arrow) */}
        {kind === 'mosfet_p_dep' && (
          <svg className={`w-14 h-12 stroke-2 fill-none ${isDark ? 'stroke-teal-400' : 'stroke-teal-700'}`} viewBox="0 0 60 50">
            <circle cx="30" cy="25" r="22" className={isDark ? 'stroke-teal-500/30' : 'stroke-teal-300'} />
            {/* Gate */}
            <line x1="8" y1="25" x2="20" y2="25" />
            <line x1="20" y1="12" x2="20" y2="38" />
            {/* Solid Channel Bar */}
            <line x1="26" y1="10" x2="26" y2="40" strokeWidth="3.5" />
            {/* Drain & Source leads */}
            <path d="M 26 14 L 46 14 L 46 42 M 26 36 L 46 36 L 46 8 M 26 25 L 46 25 L 46 8" />
            {/* Outward Arrow */}
            <polygon points="38,25 30,21 30,29" className={isDark ? 'fill-teal-400 stroke-none' : 'fill-teal-700 stroke-none'} />
          </svg>
        )}

        {/* Logic Analyzer Pod Symbol */}
        {kind === 'logic_analyzer' && (
          <div className="flex flex-col items-center gap-1 w-full py-0.5">
            <div className={`w-full px-2 py-1 rounded-lg border flex flex-col gap-0.5 shadow-inner ${
              isDark ? 'bg-slate-950/90 border-green-500/40 text-green-400' : 'bg-slate-900 border-green-600 text-green-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 font-mono text-[8px] font-bold">
                  <Cpu className="w-2.5 h-2.5 text-green-400" />
                  <span>LOGIC POD</span>
                </div>
                <span className="text-[7px] font-mono px-1 rounded bg-green-950 border border-green-800 text-green-400">4-CH</span>
              </div>
              <svg viewBox="0 0 80 18" className="w-full h-4">
                <path d="M 2 14 L 15 14 L 15 4 L 35 4 L 35 14 L 55 14 L 55 4 L 78 4" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}
        {kind === 'clock_source' && (() => {
          const period = params.pulsePeriod ?? 0.001;
          const duty = params.dutyCycle ?? 50;
          const freq = period > 0 ? (1 / period) : 1000;
          const freqLabel = freq >= 1000 ? `${(freq/1000).toFixed(1)}kHz` : `${freq.toFixed(1)}Hz`;
          const isHigh = compSimState?.logicState?.['out'] === 1;
          return (
            <div className="flex flex-col items-center gap-0.5 w-full">
              <svg viewBox="0 0 60 26" className="w-full h-7 mt-0.5">
                <path d={`M2,20 L2,6 L15,6 L15,20 L28,20 L28,6 L41,6 L41,20 L54,20 L54,6`}
                  fill="none" stroke={isHigh ? '#c084fc' : (isDark ? '#7c3aed' : '#a78bfa')} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex items-center gap-1 font-mono text-[8px]">
                <span className={`px-1 py-0.2 rounded font-bold transition-all duration-75 ${isHigh ? 'bg-purple-500 text-white shadow-sm ring-1 ring-purple-400' : 'bg-slate-800 text-slate-400'}`}>
                  {isHigh ? 'CLK=1' : 'CLK=0'}
                </span>
                <span className={isDark ? 'text-purple-300' : 'text-purple-700'}>{freqLabel}</span>
              </div>
            </div>
          );
        })()}
        {kind === 'digital_input' && (() => {
          const liveOut = compSimState?.logicState?.['out'];
          const logicVal = liveOut !== undefined ? liveOut : (params.logicState ?? 0);
          const isHigh = logicVal === 1;
          const isTTInput = params.isTruthTableInput;
          return (
            <div className="flex flex-col items-center gap-1 py-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateComponentParams(id, { logicState: isHigh ? 0 : 1 });
                }}
                className={`w-12 h-12 rounded-lg border-2 font-bold text-xl transition-all duration-150 shadow-md ${
                  isHigh
                    ? 'bg-emerald-500 border-emerald-300 text-white shadow-emerald-500/50 ring-2 ring-emerald-400/40'
                    : isDark ? 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-650' : 'bg-slate-200 border-slate-300 text-slate-500'
                }`}
              >
                {isHigh ? '1' : '0'}
              </button>
              {isTTInput && (
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  📊 {params.truthTableLabel || 'IN'}
                </span>
              )}
            </div>
          );
        })()}
        {kind === 'digital_output' && (() => {
          const logicState = compSimState?.logicState;
          const inVal = logicState?.['in'] ?? logicState?.['display'] ?? 'Z';
          const isHigh = inVal === 1;
          const isLow = inVal === 0;
          const isX = inVal === 'X';
          const isTTOutput = params.isTruthTableOutput;
          return (
            <div className="flex flex-col items-center gap-1 py-1">
              <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg transition-all duration-100 ${
                isHigh
                  ? 'bg-emerald-500 border-emerald-300 text-white shadow-[0_0_20px_rgba(16,185,129,0.8)] ring-2 ring-emerald-400/60 scale-105'
                  : isX
                  ? 'bg-yellow-500 border-yellow-400 text-white shadow-lg shadow-yellow-500/30'
                  : isLow
                  ? isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-300 border-slate-400 text-slate-600'
                  : 'border-slate-600 text-slate-500 ' + (isDark ? 'bg-slate-900' : 'bg-slate-200')
              }`}>
                {isHigh ? '1' : isLow ? '0' : isX ? 'X' : 'Z'}
              </div>
              {isTTOutput && (
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                  📊 {params.truthTableLabel || 'OUT'}
                </span>
              )}
            </div>
          );
        })()}

        {/* ── ADC (Analog-to-Digital Converter) ── */}
        {kind === 'adc' && (() => {
          const rawIn = compSimState?.nodeVoltages?.['in'] ?? 0;
          const vMin = params.vMin ?? 0.0;
          const vMax = params.vMax ?? 5.0;
          const bits = Math.max(1, Math.min(16, params.resolution ?? 4));
          const maxCode = (1 << bits) - 1;
          const vSpan = vMax - vMin || 1.0;
          const vClamped = Math.max(vMin, Math.min(vMax, rawIn));
          const code = Math.round(((vClamped - vMin) / vSpan) * maxCode);
          const percent = Math.max(0, Math.min(100, ((vClamped - vMin) / vSpan) * 100));

          return (
            <div className="flex flex-col gap-1.5 w-full px-2 py-1 text-center select-none font-mono">
              <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold border-b border-slate-700/50 pb-1">
                <span className="text-cyan-400">ADC {bits}-BIT</span>
                <span className="text-slate-300 font-extrabold">{rawIn.toFixed(2)}V</span>
              </div>

              {/* Mini Voltage Gauge Bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-100"
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* Bit Indicators (D_{N-1} ... D0) */}
              <div className="flex items-center justify-center gap-0.5 py-0.5">
                {Array.from({ length: bits }).map((_, i) => {
                  const bitIdx = bits - 1 - i;
                  const isHigh = ((code >> bitIdx) & 1) === 1;
                  return (
                    <div
                      key={bitIdx}
                      className={`w-3.5 h-4 rounded flex items-center justify-center text-[8px] font-bold transition-all ${
                        isHigh
                          ? 'bg-emerald-500 text-slate-950 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                          : isDark
                          ? 'bg-slate-800 text-slate-500 border border-slate-700'
                          : 'bg-slate-200 text-slate-400 border border-slate-300'
                      }`}
                      title={`D${bitIdx}: ${isHigh ? '1' : '0'}`}
                    >
                      {isHigh ? '1' : '0'}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center text-[8px] text-slate-400 pt-0.5">
                <span className="text-slate-500">{vMin}V</span>
                <span className="text-amber-300 font-bold">0x{code.toString(16).toUpperCase()} ({code})</span>
                <span className="text-slate-500">{vMax}V</span>
              </div>
            </div>
          );
        })()}

        {/* ── DAC (Digital-to-Analog Converter) ── */}
        {kind === 'dac' && (() => {
          const bits = Math.max(1, Math.min(16, params.resolution ?? 4));
          let code = 0;
          for (let b = 0; b < bits; b++) {
            const bitVal = compSimState?.logicState?.[`d${b}`] ?? 0;
            if (bitVal === 1) code |= (1 << b);
          }
          const vMin = params.vMin ?? 0.0;
          const vMax = params.vMax ?? 5.0;
          const maxCode = (1 << bits) - 1;
          const vOut = vMin + (code / (maxCode || 1)) * (vMax - vMin);
          const percent = Math.max(0, Math.min(100, ((vOut - vMin) / (vMax - vMin || 1)) * 100));

          return (
            <div className="flex flex-col gap-1.5 w-full px-2 py-1 text-center select-none font-mono">
              <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold border-b border-slate-700/50 pb-1">
                <span className="text-purple-400">DAC {bits}-BIT</span>
                <span className="text-emerald-400 font-extrabold">{vOut.toFixed(2)}V</span>
              </div>

              {/* Bit Indicators (D_{N-1} ... D0) */}
              <div className="flex items-center justify-center gap-0.5 py-0.5">
                {Array.from({ length: bits }).map((_, i) => {
                  const bitIdx = bits - 1 - i;
                  const isHigh = ((code >> bitIdx) & 1) === 1;
                  return (
                    <div
                      key={bitIdx}
                      className={`w-3.5 h-4 rounded flex items-center justify-center text-[8px] font-bold transition-all ${
                        isHigh
                          ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.7)]'
                          : isDark
                          ? 'bg-slate-800 text-slate-500 border border-slate-700'
                          : 'bg-slate-200 text-slate-400 border border-slate-300'
                      }`}
                      title={`D${bitIdx}: ${isHigh ? '1' : '0'}`}
                    >
                      {isHigh ? '1' : '0'}
                    </div>
                  );
                })}
              </div>

              {/* Mini Voltage Gauge Bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-100"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[8px] text-slate-400 pt-0.5">
                <span className="text-slate-500">{vMin}V</span>
                <span className="text-purple-300 font-bold">0x{code.toString(16).toUpperCase()} ({code})</span>
                <span className="text-slate-500">{vMax}V</span>
              </div>
            </div>
          );
        })()}

        {/* ── HIL INGRESS (ESP32 Hardware → Canvas) ── */}
        {kind === 'hil_ingress' && (() => {
          const pinName = params.hilPin || 'A0';
          const pinType = params.hilPinType || 'adc';
          const v = compSimState?.nodeVoltages?.['out'] ?? 0;
          const logic = compSimState?.logicState?.['out'] ?? (v >= 2.5 ? 1 : 0);
          const isDigital = pinType === 'gpio_in';

          return (
            <div className="flex flex-col gap-1 w-full px-2 py-1 select-none font-mono text-center">
              <div className="flex items-center justify-between text-[9px] text-orange-400 font-bold border-b border-orange-500/20 pb-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />
                  <span>RX INGRESS</span>
                </span>
                <span className="px-1 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[8px]">
                  {pinName}
                </span>
              </div>

              <div className="flex items-center justify-center py-1">
                <div className={`px-2.5 py-1 rounded-md border font-bold text-xs shadow-inner flex items-center gap-1.5 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'
                }`}>
                  <span className="text-[10px] text-slate-500">{pinType.toUpperCase()}:</span>
                  <span className={isDigital ? (logic === 1 ? 'text-emerald-400 font-extrabold' : 'text-slate-400') : 'text-cyan-400 font-extrabold'}>
                    {isDigital ? (logic === 1 ? '1 (HIGH)' : '0 (LOW)') : `${v.toFixed(3)} V`}
                  </span>
                </div>
              </div>

              <div className="text-[8px] text-slate-400 truncate">
                ESP32 → Canvas Output
              </div>
            </div>
          );
        })()}

        {/* ── HIL EGRESS (Canvas → ESP32 Hardware) ── */}
        {kind === 'hil_egress' && (() => {
          const pinName = params.hilPin || 'DAC0';
          const pinType = params.hilPinType || 'dac';
          const v = compSimState?.nodeVoltages?.['in'] ?? 0;
          const logic = compSimState?.logicState?.['in'] ?? (v >= 2.5 ? 1 : 0);
          const isDigital = pinType === 'gpio_out';

          return (
            <div className="flex flex-col gap-1 w-full px-2 py-1 select-none font-mono text-center">
              <div className="flex items-center justify-between text-[9px] text-orange-400 font-bold border-b border-orange-500/20 pb-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span>TX EGRESS</span>
                </span>
                <span className="px-1 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[8px]">
                  {pinName}
                </span>
              </div>

              <div className="flex items-center justify-center py-1">
                <div className={`px-2.5 py-1 rounded-md border font-bold text-xs shadow-inner flex items-center gap-1.5 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'
                }`}>
                  <span className="text-[10px] text-slate-500">{pinType.toUpperCase()}:</span>
                  <span className={isDigital ? (logic === 1 ? 'text-emerald-400 font-extrabold' : 'text-slate-400') : 'text-orange-400 font-extrabold'}>
                    {isDigital ? (logic === 1 ? '1 (HIGH)' : '0 (LOW)') : `${v.toFixed(3)} V`}
                  </span>
                </div>
              </div>

              <div className="text-[8px] text-slate-400 truncate">
                Canvas → ESP32 Pin
              </div>
            </div>
          );
        })()}
        {/* ── DIGITAL LOGIC GATES (Dynamic N-Input Lead Rendering) ── */}
        {kind === 'gate_and' && (
          <svg className={`w-16 h-10 stroke-2 fill-none ${isDark ? 'stroke-emerald-400 fill-emerald-950/20' : 'stroke-emerald-700 fill-emerald-50'}`} viewBox="0 0 80 40">
            {compPins.filter(p => p.kind === 'digital_in').map((p, idx, arr) => {
              const y = arr.length === 1 ? 20 : 8 + (idx * 24) / (arr.length - 1);
              return <line key={p.id} x1="0" y1={y} x2="20" y2={y} />;
            })}
            <path d="M 20 5 L 42 5 C 56 5, 56 35, 42 35 L 20 35 Z" />
            <line x1="56" y1="20" x2="80" y2="20" />
          </svg>
        )}
        {kind === 'gate_or' && (
          <svg className={`w-16 h-10 stroke-2 fill-none ${isDark ? 'stroke-blue-400 fill-blue-950/20' : 'stroke-blue-700 fill-blue-50'}`} viewBox="0 0 80 40">
            {compPins.filter(p => p.kind === 'digital_in').map((p, idx, arr) => {
              const y = arr.length === 1 ? 20 : 8 + (idx * 24) / (arr.length - 1);
              return <line key={p.id} x1="0" y1={y} x2="22" y2={y} />;
            })}
            <path d="M 18 5 C 28 15, 28 25, 18 35 C 35 35, 52 28, 58 20 C 52 12, 35 5, 18 5 Z" />
            <line x1="58" y1="20" x2="80" y2="20" />
          </svg>
        )}
        {kind === 'gate_not' && (
          <svg className={`w-16 h-10 stroke-2 fill-none ${isDark ? 'stroke-purple-400 fill-purple-950/20' : 'stroke-purple-700 fill-purple-50'}`} viewBox="0 0 80 40">
            <line x1="0" y1="20" x2="25" y2="20" />
            <polygon points="25,8 25,32 50,20" />
            <circle cx="54" cy="20" r="4" />
            <line x1="58" y1="20" x2="80" y2="20" />
          </svg>
        )}
        {kind === 'gate_nand' && (
          <svg className={`w-16 h-10 stroke-2 fill-none ${isDark ? 'stroke-rose-400 fill-rose-950/20' : 'stroke-rose-700 fill-rose-50'}`} viewBox="0 0 80 40">
            {compPins.filter(p => p.kind === 'digital_in').map((p, idx, arr) => {
              const y = arr.length === 1 ? 20 : 8 + (idx * 24) / (arr.length - 1);
              return <line key={p.id} x1="0" y1={y} x2="18" y2={y} />;
            })}
            <path d="M 18 5 L 38 5 C 50 5, 50 35, 38 35 L 18 35 Z" />
            <circle cx="54" cy="20" r="4" />
            <line x1="58" y1="20" x2="80" y2="20" />
          </svg>
        )}
        {kind === 'gate_nor' && (
          <svg className={`w-16 h-10 stroke-2 fill-none ${isDark ? 'stroke-indigo-400 fill-indigo-950/20' : 'stroke-indigo-700 fill-indigo-50'}`} viewBox="0 0 80 40">
            {compPins.filter(p => p.kind === 'digital_in').map((p, idx, arr) => {
              const y = arr.length === 1 ? 20 : 8 + (idx * 24) / (arr.length - 1);
              return <line key={p.id} x1="0" y1={y} x2="20" y2={y} />;
            })}
            <path d="M 16 5 C 26 15, 26 25, 16 35 C 33 35, 48 28, 52 20 C 48 12, 33 5, 16 5 Z" />
            <circle cx="56" cy="20" r="4" />
            <line x1="60" y1="20" x2="80" y2="20" />
          </svg>
        )}
        {kind === 'gate_xor' && (
          <svg className={`w-16 h-10 stroke-2 fill-none ${isDark ? 'stroke-cyan-400 fill-cyan-950/20' : 'stroke-cyan-700 fill-cyan-50'}`} viewBox="0 0 80 40">
            {compPins.filter(p => p.kind === 'digital_in').map((p, idx, arr) => {
              const y = arr.length === 1 ? 20 : 8 + (idx * 24) / (arr.length - 1);
              return <line key={p.id} x1="0" y1={y} x2="18" y2={y} />;
            })}
            <path d="M 14 5 C 24 15, 24 25, 14 35" />
            <path d="M 20 5 C 30 15, 30 25, 20 35 C 37 35, 54 28, 60 20 C 54 12, 37 5, 20 5 Z" />
            <line x1="60" y1="20" x2="80" y2="20" />
          </svg>
        )}
        {kind === 'gate_xnor' && (
          <svg className={`w-16 h-10 stroke-2 fill-none ${isDark ? 'stroke-teal-400 fill-teal-950/20' : 'stroke-teal-700 fill-teal-50'}`} viewBox="0 0 80 40">
            {compPins.filter(p => p.kind === 'digital_in').map((p, idx, arr) => {
              const y = arr.length === 1 ? 20 : 8 + (idx * 24) / (arr.length - 1);
              return <line key={p.id} x1="0" y1={y} x2="16" y2={y} />;
            })}
            <path d="M 12 5 C 22 15, 22 25, 12 35" />
            <path d="M 18 5 C 28 15, 28 25, 18 35 C 35 35, 48 28, 54 20 C 48 12, 35 5, 18 5 Z" />
            <circle cx="58" cy="20" r="4" />
            <line x1="62" y1="20" x2="80" y2="20" />
          </svg>
        )}
        {(kind === 'latch_sr' || kind === 'latch_d' || kind === 'latch_jk') && (() => {
          const qVal = compSimState?.logicState?.['Q'] ?? 0;
          const qBarVal = compSimState?.logicState?.['Qbar'] ?? (qVal === 1 ? 0 : 1);
          return (
            <div className={`w-24 h-14 rounded-lg border p-1 flex flex-col justify-between font-mono text-[9px] ${isDark ? 'bg-slate-950 border-cyan-500/60' : 'bg-slate-50 border-cyan-700'}`}>
              <div className="flex justify-between font-bold">
                <span className="text-cyan-400">{kind === 'latch_sr' ? 'S' : kind === 'latch_d' ? 'D' : 'J'}</span>
                <span className={`px-1 py-0.2 rounded font-bold transition-all duration-75 ${qVal === 1 ? 'bg-cyan-500 text-white shadow-sm ring-1 ring-cyan-400' : 'text-slate-400 bg-slate-800'}`}>
                  Q={qVal}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-cyan-400">{kind === 'latch_sr' ? 'R' : kind === 'latch_d' ? 'EN' : 'K'}</span>
                <span className={`px-1 py-0.2 rounded font-bold transition-all duration-75 ${qBarVal === 1 ? 'bg-slate-700 text-slate-200' : 'text-slate-500'}`}>
                  Q̄={qBarVal}
                </span>
              </div>
              <div className="text-[7px] text-cyan-500/80 text-center font-bold">
                {params.triggerType === 'level_low' ? 'Active-Low' : 'Level Latch'}
              </div>
            </div>
          );
        })()}
        {(kind === 'ff_d' || kind === 'ff_t' || kind === 'ff_jk' || kind === 'ff_sr') && (() => {
          const qVal = compSimState?.logicState?.['Q'] ?? 0;
          const qBarVal = compSimState?.logicState?.['Qbar'] ?? (qVal === 1 ? 0 : 1);
          return (
            <div className={`w-24 h-16 rounded-lg border p-1.5 flex flex-col justify-between font-mono text-[9px] ${isDark ? 'bg-slate-950 border-purple-500/60' : 'bg-slate-50 border-purple-700'}`}>
              <div className="flex justify-between font-bold">
                <span className="text-purple-400">{kind === 'ff_d' ? 'D' : kind === 'ff_t' ? 'T' : kind === 'ff_jk' ? 'J' : 'S'}</span>
                <span className={`px-1 py-0.2 rounded font-bold transition-all duration-75 ${qVal === 1 ? 'bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-400' : 'text-slate-400 bg-slate-800'}`}>
                  Q={qVal}
                </span>
              </div>
              <div className="flex justify-between items-center text-[8px] font-bold">
                <span className="text-blue-400 flex items-center gap-0.5">
                  {params.triggerType === 'falling_edge' ? '⍡CLK' : '▶CLK'}
                </span>
                <span className={`px-1 py-0.2 rounded font-bold transition-all duration-75 ${qBarVal === 1 ? 'bg-slate-700 text-slate-200' : 'text-slate-500'}`}>
                  Q̄={qBarVal}
                </span>
              </div>
              <div className="flex justify-between font-bold text-[8px]">
                <span className="text-purple-400">{kind === 'ff_jk' ? 'K' : kind === 'ff_sr' ? 'R' : 'CLR'}</span>
                <span className="text-[7px] text-purple-400/90 font-mono">
                  {params.triggerType === 'falling_edge'
                    ? '↓Fall'
                    : params.triggerType === 'level_high'
                    ? '▔Lvl-H'
                    : params.triggerType === 'level_low'
                    ? ' Lvl-L'
                    : '↑Rise'}
                </span>
              </div>
            </div>
          );
        })()}
        {(kind === 'counter_4bit' || kind === 'decoder_2to4') && (
          <div className={`w-20 h-14 rounded border p-1 flex flex-col justify-between font-mono text-[8px] ${isDark ? 'bg-slate-950 border-emerald-500/60' : 'bg-slate-50 border-emerald-700'}`}>
            <div className="font-bold text-center text-emerald-400">{kind === 'counter_4bit' ? '4-BIT CNT' : '2:4 DEC'}</div>
            <div className="flex justify-between text-slate-300 font-bold">
              <span>IN</span>
              <span>Q[3:0]</span>
            </div>
          </div>
        )}
        {kind === 'led' && (() => {
          const vP = compSimState?.nodeVoltages?.['p'] ?? 0;
          const vN = compSimState?.nodeVoltages?.['n'] ?? 0;
          const ledV = Math.max(0, vP - vN, params.voltage ?? 0);
          const isLit = ledV >= 1.5;
          const ledColor = params.color || '#22c55e';
          return (
            <div className="flex items-center justify-center p-2">
              <div
                className={`w-8 h-8 rounded-full border-2 transition-all duration-100 flex items-center justify-center ${
                  isLit
                    ? 'ring-4 scale-105'
                    : 'opacity-30 border-slate-700 bg-slate-900'
                }`}
                style={{
                  backgroundColor: isLit ? ledColor : `${ledColor}22`,
                  borderColor: isLit ? '#ffffff' : '#475569',
                  boxShadow: isLit ? `0 0 24px ${ledColor}, 0 0 8px ${ledColor}` : undefined,
                }}
              >
                {isLit && <span className="w-2 h-2 rounded-full bg-white/90 animate-ping" />}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const compPins = getComponentPins(kind, params);
  const compDims = getComponentDimensions(kind, params);

  return (
    <div
      onClick={() => selectComponent(id)}
      style={{
        width: compDims.width,
        minWidth: compDims.width,
        minHeight: compDims.height,
      }}
      className={`relative rounded-xl border-2 shadow-lg transition-all duration-150 cursor-pointer ${
        isDark
          ? 'bg-slate-900/95 text-slate-100 backdrop-blur-md'
          : 'bg-white text-slate-950 shadow-slate-300/80 border-slate-300'
      } ${
        selected
          ? 'border-cyan-500 shadow-[0_0_22px_rgba(6,182,212,0.4)] ring-2 ring-cyan-500'
          : isDark
          ? 'border-slate-800 hover:border-slate-600'
          : 'border-slate-300 hover:border-cyan-600 hover:shadow-xl'
      }`}
    >
      {/* ── Node Header ── */}
      <div
        className={`flex items-center justify-between px-2.5 py-1.5 border-b rounded-t-xl gap-1 ${
          isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-300 text-slate-900'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {meta.category === 'digital' && <Cpu className="w-3.5 h-3.5 text-green-500 shrink-0" />}
          {meta.category === 'sources' && <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          {meta.category === 'instruments' && <Activity className="w-3.5 h-3.5 text-cyan-500 shrink-0" />}
          {meta.category === 'hil' && <Radio className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
          {meta.category === 'controls' && <Sliders className="w-3.5 h-3.5 text-purple-500 shrink-0" />}
          {meta.category === 'passives' && <Gauge className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
          <span className={`text-[11px] font-bold tracking-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{meta.name}</span>
          {params.logicAnalyzerChannel !== undefined && (
            <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 font-bold shrink-0 shadow-sm">
              ⚡ CH{params.logicAnalyzerChannel}
            </span>
          )}
          {params.truthTableLabel && (
            <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-blue-500/25 text-blue-300 border border-blue-500/50 font-bold shrink-0">
              📊 {params.truthTableLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Settings / Inspector Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              selectComponent(id);
              setShowInspector(true);
            }}
            className={`p-0.5 rounded transition ${isDark ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-slate-950 hover:bg-slate-200'}`}
            title="Open Component Settings & Parameters"
          >
            <Sliders className="w-3 h-3" />
          </button>
          {/* Rotate Button */}
          <button
            onClick={handleRotate}
            className={`p-0.5 rounded transition ${isDark ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-slate-950 hover:bg-slate-200'}`}
            title="Rotate Component (or press 'R')"
          >
            <RotateCw className="w-3 h-3" />
          </button>
          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeComponent(id);
              logger.info('canvas', `Removed component "${meta.name}" (${id})`);
            }}
            className={`p-0.5 rounded transition ${isDark ? 'text-slate-400 hover:text-red-400' : 'text-slate-500 hover:text-red-600 hover:bg-slate-200'}`}
            title="Delete component"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Node Body & Inline Value Modifiers / Instrument Screens ── */}
      <div className="p-2 flex flex-col items-center justify-center min-h-[50px] gap-1.5">
        {renderSymbol()}

        {/* ── LIVE SIMULATION READOUT (VOLTAGE & CURRENT) ── */}
        {compSimState && (kind === 'resistor' || kind === 'diode' || kind === 'zener' || kind === 'capacitor' || kind === 'inductor') && (
          <div className={`flex items-center justify-between w-full px-1.5 py-0.5 rounded text-[9px] font-mono border ${
            isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-700 font-semibold'
          }`}>
            <span>ΔV: <b className={isDark ? 'text-cyan-400 font-bold' : 'text-blue-700 font-extrabold'}>{Math.abs(vDiff) < 0.001 ? '0.00V' : `${vDiff >= 0 ? '+' : ''}${vDiff.toFixed(2)}V`}</b></span>
            <span>I: <b className={isDark ? 'text-amber-400 font-bold' : 'text-amber-800 font-extrabold'}>{Math.abs(compSimState.branchCurrents?.['p'] ?? (kind === 'resistor' && params.resistance ? vDiff / params.resistance : 0)) < 0.0001 ? '0.0mA' : `${(Math.abs(compSimState.branchCurrents?.['p'] ?? (kind === 'resistor' && params.resistance ? vDiff / params.resistance : 0)) * 1000).toFixed(1)}mA`}</b></span>
          </div>
        )}

        {/* ── DIGITAL MULTIMETER DISPLAY ── */}
        {kind === 'multimeter' && (
          <div className="w-full flex flex-col items-center gap-1.5">
            <div className="w-full bg-[#041014] border-2 border-cyan-800/80 rounded-lg p-2 flex flex-col items-center shadow-inner">
              <div className="w-full flex justify-between items-center text-[9px] font-mono text-cyan-400/80 mb-0.5">
                <span>DC VOLTS</span>
                <span className="text-amber-400 font-bold">AUTO</span>
              </div>
              <div className="text-xl font-mono font-black text-cyan-300 tracking-wider drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]">
                {Math.abs(vDiff) < 0.001
                  ? '0.000 V'
                  : Math.abs(vDiff) < 1
                  ? `${(vDiff * 1000).toFixed(1)} mV`
                  : `${vDiff >= 0 ? '+' : ''}${vDiff.toFixed(3)} V`}
              </div>
            </div>
          </div>
        )}

        {/* ── DC VOLTMETER GAUGE ── */}
        {kind === 'voltmeter' && (
          <div className="flex flex-col items-center gap-1">
            <div className="px-3 py-1 rounded bg-[#041118] border border-cyan-700 text-cyan-300 font-mono font-extrabold text-sm shadow-inner">
              {Math.abs(vDiff) < 0.001
                ? '0.00 V'
                : `${vDiff >= 0 ? '+' : ''}${vDiff.toFixed(2)} V`}
            </div>
          </div>
        )}

        {/* ── DC AMMETER GAUGE ── */}
        {kind === 'ammeter' && (
          <div className="flex flex-col items-center gap-1">
            <div className="px-3 py-1 rounded bg-[#130704] border border-amber-700 text-amber-300 font-mono font-extrabold text-sm shadow-inner">
              {Math.abs(currentA) < 0.0001
                ? '0.00 mA'
                : Math.abs(currentA) < 1
                ? `${(currentA * 1000).toFixed(2)} mA`
                : `${currentA.toFixed(3)} A`}
            </div>
          </div>
        )}

        {/* ── OSCILLOSCOPE PROBE CONNECTION DISPLAY ── */}
        {kind === 'oscilloscope' && (
          <div className="w-full flex flex-col gap-2 p-0.5">
            {/* Channel Header / Selector */}
            <div className="flex items-center justify-between gap-1 text-[10px]">
              <span className={`font-bold uppercase tracking-tight ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>Channel:</span>
              <select
                value={params.scopeChannel ?? 1}
                onChange={(e) => {
                  const ch = parseInt(e.target.value) as 1 | 2 | 3 | 4;
                  updateComponentParams(id, { scopeChannel: ch });
                  logger.info('canvas', `Oscilloscope probe (${id}) mapped to CH ${ch}`);
                }}
                className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] border outline-none cursor-pointer ${
                  (params.scopeChannel ?? 1) === 1 ? (isDark ? 'bg-cyan-950 text-cyan-300 border-cyan-700' : 'bg-cyan-100 text-cyan-900 border-cyan-600') :
                  (params.scopeChannel ?? 1) === 2 ? (isDark ? 'bg-amber-950 text-amber-300 border-amber-700' : 'bg-amber-100 text-amber-900 border-amber-600') :
                  (params.scopeChannel ?? 1) === 3 ? (isDark ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-emerald-100 text-emerald-900 border-emerald-600') :
                  (isDark ? 'bg-purple-950 text-purple-300 border-purple-700' : 'bg-purple-100 text-purple-900 border-purple-600')
                }`}
              >
                {[
                  { ch: 1, name: 'CH 1 (Cyan)' },
                  { ch: 2, name: 'CH 2 (Amber)' },
                  { ch: 3, name: 'CH 3 (Emerald)' },
                  { ch: 4, name: 'CH 4 (Purple)' },
                ].map(({ ch, name }) => {
                  const otherOwner = Object.values(components).find(
                    (c) => c.id !== id && c.kind === 'oscilloscope' && (c.params.scopeChannel ?? 1) === ch
                  );
                  return (
                    <option key={ch} value={ch}>
                      {name}{otherOwner ? ` (Swaps: ${otherOwner.label})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Sensed Connection Breakdown Box */}
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-1.5 text-[10px] font-mono shadow-inner text-white">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-cyan-400 font-bold">(+) Sensing:</span>
                <span className="truncate max-w-[110px] text-right font-medium text-white">
                  {posComp ? `${posComp.label} (${posPin})` : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-slate-500 font-bold">(-) Ground:</span>
                <span className="truncate max-w-[110px] text-right text-slate-300">
                  {refComp ? `${refComp.label} (${refPin})` : '0V Ref'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">Measured V:</span>
                <span className="font-bold text-cyan-300">
                  {Math.abs(vDiff) < 0.001 ? '0.00 V' : `${vDiff >= 0 ? '+' : ''}${vDiff.toFixed(2)} V`}
                </span>
              </div>
            </div>

            {/* Quick Open Scope Button */}
            <button
              onClick={() => setShowOscilloscope(true)}
              className={`w-full py-1.5 rounded-lg font-bold text-[10px] transition flex items-center justify-center gap-1.5 shadow-sm ${
                isDark
                  ? 'bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white font-bold'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> View On Scope
            </button>
          </div>
        )}

        {/* ── OP-AMP LIVE STATUS ── */}
        {kind === 'opamp' && (
          <div className="flex flex-col items-center gap-1 text-[10px] font-mono w-full">
            <div className={`flex justify-between w-full px-1 ${isDark ? 'text-slate-400' : 'text-slate-700 font-semibold'}`}>
              <span>V(out):</span>
              <span className={isDark ? 'text-cyan-400 font-bold' : 'text-blue-700 font-extrabold'}>
                {compSimState?.nodeVoltages?.['out'] !== undefined
                  ? `${compSimState.nodeVoltages['out'] >= 0 ? '+' : ''}${compSimState.nodeVoltages['out'].toFixed(2)} V`
                  : '0.00 V'}
              </span>
            </div>
            <div className={`flex justify-between w-full px-1 ${isDark ? 'text-slate-400' : 'text-slate-700 font-semibold'}`}>
              <span>V_diff:</span>
              <span className={isDark ? 'text-slate-200' : 'text-slate-900 font-bold'}>
                {((compSimState?.nodeVoltages?.['inp'] ?? 0) - (compSimState?.nodeVoltages?.['inn'] ?? 0)).toFixed(3)} V
              </span>
            </div>
          </div>
        )}

        {/* ── NE555 TIMER STATUS ── */}
        {kind === 'ic555' && (
          <div className="flex flex-col items-center gap-1 text-[10px] font-mono w-full">
            <div className="flex justify-between w-full px-1">
              <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-semibold'}>OUT (Pin 3):</span>
              <span className={`font-bold ${params.timerState === 1 ? (isDark ? 'text-green-400' : 'text-green-700') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>
                {params.timerState === 1 ? 'HIGH (VCC)' : 'LOW (0V)'}
              </span>
            </div>
            <div className={`flex justify-between w-full px-1 ${isDark ? 'text-slate-400' : 'text-slate-700 font-semibold'}`}>
              <span>Discharge:</span>
              <span className={isDark ? 'text-amber-400' : 'text-amber-700 font-bold'}>
                {params.timerState === 1 ? 'OFF (High-Z)' : 'ON (0Ω GND)'}
              </span>
            </div>
          </div>
        )}

        {/* RESISTOR */}
        {kind === 'resistor' && (
          <div className={`flex items-center justify-center gap-1 text-[11px] font-mono font-semibold ${isDark ? 'text-cyan-400' : 'text-cyan-900'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>R:</span>
            <input
              type="number"
              className={`w-16 px-1 py-0.5 border rounded text-center text-xs outline-none focus:border-cyan-500 font-bold ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
              }`}
              value={params.resistance ?? 1000}
              onChange={(e) => updateComponentParams(id, { resistance: Math.max(0.1, parseFloat(e.target.value) || 1) })}
            />
            <span className={`text-[10px] font-bold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>({formatVal(params.resistance ?? 1000, 'Ω')})</span>
          </div>
        )}

        {/* CAPACITOR */}
        {kind === 'capacitor' && (
          <div className={`flex items-center justify-center gap-1.5 text-[11px] font-mono font-semibold ${isDark ? 'text-cyan-400' : 'text-cyan-900'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>C:</span>
            <input
              type="number"
              step="any"
              className={`w-20 px-1 py-0.5 border rounded text-center text-[10px] outline-none focus:border-cyan-500 font-bold ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
              }`}
              value={params.capacitance ?? 10e-6}
              onChange={(e) => updateComponentParams(id, { capacitance: Math.max(1e-15, parseFloat(e.target.value) || 1e-6) })}
            />
            <span className={`text-[10px] font-bold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>({formatVal(params.capacitance, 'F')})</span>
          </div>
        )}

        {/* INDUCTOR */}
        {kind === 'inductor' && (
          <div className={`flex items-center justify-center gap-1.5 text-[11px] font-mono font-semibold ${isDark ? 'text-cyan-400' : 'text-cyan-900'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>L:</span>
            <input
              type="number"
              step="any"
              className={`w-20 px-1 py-0.5 border rounded text-center text-[10px] outline-none focus:border-cyan-500 font-bold ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
              }`}
              value={params.inductance ?? 10e-3}
              onChange={(e) => updateComponentParams(id, { inductance: Math.max(1e-12, parseFloat(e.target.value) || 1e-3) })}
            />
            <span className={`text-[10px] font-bold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>({formatVal(params.inductance, 'H')})</span>
          </div>
        )}

        {/* DC VOLTAGE */}
        {kind === 'dc_voltage' && (
          <div className={`flex items-center justify-center gap-1.5 text-[11px] font-mono font-semibold ${isDark ? 'text-yellow-400' : 'text-amber-800'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>V:</span>
            <input
              type="number"
              step="0.5"
              className={`w-16 px-1.5 py-0.5 border rounded text-center text-xs outline-none focus:border-yellow-500 font-bold ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
              }`}
              value={params.voltage ?? 5.0}
              onChange={(e) => updateComponentParams(id, { voltage: parseFloat(e.target.value) || 0 })}
            />
            <span>V</span>
          </div>
        )}

        {/* CURRENT SOURCE */}
        {kind === 'current_source' && (
          <div className={`flex items-center justify-center gap-1 text-[11px] font-mono font-semibold ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>I:</span>
            <input
              type="number"
              step="1"
              className={`w-14 px-1 py-0.5 border rounded text-center text-xs outline-none focus:border-amber-500 font-bold ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
              }`}
              value={Math.round((params.current ?? 0.01) * 1000)}
              onChange={(e) => updateComponentParams(id, { current: (parseFloat(e.target.value) || 1) / 1000 })}
            />
            <span>mA</span>
          </div>
        )}

        {/* AC VOLTAGE & FUNCTION GENERATOR */}
        {(kind === 'ac_voltage' || kind === 'signal_generator') && (
          <div className={`flex flex-col gap-1 text-[10px] font-mono w-full px-2 ${isDark ? 'text-yellow-400' : 'text-amber-800 font-semibold'}`}>
            <div className="flex items-center justify-between w-full">
              <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>Amp:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  className={`w-14 px-1 py-0.5 border rounded text-center text-[10px] outline-none focus:border-yellow-500 font-bold ${
                    isDark ? 'bg-slate-950 border-slate-750 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
                  }`}
                  value={params.voltage ?? params.amplitude ?? 5.0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    updateComponentParams(id, { voltage: v, amplitude: v });
                  }}
                />
                <span>V</span>
              </div>
            </div>
            <div className="flex items-center justify-between w-full">
              <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>Freq:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="1"
                  className={`w-14 px-1 py-0.5 border rounded text-center text-[10px] outline-none focus:border-yellow-500 font-bold ${
                    isDark ? 'bg-slate-950 border-slate-755 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
                  }`}
                  value={params.frequency ?? 1000}
                  onChange={(e) => updateComponentParams(id, { frequency: Math.max(0.1, parseFloat(e.target.value) || 1) })}
                />
                <span>Hz</span>
              </div>
            </div>
          </div>
        )}

        {/* BJT (NPN / PNP) */}
        {(kind === 'bjt_npn' || kind === 'bjt_pnp') && (
          <div className={`flex items-center gap-1 text-[11px] font-mono font-semibold ${isDark ? 'text-purple-400' : 'text-purple-800'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>Beta (β):</span>
            <input
              type="number"
              step="10"
              className={`w-14 px-1 py-0.5 border rounded text-center text-xs outline-none focus:border-purple-500 font-bold ${
                isDark ? 'bg-slate-950 border-slate-750 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
              }`}
              value={params.beta ?? 100}
              onChange={(e) => updateComponentParams(id, { beta: parseInt(e.target.value) || 100 })}
            />
          </div>
        )}

        {/* ZENER DIODE */}
        {kind === 'zener' && (
          <div className={`flex items-center gap-1 text-[11px] font-mono font-semibold ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>Vz:</span>
            <input
              type="number"
              step="0.5"
              className={`w-12 px-1 py-0.5 border rounded text-center text-xs outline-none focus:border-amber-500 font-bold ${
                isDark ? 'bg-slate-950 border-slate-750 text-white' : 'bg-slate-100 border-2 border-slate-300 text-slate-900'
              }`}
              value={params.zenerVoltage ?? 5.1}
              onChange={(e) => updateComponentParams(id, { zenerVoltage: parseFloat(e.target.value) || 5.1 })}
            />
            <span>V</span>
          </div>
        )}

        {/* SWITCH */}
        {kind === 'switch' && (
          <button
            onClick={() => {
              const nextClosed = !params.closed;
              updateComponentParams(id, { closed: nextClosed });
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono border-2 transition font-bold ${
              isDark ? 'bg-slate-800 text-cyan-300 border-slate-600' : 'bg-slate-100 text-cyan-800 border-slate-300 hover:bg-slate-200'
            }`}
          >
            {params.closed ? (
              <>
                <ToggleRight className="w-4 h-4 text-green-500" /> CLOSED (0Ω)
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4 text-slate-400" /> OPEN (∞Ω)
              </>
            )}
          </button>
        )}

        {/* PUSHBUTTON */}
        {kind === 'pushbutton' && (
          <button
            onMouseDown={() => updateComponentParams(id, { closed: true })}
            onMouseUp={() => updateComponentParams(id, { closed: false })}
            onMouseLeave={() => updateComponentParams(id, { closed: false })}
            className={`px-3 py-1.5 rounded text-xs font-mono border-2 transition select-none font-bold ${
              params.closed
                ? 'bg-green-600/40 text-green-300 border-green-500 font-bold'
                : isDark ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
            }`}
          >
            {params.closed ? 'PRESSED' : 'HOLD TO PRESS'}
          </button>
        )}

        {/* POTENTIOMETER */}
        {kind === 'potentiometer' && (
          <div className="w-full flex flex-col gap-1 px-1">
            <div className="flex justify-between text-[10px] font-mono">
              <span className={isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}>Wiper</span>
              <span className={isDark ? 'text-cyan-400 font-bold' : 'text-cyan-800 font-bold'}>{Math.round((params.wiper ?? 0.5) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={params.wiper ?? 0.5}
              onChange={(e) => updateComponentParams(id, { wiper: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-400 rounded-lg appearance-none cursor-pointer accent-cyan-600"
            />
          </div>
        )}
      </div>

      {/* ── Color-Coded High-Contrast Terminal Handles (Rotated) ── */}
      {compPins.map((pin: PinDefinition) => {
        const rotPin = getRotatedPin(pin, rotation);
        const colorInfo = PIN_COLOR_MAP[pin.kind] || PIN_COLOR_MAP.analog;

        return (
          <div
            key={pin.id}
            style={{
              position: 'absolute',
              left: `${rotPin.x * 100}%`,
              top: `${rotPin.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
            className="z-30"
          >
            {/* Terminal Handle */}
            <Handle
              id={pin.id}
              type="source"
              position={rotPin.pos}
              isConnectable={true}
              style={{
                borderColor: colorInfo.border,
                backgroundColor: colorInfo.border,
                boxShadow: `0 0 10px ${colorInfo.border}`,
                pointerEvents: 'all',
              }}
              className="w-4 h-4 rounded-full border-2 hover:scale-150 transition-all duration-150 cursor-crosshair !static"
              title={`${pin.label} [${colorInfo.label}] — Drag to connect wire`}
            />

            {/* High-Contrast Bold Micro Pin Badge */}
            <span
              style={{
                backgroundColor: colorInfo.badgeBg,
                color: colorInfo.badgeText,
                borderColor: '#ffffff50',
              }}
              className={`absolute text-[10px] font-mono font-black select-none pointer-events-none whitespace-nowrap px-1.5 py-0.5 rounded-md border shadow-lg ${
                rotPin.x === 1 ? 'left-full ml-2 top-1/2 -translate-y-1/2' :
                rotPin.x === 0 ? 'right-full mr-2 top-1/2 -translate-y-1/2' :
                rotPin.y === 0 ? 'bottom-full mb-2 left-1/2 -translate-x-1/2' :
                'top-full mt-2 left-1/2 -translate-x-1/2'
              }`}
            >
              {pin.label}
            </span>
          </div>
        );
      })}
    </div>
  );
});
