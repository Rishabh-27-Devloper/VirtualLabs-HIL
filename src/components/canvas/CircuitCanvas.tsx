// ============================================================
// VirtualLab-HIL — Circuit Canvas (React Flow / XYFlow)
// ============================================================

import React, { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCircuitStore } from '@/store/circuitStore';
import { CustomComponentNode } from '@/components/nodes/CustomComponentNode';
import { CircuitEdge } from './CircuitEdge';
import type { ComponentKind } from '@/types/circuit';
import { logger } from '@/utils/logger';

const nodeTypes = {
  customComponent: CustomComponentNode,
};

const edgeTypes = {
  circuitEdge: CircuitEdge,
};

const CanvasInner: React.FC = () => {
  const nodes = useCircuitStore((s) => s.nodes);
  const edges = useCircuitStore((s) => s.edges);
  const onNodesChange = useCircuitStore((s) => s.onNodesChange);
  const onEdgesChange = useCircuitStore((s) => s.onEdgesChange);
  const onConnect = useCircuitStore((s) => s.onConnect);
  const addComponent = useCircuitStore((s) => s.addComponent);
  const selectComponent = useCircuitStore((s) => s.selectComponent);
  const selectEdge = useCircuitStore((s) => s.selectEdge);
  const selectedEdgeId = useCircuitStore((s) => s.selectedEdgeId);
  const removeEdge = useCircuitStore((s) => s.removeEdge);
  const simulationState = useCircuitStore((s) => s.simulationState);
  const performanceMode = useCircuitStore((s) => s.performanceMode);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';
  const isRunning = simulationState.status === 'running';

  const shouldAnimateEdges = isRunning && !performanceMode;

  const displayEdges = React.useMemo(() => {
    return edges.map((e) => (e.animated !== shouldAnimateEdges ? { ...e, animated: shouldAnimateEdges } : e));
  }, [edges, shouldAnimateEdges]);

  const { screenToFlowPosition } = useReactFlow();

  // Keyboard shortcut to delete selected wire or node
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) {
          e.preventDefault();
          removeEdge(selectedEdgeId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, removeEdge]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/virtuallab-component') as ComponentKind;
      if (!kind) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const id = addComponent(kind, position);
      logger.info('canvas', `Placed component "${kind}" onto canvas at (${Math.round(position.x)}, ${Math.round(position.y)})`);
    },
    [screenToFlowPosition, addComponent],
  );

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (params.source === params.target && params.sourceHandle === params.targetHandle) {
        logger.warn('canvas', 'Cannot connect a pin to itself.');
        return;
      }
      onConnect(params);
      logger.success(
        'canvas',
        `Connected wire: Node [${params.source}:${params.sourceHandle || 'p'}] <--> Node [${params.target}:${params.targetHandle || 'n'}]`,
      );
    },
    [onConnect],
  );

  return (
    <div
      className={`w-full h-full relative transition-colors duration-200 ${
        isDark ? 'bg-[#0a0c10]' : 'bg-[#eef2f6]'
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => {
          selectComponent(node.id);
          selectEdge(null);
        }}
        onEdgeClick={(_, edge) => {
          selectEdge(edge.id);
          selectComponent(null);
          logger.info('canvas', `Selected wire: [${edge.id}]. Press Delete or click red trash icon to remove.`);
        }}
        onPaneClick={() => {
          selectComponent(null);
          selectEdge(null);
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'circuitEdge',
          animated: shouldAnimateEdges,
        }}
        connectionLineStyle={{
          stroke: isDark ? '#38bdf8' : '#0284c7',
          strokeWidth: 3,
          strokeDasharray: '5,5',
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.6}
          color={isDark ? '#1e293b' : '#94a3b8'}
          className={isDark ? 'opacity-70' : 'opacity-90'}
        />
        <Controls
          position="bottom-left"
          className="!bottom-6 !left-4"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
};

export const CircuitCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
};
