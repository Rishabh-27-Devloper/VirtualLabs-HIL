// ============================================================
// VirtualLab-HIL — Custom Orthogonal Circuit Edge (Wire with Delete Button)
// ============================================================

import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from '@xyflow/react';
import { useCircuitStore } from '@/store/circuitStore';
import { Trash2, GitCommit } from 'lucide-react';
import { logger } from '@/utils/logger';

export const CircuitEdge: React.FC<EdgeProps> = memo(({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  });

  const simulationState = useCircuitStore((s) => s.simulationState);
  const performanceMode = useCircuitStore((s) => s.performanceMode);
  const selectedEdgeId = useCircuitStore((s) => s.selectedEdgeId);
  const removeEdge = useCircuitStore((s) => s.removeEdge);
  const selectEdge = useCircuitStore((s) => s.selectEdge);
  const splitEdgeWithJunction = useCircuitStore((s) => s.splitEdgeWithJunction);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';
  const components = useCircuitStore((s) => s.components);
  const isRunning = simulationState.status === 'running';

  const isEdgeSelected = selected || selectedEdgeId === id;

  // Evaluate pin potentials and terminal polarities using RMS for AC and DC gradients
  const componentStates = simulationState.componentStates;
  const compSrc = components[source];
  const compTgt = components[target];
  const srcState = componentStates?.[source];
  const tgtState = componentStates?.[target];

  const srcPin = sourceHandleId || 'p';
  const tgtPin = targetHandleId || 'n';

  // Helper to score the upstream/downstream energy potential of a component terminal
  const getTerminalPotentialScore = (
    comp: typeof compSrc,
    pinId: string,
    state: typeof srcState
  ): number => {
    if (!comp) return 0;
    const kind = comp.kind;

    // 1. Reference Ground is the absolute lowest potential (current sink)
    if (kind === 'ground') return -1000;

    // 2. Active Independent Power Sources
    if (kind === 'dc_voltage' || kind === 'ac_voltage' || kind === 'signal_generator') {
      const vRms = state?.nodeRmsVoltages?.[pinId] ?? Math.abs(state?.nodeVoltages?.[pinId] ?? 5.0);
      if (pinId === 'p' || pinId === 'out' || pinId === 'SIG' || pinId === 'V+') {
        return 10000 + vRms; // Highest potential: active energy source
      }
      return -500; // Negative / ground return terminal
    }

    // 3. Op-Amp Output vs Inputs
    if (kind === 'opamp') {
      if (pinId === 'out') return 5000 + (state?.nodeRmsVoltages?.['out'] ?? 0);
      if (pinId === 'vcc') return -100;
      if (pinId === 'vee') return -800;
      return 0;
    }

    // 4. BJT Transistor Terminals
    if (kind === 'bjt_npn') {
      if (pinId === 'emitter' || pinId === 'e') return 800; // Current exits emitter
      return -200; // Current enters base & collector
    }
    if (kind === 'bjt_pnp') {
      if (pinId === 'collector' || pinId === 'c') return 800; // Current exits collector
      if (pinId === 'base' || pinId === 'b') return 800;
      return -200; // Current enters emitter
    }

    // 5. MOSFET Transistor Terminals
    if (kind.startsWith('mosfet_n')) {
      if (pinId === 'source' || pinId === 's') return 800; // Current exits source
      return -200; // Current enters drain
    }
    if (kind.startsWith('mosfet_p')) {
      if (pinId === 'drain' || pinId === 'd') return 800; // Current exits drain
      return -200; // Current enters source
    }

    // 6. Passive 2-Terminal Devices (Resistors, Capacitors, Inductors, Diodes, LEDs)
    const otherPin = pinId === 'p' || pinId === '1' || pinId === 'A' ? ('n' as const) : ('p' as const);
    const vThisRms = state?.nodeRmsVoltages?.[pinId] ?? Math.abs(state?.nodeVoltages?.[pinId] ?? 0);
    const vOtherRms = state?.nodeRmsVoltages?.[otherPin] ?? Math.abs(state?.nodeVoltages?.[otherPin] ?? 0);

    // If other pin is at higher RMS, current passes through device and exits out this pin into wire
    if (vOtherRms > vThisRms + 1e-4) {
      return vOtherRms + 10;
    }
    // If this pin is at higher RMS, current enters from wire into this pin towards other pin
    if (vThisRms > vOtherRms + 1e-4) {
      return vOtherRms;
    }
    return vThisRms;
  };

  const srcScore = getTerminalPotentialScore(compSrc, srcPin, srcState);
  const tgtScore = getTerminalPotentialScore(compTgt, tgtPin, tgtState);

  // Check branch current magnitudes and voltage drops to know if current is actually flowing
  const iSrcMag = Math.abs(srcState?.branchCurrents?.[srcPin] ?? 0);
  const iTgtMag = Math.abs(tgtState?.branchCurrents?.[tgtPin] ?? 0);
  const currentMag = Math.max(iSrcMag, iTgtMag);

  const otherSrcPin = srcPin === 'p' ? 'n' : 'p';
  const otherTgtPin = tgtPin === 'p' ? 'n' : 'p';
  const vSrcDrop = Math.abs((srcState?.nodeRmsVoltages?.[srcPin] ?? 0) - (srcState?.nodeRmsVoltages?.[otherSrcPin] ?? 0));
  const vTgtDrop = Math.abs((tgtState?.nodeRmsVoltages?.[tgtPin] ?? 0) - (tgtState?.nodeRmsVoltages?.[otherTgtPin] ?? 0));

  const hasCurrent = isRunning && !performanceMode && (currentMag > 1e-6 || vSrcDrop > 0.05 || vTgtDrop > 0.05);

  let isForward = true;
  if (hasCurrent) {
    if (srcScore !== tgtScore) {
      isForward = srcScore > tgtScore;
    } else if (compTgt?.kind === 'ground') {
      isForward = true;
    } else if (compSrc?.kind === 'ground') {
      isForward = false;
    } else if (compSrc?.kind === 'dc_voltage' || compSrc?.kind === 'ac_voltage' || compSrc?.kind === 'signal_generator') {
      isForward = srcPin === 'p' || srcPin === 'out';
    } else if (compTgt?.kind === 'dc_voltage' || compTgt?.kind === 'ac_voltage' || compTgt?.kind === 'signal_generator') {
      isForward = !(tgtPin === 'p' || tgtPin === 'out');
    }
  }

  const animDuration = currentMag > 0.05 ? '0.6s' : currentMag > 0.005 ? '0.8s' : '1.1s';
  const flowAnimation = hasCurrent
    ? isForward
      ? `wire-flow-fwd ${animDuration} linear infinite`
      : `wire-flow-rev ${animDuration} linear infinite`
    : undefined;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeEdge(id);
  };

  const handleAddJunction = (e: React.MouseEvent) => {
    e.stopPropagation();
    splitEdgeWithJunction(id, { x: labelX, y: labelY });
  };

  return (
    <>
      <style>{`
        @keyframes wire-flow-fwd {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes wire-flow-rev {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 20; }
        }
      `}</style>

      {/* Selection / Active Glow Pass — Omitted when stopped or in Performance Mode */}
      {isEdgeSelected ? (
        <path
          d={edgePath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={8}
          strokeOpacity={0.4}
          className="pointer-events-none"
        />
      ) : isRunning && !performanceMode ? (
        <path
          d={edgePath}
          fill="none"
          stroke={isDark ? '#22d3ee' : '#0284c7'}
          strokeWidth={7}
          strokeOpacity={hasCurrent ? 0.3 : 0.15}
          className="pointer-events-none"
        />
      ) : null}

      {/* Invisible wider hit area for easy click selection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onClick={(e) => {
          e.stopPropagation();
          selectEdge(id);
          logger.info('canvas', `Selected wire: [${id}]. Press Delete or click red trash icon to remove.`);
        }}
        className="cursor-pointer"
      />

      {/* Core Wire with Directional Current Flow Animation */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isEdgeSelected
            ? '#f59e0b'
            : isDark
            ? '#38bdf8'
            : '#0284c7',
          strokeWidth: isEdgeSelected ? 3.5 : 2.5,
          strokeDasharray: hasCurrent ? '6, 4' : undefined,
          animation: flowAnimation,
        }}
      />

      {/* Junction Splicing & Delete Buttons on Hover / Selected */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`nodrag nopan transition-all duration-150 z-30 ${
            isEdgeSelected
              ? 'opacity-100 scale-100'
              : 'opacity-0 hover:opacity-100 scale-90 hover:scale-100'
          }`}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={handleAddJunction}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-[10px] font-bold shadow-2xl border border-white/50 cursor-pointer transition transform hover:scale-110"
              title="Split wire & insert a Wire Junction (Dot) to connect other wires"
            >
              <GitCommit className="w-3 h-3" />
              <span>+ Junction</span>
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 hover:bg-red-500 text-white font-mono text-[10px] font-bold shadow-2xl border border-white/50 cursor-pointer transition transform hover:scale-110"
              title="Delete Wire Connection (or press Delete/Backspace)"
            >
              <Trash2 className="w-3 h-3" />
              <span>Del</span>
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
