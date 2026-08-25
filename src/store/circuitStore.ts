// ============================================================
// VirtualLab-HIL — Zustand Circuit Store with Theme & Undo/Redo
// ============================================================

import { create } from 'zustand';
import type { Node, Edge, Connection } from '@xyflow/react';
import type {
  ComponentInstance, ComponentKind, ComponentParams, Netlist, Wire,
  NetNode, SimulationState, HilConnectionState, SimulationMode,
  OscilloscopeSettings, LogicAnalyzerSettings,
} from '@/types/circuit';
import { COMPONENT_REGISTRY } from '@/components/canvas/componentDefs';
import {
  SimulationDispatcher, createDispatcher, DEFAULT_CONFIG,
} from '@/engine/simulationDispatcher';
import { validateCircuitTopology, type CircuitDiagnosticError } from '@/engine/circuitValidator';
import { PRESET_CIRCUITS } from '@/data/presetCircuits';
import { compileAICircuitToCanvas } from '@/services/circuitLayoutCompiler';
import { logger } from '@/utils/logger';

export interface HistorySnapshot {
  nodes: Node[];
  edges: Edge[];
  components: Record<string, ComponentInstance>;
}

export interface CircuitState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  nodes: Node[];
  edges: Edge[];
  components: Record<string, ComponentInstance>;
  selectedComponentId: string | null;
  selectedEdgeId: string | null;

  circuitError: CircuitDiagnosticError | null;
  setCircuitError: (err: CircuitDiagnosticError | null) => void;

  // Undo / Redo history
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  simulationState: SimulationState;
  hilState: HilConnectionState;
  dispatcher: SimulationDispatcher | null;

  showOscilloscope: boolean;
  showLogicAnalyzer: boolean;
  showSignalGenerator: boolean;
  showMultimeter: boolean;
  showHILBridge: boolean;
  showInspector: boolean;
  showPalette: boolean;
  showTruthTable: boolean;

  scopeSettings: OscilloscopeSettings;
  logicSettings: LogicAnalyzerSettings;

  addComponent: (kind: ComponentKind, position: { x: number; y: number }) => string;
  updateComponentParams: (id: string, params: Partial<ComponentParams>) => void;
  removeComponent: (id: string) => void;
  selectComponent: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  removeEdge: (id: string) => void;

  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: Connection) => void;

  startSimulation: () => void;
  pauseSimulation: () => void;
  stopSimulation: () => void;
  resetSimulation: () => void;
  setSimulationMode: (mode: SimulationMode) => void;
  setSpeedMultiplier: (speed: number) => void;

  performanceMode: boolean;
  setPerformanceMode: (enabled: boolean) => void;

  setShowOscilloscope: (show: boolean) => void;
  setShowLogicAnalyzer: (show: boolean) => void;
  setShowSignalGenerator: (show: boolean) => void;
  setShowMultimeter: (show: boolean) => void;
  setShowHILBridge: (show: boolean) => void;
  setShowInspector: (show: boolean) => void;
  setShowPalette: (show: boolean) => void;
  togglePalette: () => void;
  toggleInspector: () => void;
  setShowTruthTable: (show: boolean) => void;
  showAICircuitModal: boolean;
  setShowAICircuitModal: (show: boolean) => void;
  loadGeneratedCircuit: (spec: any, appendMode?: boolean) => void;
  updateScopeSettings: (settings: Partial<OscilloscopeSettings>) => void;
  updateLogicSettings: (settings: Partial<LogicAnalyzerSettings>) => void;

  connectHIL: (url?: string, deviceId?: string) => void;
  disconnectHIL: () => void;
  updateHILServerUrl: (url: string) => void;
  injectHILIngress: (inputs: Record<string, number>) => void;

  loadPreset: (presetName: string) => void;
  clearCanvas: () => void;
  exportNetlist: () => string;
  importNetlist: (json: string) => void;

  // Browser Session Auto-Save
  lastAutosavedTime: string | null;
  hasAutosavedSession: boolean;
  saveSessionCache: () => void;
  clearSessionCache: () => void;
  restoreSessionFromCache: () => boolean;
}

export function computeNetlist(
  components: Record<string, ComponentInstance>,
  edges: Edge[],
): Netlist {
  const wires: Wire[] = [];
  const netNodes: Record<string, NetNode> = {};

  const parent: Record<string, string> = {};
  const find = (i: string): string => {
    if (!parent[i]) parent[i] = i;
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: string, j: string) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  };

  edges.forEach((edge) => {
    const srcPin = `${edge.source}:${edge.sourceHandle || 'p'}`;
    const tgtPin = `${edge.target}:${edge.targetHandle || 'n'}`;
    union(srcPin, tgtPin);
  });

  const pinToNet: Record<string, string> = {};
  edges.forEach((edge) => {
    const srcPin = `${edge.source}:${edge.sourceHandle || 'p'}`;
    const tgtPin = `${edge.target}:${edge.targetHandle || 'n'}`;
    const netId = `net_${find(srcPin)}`;
    pinToNet[srcPin] = netId;
    pinToNet[tgtPin] = netId;

    wires.push({
      id: edge.id,
      sourceComponentId: edge.source,
      sourcePinId: edge.sourceHandle || 'p',
      targetComponentId: edge.target,
      targetPinId: edge.targetHandle || 'n',
      netNodeId: netId,
    });
  });

  wires.forEach((wire) => {
    const netId = wire.netNodeId;
    if (!netNodes[netId]) {
      netNodes[netId] = {
        id: netId,
        connectedPins: [],
        isGround: false,
      };
    }
    netNodes[netId].connectedPins.push(
      { componentId: wire.sourceComponentId, pinId: wire.sourcePinId },
      { componentId: wire.targetComponentId, pinId: wire.targetPinId },
    );
  });

  const compList: ComponentInstance[] = Object.values(components);
  compList.forEach((comp) => {
    if (comp.kind === 'ground') {
      const gndPin = `${comp.id}:p`;
      const netId = pinToNet[gndPin];
      if (netId && netNodes[netId]) {
        netNodes[netId].isGround = true;
      }
    }
  });

  return { components, wires, netNodes };
}

const getInitialTheme = (): 'dark' | 'light' => {
  try {
    const saved = localStorage.getItem('virtuallab_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {
    // ignore
  }
  return 'dark';
};

export const AUTOSAVE_CACHE_KEY = 'virtuallab_session_autosave';
let autosaveTimer: any = null;

export const useCircuitStore = create<CircuitState>((set, get) => {
  let dispatcher: SimulationDispatcher | null = null;

  const scheduleAutosave = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        const { components, nodes, edges, scopeSettings } = get();
        if (Object.keys(components).length === 0) {
          return;
        }
        // Guarantee all component default and updated parameters are completely preserved
        const normalizedComponents: Record<string, ComponentInstance> = {};
        for (const [id, comp] of Object.entries(components)) {
          const meta = COMPONENT_REGISTRY[comp.kind];
          normalizedComponents[id] = {
            ...comp,
            params: {
              ...(meta?.defaultParams || {}),
              ...(comp.params || {}),
            },
          };
        }
        const synchronizedNodes = nodes.map((node) => {
          const comp = normalizedComponents[node.id];
          return {
            ...node,
            data: {
              ...node.data,
              componentId: node.id,
              kind: comp ? comp.kind : (node.data as any)?.kind,
              label: comp ? comp.label : (node.data as any)?.label,
              params: comp ? { ...comp.params } : ((node.data as any)?.params || {}),
            },
          };
        });
        const payload = {
          components: normalizedComponents,
          nodes: synchronizedNodes,
          edges,
          scopeSettings,
          timestamp: Date.now(),
        };
        localStorage.setItem(AUTOSAVE_CACHE_KEY, JSON.stringify(payload));
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        set({ hasAutosavedSession: true, lastAutosavedTime: timeStr });
      } catch (e) {
        console.warn('Session autosave failed', e);
      }
    }, 600);
  };

  const pushSnapshot = () => {
    const { nodes, edges, components, past } = get();
    const snapshot: HistorySnapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      components: JSON.parse(JSON.stringify(components)),
    };
    const newPast = [...past.slice(-40), snapshot];
    set({
      past: newPast,
      future: [],
      canUndo: true,
      canRedo: false,
    });
  };

  const updateHILMappings = () => {
    const { components } = get();
    const ingressPinMap: Record<string, string> = {};
    const egressPinMap: Record<string, string> = {};
    const compList: ComponentInstance[] = Object.values(components);

    compList.forEach((c) => {
      if (c.kind === 'hil_ingress' && c.params.hilPin) {
        ingressPinMap[c.params.hilPin] = c.id;
      } else if (c.kind === 'hil_egress' && c.params.hilPin) {
        egressPinMap[c.params.hilPin] = c.id;
      }
    });

    if (dispatcher) {
      dispatcher.setHILPinMap(ingressPinMap, egressPinMap);
    }
  };

  const syncNetlistWithDispatcher = () => {
    const { components, edges, simulationState, performanceMode } = get();
    const netlist = computeNetlist(components, edges);
    if (!dispatcher) {
      dispatcher = createDispatcher(
        netlist,
        {
          ...DEFAULT_CONFIG,
          mode: simulationState.mode,
          performanceMode: performanceMode,
          speedMultiplier: simulationState.config?.speedMultiplier ?? DEFAULT_CONFIG.speedMultiplier,
        },
        (simState: SimulationState, hilState: HilConnectionState) => {
          set({ simulationState: simState, hilState });
        },
        (err: CircuitDiagnosticError) => {
          set({ circuitError: err });
        }
      );
      set({ dispatcher });
    } else {
      dispatcher.updateNetlist(netlist);
    }
    updateHILMappings();
    scheduleAutosave();
  };

  return {
    theme: getInitialTheme(),
    toggleTheme: () => {
      const current = get().theme;
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('virtuallab_theme', next);
      } catch (e) {
        // ignore
      }
      set({ theme: next });
      logger.info('engine', `Switched UI theme to ${next.toUpperCase()} MODE`);
    },

    nodes: [],
    edges: [],
    components: {},
    selectedComponentId: null,

    past: [],
    future: [],
    canUndo: false,
    canRedo: false,

    undo: () => {
      const { past, future, nodes, edges, components } = get();
      if (past.length === 0) return;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);
      const currentSnapshot: HistorySnapshot = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        components: JSON.parse(JSON.stringify(components)),
      };

      set({
        nodes: previous.nodes,
        edges: previous.edges,
        components: previous.components,
        past: newPast,
        future: [currentSnapshot, ...future],
        canUndo: newPast.length > 0,
        canRedo: true,
      });

      syncNetlistWithDispatcher();
      logger.info('canvas', `Undo action applied (${newPast.length} states remaining)`);
    },

    redo: () => {
      const { past, future, nodes, edges, components } = get();
      if (future.length === 0) return;

      const next = future[0];
      const newFuture = future.slice(1);
      const currentSnapshot: HistorySnapshot = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        components: JSON.parse(JSON.stringify(components)),
      };

      set({
        nodes: next.nodes,
        edges: next.edges,
        components: next.components,
        past: [...past, currentSnapshot],
        future: newFuture,
        canUndo: true,
        canRedo: newFuture.length > 0,
      });

      syncNetlistWithDispatcher();
      logger.info('canvas', `Redo action applied (${newFuture.length} states remaining)`);
    },

    simulationState: {
      status: 'stopped',
      mode: 'virtual',
      currentTime: 0,
      stepCount: 0,
      config: DEFAULT_CONFIG,
      probeData: {},
      logicTraces: {},
    },
    hilState: {
      connected: false,
      deviceId: 'esp32_lab_01',
      serverUrl: (() => {
        try {
          return localStorage.getItem('virtuallab_hil_server') || 'wss://virtuallabs-hil.onrender.com/ws/ui';
        } catch {
          return 'wss://virtuallabs-hil.onrender.com/ws/ui';
        }
      })(),
      lastPacketMs: null,
      roundtripMs: null,
      packetsPerSecond: 0,
      ingressPinMap: {},
      egressPinMap: {},
    },
    dispatcher: null,
    performanceMode: false,

    showOscilloscope: false,
    showLogicAnalyzer: false,
    showSignalGenerator: false,
    showMultimeter: false,
    showHILBridge: false,
    showInspector: false,
    showPalette: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
    showTruthTable: false,

    scopeSettings: {
      channel1NodeId: null,
      channel2NodeId: null,
      channel3NodeId: null,
      channel4NodeId: null,
      enabled1: true,
      enabled2: true,
      enabled3: false,
      enabled4: false,
      timeDiv: 0.002,
      voltDiv1: 2.0,
      voltDiv2: 2.0,
      voltDiv3: 5.0,
      voltDiv4: 5.0,
      offset1: 0,
      offset2: 0,
      offset3: 0,
      offset4: 0,
      triggerLevel: 0.0,
      triggerChannel: 1,
      coupling1: 'DC',
      coupling2: 'DC',
      coupling3: 'DC',
      coupling4: 'DC',
      displayMode: 'overlay',
      running: true,
    },
    logicSettings: {
      channels: [null, null, null, null],
      timeDiv: 0.005,
      running: true,
    },

    addComponent: (kind: ComponentKind, position: { x: number; y: number }) => {
      pushSnapshot();
      const id = `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const meta = COMPONENT_REGISTRY[kind];
      const initialParams: ComponentParams = { ...(meta?.defaultParams || {}) };

      if (kind === 'oscilloscope') {
        const existingScopes = Object.values(get().components).filter((c) => c.kind === 'oscilloscope');
        const usedChannels = new Set(existingScopes.map((c) => c.params.scopeChannel ?? 1));
        let nextChannel: 1 | 2 | 3 | 4 = 1;
        for (const ch of [1, 2, 3, 4] as const) {
          if (!usedChannels.has(ch)) {
            nextChannel = ch;
            break;
          }
        }
        initialParams.scopeChannel = nextChannel;
      }

      const newComp: ComponentInstance = {
        id,
        kind,
        label: meta.name,
        params: initialParams,
      };

      const newNode: Node = {
        id,
        type: 'customComponent',
        position,
        width: meta.width || 140,
        height: meta.height || 90,
        data: {
          componentId: id,
          kind,
          label: meta.name,
          params: newComp.params,
        },
      };

      set((state) => ({
        components: { ...state.components, [id]: newComp },
        nodes: [...state.nodes, newNode],
        selectedComponentId: id,
      }));

      syncNetlistWithDispatcher();
      return id;
    },

    updateComponentParams: (id: string, params: Partial<ComponentParams>) => {
      pushSnapshot();
      set((state) => {
        const comp = state.components[id];
        if (!comp) return state;

        const newComponents = { ...state.components };
        const updatedComp = {
          ...comp,
          params: { ...comp.params, ...params },
        };
        newComponents[id] = updatedComp;

        // If oscilloscope scopeChannel was changed, ensure no collision with other probes
        if (comp.kind === 'oscilloscope' && params.scopeChannel !== undefined) {
          const targetChannel = params.scopeChannel;
          const otherScopes = Object.values(newComponents).filter(
            (c) => c.id !== id && c.kind === 'oscilloscope' && (c.params.scopeChannel ?? 1) === targetChannel
          );
          if (otherScopes.length > 0) {
            const oldChannel = (comp.params.scopeChannel ?? 1) as 1 | 2 | 3 | 4;
            for (const other of otherScopes) {
              const usedChannels = new Set(
                Object.values(newComponents)
                  .filter((c) => c.id !== other.id)
                  .map((c) => c.params.scopeChannel ?? 1)
              );
              let freeCh: 1 | 2 | 3 | 4 = oldChannel;
              if (usedChannels.has(freeCh)) {
                for (const ch of [1, 2, 3, 4] as const) {
                  if (!usedChannels.has(ch)) {
                    freeCh = ch;
                    break;
                  }
                }
              }
              newComponents[other.id] = {
                ...other,
                params: { ...other.params, scopeChannel: freeCh },
              };
            }
          }
        }

        const updatedNodes = state.nodes.map((node) => {
          const c = newComponents[node.id];
          return c ? { ...node, data: { ...node.data, params: c.params } } : node;
        });

        return {
          components: newComponents,
          nodes: updatedNodes,
        };
      });
      syncNetlistWithDispatcher();
    },

    removeComponent: (id: string) => {
      pushSnapshot();
      set((state) => {
        const { [id]: _, ...remainingComps } = state.components;
        const updatedNodes = state.nodes.filter((n) => n.id !== id);
        const updatedEdges = state.edges.filter((e) => e.source !== id && e.target !== id);
        return {
          components: remainingComps,
          nodes: updatedNodes,
          edges: updatedEdges,
          selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId,
        };
      });
      syncNetlistWithDispatcher();
    },

    selectedEdgeId: null,
    circuitError: null,
    setCircuitError: (err: CircuitDiagnosticError | null) => set({ circuitError: err }),

    selectComponent: (id: string | null) => {
      set({
        selectedComponentId: id,
        selectedEdgeId: null,
      });
    },

    selectEdge: (id: string | null) => {
      set({ selectedEdgeId: id, selectedComponentId: null });
    },

    removeEdge: (id: string) => {
      pushSnapshot();
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== id),
        selectedEdgeId: state.selectedEdgeId === id ? null : state.selectedEdgeId,
      }));
      syncNetlistWithDispatcher();
      logger.info('canvas', `Deleted wire connection (${id})`);
    },

    onNodesChange: (changes: any) => {
      set((state) => {
        let updatedNodes = [...state.nodes];
        for (const change of changes) {
          if (change.type === 'position' && change.position) {
            updatedNodes = updatedNodes.map((node) =>
              node.id === change.id ? { ...node, position: change.position } : node,
            );
          } else if (change.type === 'select') {
            updatedNodes = updatedNodes.map((node) =>
              node.id === change.id ? { ...node, selected: change.selected } : node,
            );
          } else if (change.type === 'remove') {
            get().removeComponent(change.id);
            return state;
          }
        }
        const newlySelected = changes.find((c: any) => c.type === 'select' && c.selected);
        const newlyDeselected = changes.find((c: any) => c.type === 'select' && !c.selected);
        return {
          nodes: updatedNodes,
          selectedComponentId: newlySelected ? newlySelected.id : (newlyDeselected && state.selectedComponentId === newlyDeselected.id ? null : state.selectedComponentId),
        };
      });
    },

    onEdgesChange: (changes: any) => {
      set((state) => {
        let updatedEdges = [...state.edges];
        for (const change of changes) {
          if (change.type === 'select') {
            updatedEdges = updatedEdges.map((e) =>
              e.id === change.id ? { ...e, selected: change.selected } : e,
            );
          } else if (change.type === 'remove') {
            pushSnapshot();
            updatedEdges = updatedEdges.filter((e) => e.id !== change.id);
          }
        }
        return { edges: updatedEdges };
      });
      syncNetlistWithDispatcher();
    },

    onConnect: (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      pushSnapshot();

      const edgeId = `edge_${connection.source}_${connection.sourceHandle || 'p'}__${connection.target}_${connection.targetHandle || 'n'}`;
      const newEdge: Edge = {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: 'circuitEdge',
        animated: true,
      };

      set((state) => ({
        edges: [...state.edges, newEdge],
      }));
      syncNetlistWithDispatcher();
    },

    startSimulation: () => {
      const { components, edges } = get();
      const netlist = computeNetlist(components, edges);
      const ercError = validateCircuitTopology(netlist);
      if (ercError) {
        set({ circuitError: ercError, simulationState: { ...get().simulationState, status: 'error' } });
        logger.error('solver', `Simulation BLOCKED: ${ercError.title} — ${ercError.message}`);
        return;
      }
      set({ circuitError: null });
      syncNetlistWithDispatcher();
      if (dispatcher) dispatcher.start();
      set((state) => ({ simulationState: { ...state.simulationState, status: 'running' } }));
    },
    pauseSimulation: () => {
      if (dispatcher) dispatcher.pause();
      set((state) => ({ simulationState: { ...state.simulationState, status: 'paused' } }));
    },
    stopSimulation: () => {
      if (dispatcher) dispatcher.stop();
      set((state) => ({ simulationState: { ...state.simulationState, status: 'stopped', currentTime: 0 } }));
    },
    resetSimulation: () => {
      if (dispatcher) dispatcher.reset();
      set((state) => ({ simulationState: { ...state.simulationState, status: 'stopped', currentTime: 0 } }));
    },
    setSpeedMultiplier: (speed: number) => {
      const { dispatcher: d, simulationState: s } = get();
      if (d) d.updateConfig({ speedMultiplier: speed });
      set({ simulationState: { ...s, config: { ...s.config, speedMultiplier: speed } } });
      logger.info('engine', `Simulation speed set to ${speed}x`);
    },
    setSimulationMode: (mode: SimulationMode) => {
      if (dispatcher) {
        dispatcher.updateConfig({ mode });
        if (mode === 'hil') {
          const { hilState } = get();
          dispatcher.connectHIL(hilState.serverUrl, hilState.deviceId || 'esp32_lab_01');
        } else {
          dispatcher.disconnectHIL();
        }
      }
      set((state) => ({
        simulationState: { ...state.simulationState, mode },
      }));
    },

    setPerformanceMode: (enabled: boolean) => {
      set({ performanceMode: enabled });
      if (dispatcher) {
        dispatcher.updateConfig({ performanceMode: enabled });
      }
      logger.info('engine', `Performance Mode ${enabled ? 'ACTIVATED (Low CPU / 6 Sub-steps / Minimal Graphics)' : 'DEACTIVATED (Full Visual Quality)'}`);
    },

    setShowOscilloscope: (show: boolean) => set({ showOscilloscope: show }),
    setShowLogicAnalyzer: (show: boolean) => set({ showLogicAnalyzer: show }),
    setShowSignalGenerator: (show: boolean) => set({ showSignalGenerator: show }),
    setShowMultimeter: (show: boolean) => set({ showMultimeter: show }),
    setShowHILBridge: (show: boolean) => set({ showHILBridge: show }),
    setShowInspector: (show: boolean) => set({ showInspector: show }),
    setShowPalette: (show: boolean) => set({ showPalette: show }),
    togglePalette: () => set((state) => ({ showPalette: !state.showPalette })),
    toggleInspector: () => set((state) => ({ showInspector: !state.showInspector })),
    setShowTruthTable: (show: boolean) => set({ showTruthTable: show }),
    showAICircuitModal: false,
    setShowAICircuitModal: (show: boolean) => set({ showAICircuitModal: show }),

    loadGeneratedCircuit: (spec: any, appendMode: boolean = false) => {
      pushSnapshot();
      const currentNodes = get().nodes;
      let offsetX = 100;
      let offsetY = 100;

      if (appendMode && currentNodes.length > 0) {
        const maxX = Math.max(...currentNodes.map((n) => n.position.x + (n.width || 150)));
        offsetX = maxX + 120;
      }

      const compiled = compileAICircuitToCanvas(spec, offsetX, offsetY);

      if (appendMode) {
        set((state) => ({
          nodes: [...state.nodes, ...compiled.nodes],
          edges: [...state.edges, ...compiled.edges],
          components: { ...state.components, ...compiled.components },
        }));
      } else {
        set({
          nodes: compiled.nodes,
          edges: compiled.edges,
          components: compiled.components,
          selectedComponentId: null,
        });
      }

      syncNetlistWithDispatcher();
      logger.success('engine', `AI Circuit loaded: "${compiled.title}" (${compiled.nodes.length} parts, ${compiled.edges.length} wires)`);
    },

    updateScopeSettings: (settings: Partial<OscilloscopeSettings>) =>
      set((state) => ({ scopeSettings: { ...state.scopeSettings, ...settings } })),
    updateLogicSettings: (settings: Partial<LogicAnalyzerSettings>) =>
      set((state) => ({ logicSettings: { ...state.logicSettings, ...settings } })),

    connectHIL: (url, deviceId) => {
      const u = url || get().hilState.serverUrl;
      const d = deviceId || get().hilState.deviceId || 'esp32_lab_01';
      if (dispatcher) {
        dispatcher.connectHIL(u, d);
      }
    },
    disconnectHIL: () => {
      if (dispatcher) {
        dispatcher.disconnectHIL();
      }
    },
    updateHILServerUrl: (url: string) => {
      try {
        localStorage.setItem('virtuallab_hil_server', url);
      } catch {}
      set((state) => ({
        hilState: { ...state.hilState, serverUrl: url },
      }));
      logger.info('hil', `Updated HIL Gateway URL preference: ${url}`);
    },
    injectHILIngress: (inputs: Record<string, number>) => {
      if (dispatcher) {
        dispatcher.injectHILIngress(inputs);
      }
    },

    clearCanvas: () => {
      pushSnapshot();
      if (dispatcher) dispatcher.stop();
      set({
        nodes: [],
        edges: [],
        components: {},
        selectedComponentId: null,
      });
      syncNetlistWithDispatcher();
      get().clearSessionCache();
      logger.info('canvas', 'Cleared entire circuit canvas');
    },

    exportNetlist: () => {
      const { components, nodes, edges } = get();
      // Ensure all node data is fresh and synchronized with components map
      const normalizedComponents: Record<string, ComponentInstance> = {};
      for (const [id, comp] of Object.entries(components)) {
        const meta = COMPONENT_REGISTRY[comp.kind];
        normalizedComponents[id] = {
          ...comp,
          params: {
            ...(meta?.defaultParams || {}),
            ...(comp.params || {}),
          },
        };
      }
      const syncNodes = nodes.map((node) => {
        const comp = normalizedComponents[node.id];
        return {
          ...node,
          data: {
            ...node.data,
            componentId: node.id,
            kind: comp ? comp.kind : (node.data as any)?.kind,
            label: comp ? comp.label : (node.data as any)?.label,
            params: comp ? { ...comp.params } : ((node.data as any)?.params || {}),
          },
        };
      });
      // Clear temporary browser session cache once explicitly saved/exported
      get().clearSessionCache();
      return JSON.stringify({ components: normalizedComponents, nodes: syncNodes, edges }, null, 2);
    },
    importNetlist: (json: string) => {
      try {
        pushSnapshot();
        const data = JSON.parse(json);
        if (data.components && (data.nodes || data.edges)) {
          const rawComponents: Record<string, ComponentInstance> = data.components;
          const normalizedComponents: Record<string, ComponentInstance> = {};

          for (const [id, comp] of Object.entries(rawComponents)) {
            const meta = COMPONENT_REGISTRY[comp.kind];
            normalizedComponents[id] = {
              ...comp,
              params: {
                ...(meta?.defaultParams || {}),
                ...(comp.params || {}),
              },
            };
          }

          const rawNodes: Node[] = data.nodes || [];
          const normalizedNodes: Node[] = rawNodes.map((node) => {
            const comp = normalizedComponents[node.id];
            const meta = comp ? COMPONENT_REGISTRY[comp.kind] : undefined;
            return {
              ...node,
              width: node.width || meta?.width || 150,
              height: node.height || meta?.height || 90,
              data: {
                ...node.data,
                componentId: node.id,
                kind: comp ? comp.kind : (node.data as any)?.kind,
                label: comp ? comp.label : (node.data as any)?.label,
                params: comp ? { ...comp.params } : ((node.data as any)?.params || {}),
              },
            };
          });

          set({
            components: normalizedComponents,
            nodes: normalizedNodes,
            edges: data.edges || [],
            selectedComponentId: null,
          });
          syncNetlistWithDispatcher();
          get().clearSessionCache();
          logger.success('canvas', `Imported netlist with ${Object.keys(normalizedComponents).length} parts and ${(data.edges || []).length} wires`);
        }
      } catch (err) {
        logger.error('canvas', 'Failed to import netlist JSON', err);
      }
    },

    // Session Auto-Save methods
    lastAutosavedTime: null,
    hasAutosavedSession: false,
    saveSessionCache: () => {
      scheduleAutosave();
    },
    clearSessionCache: () => {
      try {
        localStorage.removeItem(AUTOSAVE_CACHE_KEY);
      } catch (e) {
        // ignore
      }
      set({ hasAutosavedSession: false, lastAutosavedTime: null });
      logger.info('canvas', 'Autosaved session cache cleared');
    },
    restoreSessionFromCache: () => {
      try {
        const raw = localStorage.getItem(AUTOSAVE_CACHE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.components && data.nodes && data.edges && Object.keys(data.components).length > 0) {
          const rawComponents: Record<string, ComponentInstance> = data.components;
          const normalizedComponents: Record<string, ComponentInstance> = {};

          for (const [id, comp] of Object.entries(rawComponents)) {
            const meta = COMPONENT_REGISTRY[comp.kind];
            normalizedComponents[id] = {
              ...comp,
              params: {
                ...(meta?.defaultParams || {}),
                ...(comp.params || {}),
              },
            };
          }

          const normalizedNodes = (data.nodes as Node[]).map((node) => {
            const comp = normalizedComponents[node.id];
            const meta = comp ? COMPONENT_REGISTRY[comp.kind] : undefined;
            return {
              ...node,
              width: node.width || meta?.width || 150,
              height: node.height || meta?.height || 90,
              data: {
                ...node.data,
                componentId: node.id,
                kind: comp ? comp.kind : (node.data as any)?.kind,
                label: comp ? comp.label : (node.data as any)?.label,
                params: comp ? { ...comp.params } : ((node.data as any)?.params || {}),
              },
            };
          });

          set({
            components: normalizedComponents,
            nodes: normalizedNodes,
            edges: data.edges,
            scopeSettings: data.scopeSettings ? { ...get().scopeSettings, ...data.scopeSettings } : get().scopeSettings,
            selectedComponentId: null,
            hasAutosavedSession: true,
            lastAutosavedTime: data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null,
          });
          syncNetlistWithDispatcher();
          logger.info('canvas', `Restored session from browser cache (${Object.keys(normalizedComponents).length} components, ${data.edges.length} wires)`);
          return true;
        }
      } catch (err) {
        console.error('Failed to restore session cache', err);
      }
      return false;
    },

    loadPreset: (presetName: string) => {
      pushSnapshot();
      if (presetName === 'default_empty') {
        get().clearCanvas();
        get().addComponent('ground', { x: 500, y: 400 });
        logger.info('canvas', 'Initialized blank canvas with Ground reference');
        return;
      }

      const preset = PRESET_CIRCUITS[presetName];
      if (preset) {
        get().clearCanvas();
        const rawComponents = preset.data.components;
        const normalizedComponents: Record<string, ComponentInstance> = {};
        for (const [id, comp] of Object.entries(rawComponents)) {
          const meta = COMPONENT_REGISTRY[comp.kind];
          normalizedComponents[id] = {
            ...comp,
            params: {
              ...(meta?.defaultParams || {}),
              ...(comp.params || {}),
            },
          };
        }

        const normalizedNodes = preset.data.nodes.map((node) => {
          const comp = normalizedComponents[node.id];
          const meta = comp ? COMPONENT_REGISTRY[comp.kind] : undefined;
          return {
            ...node,
            data: {
              componentId: node.id,
              kind: comp?.kind || (node.data as any)?.kind,
              label: comp?.label || meta?.name || 'Component',
              params: comp?.params || {},
            },
          };
        });

        set({
          components: normalizedComponents,
          nodes: normalizedNodes,
          edges: preset.data.edges || [],
          selectedComponentId: null,
        });
        syncNetlistWithDispatcher();
        logger.success('netlist', `Loaded preset "${preset.name}" (${Object.keys(normalizedComponents).length} parts, ${preset.data.edges.length} wires)`);
        return;
      }

      logger.warn('netlist', `Unknown preset requested: ${presetName}`);
    },
  };
});
