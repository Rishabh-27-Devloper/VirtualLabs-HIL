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
  const isRunning = simulationState.status === 'running';

  const isEdgeSelected = selected || selectedEdgeId === id;

  // Evaluate pin potentials to determine real physical current flow direction
  const componentStates = simulationState.componentStates;
  const vSrc = componentStates?.[source]?.nodeVoltages?.[sourceHandleId || 'p'] ?? 0;
  const vTgt = componentStates?.[target]?.nodeVoltages?.[targetHandleId || 'n'] ?? 0;
  const vDiff = vSrc - vTgt;

  // Conventional current flows from high potential (+) to low potential (-)
  const hasCurrent = isRunning && !performanceMode && Math.abs(vDiff) > 0.005;
  const isForward = vDiff > 0;
  const flowAnimation = hasCurrent
    ? isForward
      ? 'wire-flow-fwd 0.8s linear infinite'
      : 'wire-flow-rev 0.8s linear infinite'
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
