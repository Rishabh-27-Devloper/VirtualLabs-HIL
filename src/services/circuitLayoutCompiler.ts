// ============================================================
// VirtualLab-HIL — AI Circuit Layout & Topology Compiler
// Converts compact AI Circuit DSL into React Flow Nodes and Edges
// ============================================================

import type { Node, Edge } from '@xyflow/react';
import type { ComponentInstance, ComponentKind, ComponentParams } from '@/types/circuit';
import { COMPONENT_REGISTRY, getComponentPins } from '@/components/canvas/componentDefs';

export interface AICircuitComponentSpec {
  id: string;
  kind: string;
  label?: string;
  params?: Record<string, any>;
}

export interface AICircuitConnectionSpec {
  from: string; // e.g. "clk:out" or "ff0:Q"
  to: string;   // e.g. "ff0:CLK" or "out0:in"
}

export interface AICircuitSpec {
  title: string;
  description?: string;
  components: AICircuitComponentSpec[];
  connections: AICircuitConnectionSpec[];
}

export interface CompiledCircuitResult {
  nodes: Node[];
  edges: Edge[];
  components: Record<string, ComponentInstance>;
  title: string;
  description: string;
}

/**
 * Intelligently resolves any raw pin name/alias from AI output to the exact handle ID of the component.
 */
export function resolvePinHandle(
  rawPin: string | undefined,
  kind: ComponentKind,
  validPins: Array<{ id: string; label?: string; kind?: string }>,
  direction: 'source' | 'target' = 'source',
): string {
  if (!validPins || validPins.length === 0) return 'p';
  if (!rawPin) {
    if (direction === 'source') {
      return (
        validPins.find((p) => p.kind?.includes('out') || p.id === 'out' || p.id === 'Q' || p.id === 'p')?.id ||
        validPins[0].id
      );
    } else {
      return (
        validPins.find((p) => p.kind?.includes('in') || p.id === 'in' || p.id === 'D' || p.id === 'p' || p.id === 'base' || p.id === 'gate')?.id ||
        validPins[0].id
      );
    }
  }

  const clean = rawPin.trim();
  const cleanLower = clean.toLowerCase();

  // 1. Exact ID match (case-insensitive)
  const exactId = validPins.find((p) => p.id.toLowerCase() === cleanLower);
  if (exactId) return exactId.id;

  // 2. Exact Label match (case-insensitive)
  const exactLabel = validPins.find((p) => p.label && p.label.toLowerCase() === cleanLower);
  if (exactLabel) return exactLabel.id;

  // 3. Component-Specific Semantic Aliases
  if (kind === 'bjt_npn' || kind === 'bjt_pnp') {
    if (['b', 'base', 'bjt_b', 'in'].includes(cleanLower)) return 'base';
    if (['c', 'collector', 'bjt_c', 'out', 'v+'].includes(cleanLower)) return 'collector';
    if (['e', 'emitter', 'bjt_e', 'gnd'].includes(cleanLower)) return 'emitter';
  }

  if (kind.startsWith('mosfet_')) {
    if (['g', 'gate', 'mos_g', 'in'].includes(cleanLower)) return 'gate';
    if (['d', 'drain', 'mos_d', 'out', 'v+'].includes(cleanLower)) return 'drain';
    if (['s', 'source', 'mos_s', 'gnd'].includes(cleanLower)) return 'source';
  }

  if (kind === 'opamp') {
    if (['inp', 'in+', '+', 'pos', 'non_inv', 'noninverting', 'in_p', 'pos_in'].includes(cleanLower)) return 'inp';
    if (['inn', 'in-', '-', 'neg', 'inv', 'inverting', 'in_n', 'neg_in'].includes(cleanLower)) return 'inn';
    if (['out', 'y', 'output', 'vout'].includes(cleanLower)) return 'out';
    if (['vcc', 'v+', 'pos_rail', 'power', 'vpos'].includes(cleanLower)) return 'vcc';
    if (['vee', 'v-', 'neg_rail', 'vneg', 'gnd'].includes(cleanLower)) return 'vee';
  }

  if (kind === 'ic555') {
    if (['1', 'gnd', 'ground'].includes(cleanLower)) return 'gnd';
    if (['2', 'trig', 'trg', 'trigger'].includes(cleanLower)) return 'trig';
    if (['3', 'out', 'output'].includes(cleanLower)) return 'out';
    if (['4', 'rst', 'reset'].includes(cleanLower)) return 'rst';
    if (['5', 'ctrl', 'cv', 'control'].includes(cleanLower)) return 'ctrl';
    if (['6', 'thres', 'thr', 'threshold'].includes(cleanLower)) return 'thres';
    if (['7', 'disch', 'dis', 'discharge'].includes(cleanLower)) return 'disch';
    if (['8', 'vcc', 'power', 'v+'].includes(cleanLower)) return 'vcc';
  }

  if (kind.startsWith('gate_')) {
    if (['a', 'in1', '1', 'in_a', 'input_a', 'in'].includes(cleanLower)) {
      return validPins.find((p) => p.id === 'A' || p.id === 'in1')?.id || validPins[0].id;
    }
    if (['b', 'in2', '2', 'in_b', 'input_b'].includes(cleanLower)) {
      return validPins.find((p) => p.id === 'B' || p.id === 'in2')?.id || validPins[1]?.id || validPins[0].id;
    }
    if (['c', 'in3', '3'].includes(cleanLower)) {
      return validPins.find((p) => p.id === 'in3')?.id || validPins[0].id;
    }
    if (['d', 'in4', '4'].includes(cleanLower)) {
      return validPins.find((p) => p.id === 'in4')?.id || validPins[0].id;
    }
    if (['out', 'y', 'output', 'q'].includes(cleanLower)) {
      return validPins.find((p) => p.id === 'out' || p.id === 'Y')?.id || 'out';
    }
  }

  if (kind.startsWith('ff_') || kind.startsWith('latch_')) {
    if (['clk', 'clock', 'ck'].includes(cleanLower)) return 'CLK';
    if (['d', 'data', 'in'].includes(cleanLower)) return 'D';
    if (['t', 'toggle'].includes(cleanLower)) return 'T';
    if (['j'].includes(cleanLower)) return 'J';
    if (['k'].includes(cleanLower)) return 'K';
    if (['s', 'set'].includes(cleanLower)) return 'S';
    if (['r', 'reset'].includes(cleanLower)) return 'R';
    if (['clr', 'clear', 'rst'].includes(cleanLower)) return 'CLR';
    if (['set', 'preset', 'pre'].includes(cleanLower)) return 'SET';
    if (['en', 'enable'].includes(cleanLower)) return 'EN';
    if (['q', 'out', 'output'].includes(cleanLower)) return 'Q';
    if (['qbar', 'qb', 'q_bar', 'not_q', '!q', 'q_inv', 'q̄'].includes(cleanLower)) return 'Qbar';
  }

  if (kind === 'ground') {
    return 'p';
  }

  // 4. General 2-terminal passives & instruments & rails
  // Positive / Anode / Input / V+ / Signal / Terminal 1
  if (['1', 'p', '+', 'pos', 'positive', 'a', 'anode', 'v+', 'sig', 'signal', 'in', 'probe', 'vcc'].includes(cleanLower)) {
    const pPin = validPins.find((p) => p.id === 'p' || p.id === 'vcc' || p.id === 'out' || p.id === 'in');
    if (pPin) return pPin.id;
  }

  // Negative / Cathode / Ground / V- / Terminal 2
  if (['2', 'n', '-', 'neg', 'negative', 'k', 'cathode', 'gnd', 'ground', 'com', 'common', 'out', 'vee'].includes(cleanLower)) {
    const nPin = validPins.find((p) => p.id === 'n' || p.id === 'vee' || p.id === 'gnd');
    if (nPin) return nPin.id;
  }

  // Fallback to first available matching pin
  return validPins[0]?.id || 'p';
}

/**
 * Topologically arranges components into clean non-overlapping columns and rows,
 * routes connections, and produces full VirtualLab canvas nodes & edges.
 */
export function compileAICircuitToCanvas(
  spec: AICircuitSpec,
  offsetX: number = 100,
  offsetY: number = 100,
): CompiledCircuitResult {
  const componentsRecord: Record<string, ComponentInstance> = {};
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const rawComps = spec.components || [];
  const rawConns = spec.connections || [];

  // 1. Build Adjacency Graph for Topological Column Placement
  const inDegree: Record<string, number> = {};
  const outgoing: Record<string, string[]> = {};
  const compMap: Record<string, AICircuitComponentSpec> = {};

  rawComps.forEach((c) => {
    compMap[c.id] = c;
    inDegree[c.id] = 0;
    outgoing[c.id] = [];
  });

  rawConns.forEach((conn) => {
    const srcComp = conn.from.split(':')[0]?.trim();
    const tgtComp = conn.to.split(':')[0]?.trim();
    if (srcComp && tgtComp && compMap[srcComp] && compMap[tgtComp]) {
      outgoing[srcComp].push(tgtComp);
      inDegree[tgtComp] = (inDegree[tgtComp] || 0) + 1;
    }
  });

  // 2. Assign Functional Role & Tier Scores
  const tiers: Record<string, number> = {};

  // Default tier by component category / kind
  rawComps.forEach((c) => {
    const kind = c.kind as string;
    if (kind === 'ground') {
      tiers[c.id] = 99; // Placed at the bottom
    } else if (
      kind === 'clock_source' ||
      kind === 'digital_input' ||
      kind === 'dc_voltage' ||
      kind === 'ac_voltage' ||
      kind === 'current_source' ||
      kind === 'dc_current' ||
      kind === 'signal_generator' ||
      kind === 'rail_vcc' ||
      kind === 'rail_vee'
    ) {
      tiers[c.id] = 0; // Inputs / Sources in Column 0
    } else if (
      kind === 'digital_output' ||
      kind === 'led' ||
      kind === 'voltmeter' ||
      kind === 'ammeter' ||
      kind === 'multimeter' ||
      kind === 'oscilloscope'
    ) {
      tiers[c.id] = 10; // Outputs / Probes in Rightmost Column
    } else {
      tiers[c.id] = 1; // Default middle processing
    }
  });

  // Topological forward propagation of tiers
  const queue: string[] = Object.keys(inDegree).filter((id) => inDegree[id] === 0);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currTier = tiers[curr] ?? 0;
    if (currTier === 99) continue; // Skip ground

    for (const next of outgoing[curr] || []) {
      if (tiers[next] !== 99 && tiers[next] !== 10) {
        tiers[next] = Math.max(tiers[next] || 0, currTier + 1);
      }
      inDegree[next]--;
      if (inDegree[next] === 0) {
        queue.push(next);
      }
    }
  }

  // Group components by tier columns
  const columns: Record<number, string[]> = {};
  const groundIds: string[] = [];

  rawComps.forEach((c) => {
    if (c.kind === 'ground') {
      groundIds.push(c.id);
      return;
    }
    const t = tiers[c.id] ?? 1;
    if (!columns[t]) columns[t] = [];
    columns[t].push(c.id);
  });

  // Normalize column indices: 0, 1, 2, ...
  const sortedColKeys = Object.keys(columns)
    .map(Number)
    .sort((a, b) => a - b);

  const colWidth = 220;
  const rowHeight = 140;

  // 3. Place Regular Components in Grid Columns
  sortedColKeys.forEach((colKey, colIdx) => {
    const compIds = columns[colKey];
    compIds.forEach((compId, rowIdx) => {
      const c = compMap[compId];
      const kind = (COMPONENT_REGISTRY[c.kind as ComponentKind] ? c.kind : 'resistor') as ComponentKind;
      const meta = COMPONENT_REGISTRY[kind] || COMPONENT_REGISTRY.resistor;

      const posX = Math.round((offsetX + colIdx * colWidth) / 20) * 20;
      const posY = Math.round((offsetY + rowIdx * rowHeight) / 20) * 20;

      const fullParams: ComponentParams = {
        ...(meta.defaultParams || {}),
        ...(c.params || {}),
      };

      const compInstance: ComponentInstance = {
        id: c.id,
        kind,
        label: c.label || meta.name,
        params: fullParams,
      };

      componentsRecord[c.id] = compInstance;

      nodes.push({
        id: c.id,
        type: 'customComponent',
        position: { x: posX, y: posY },
        data: {
          kind,
          label: c.label || meta.name,
          params: fullParams,
        },
      });
    });
  });

  // 4. Place Ground References along the bottom
  const maxColCount = Math.max(1, sortedColKeys.length);
  const maxRowCount = Math.max(...sortedColKeys.map((k) => columns[k]?.length || 1), 1);
  const bottomY = offsetY + maxRowCount * rowHeight + 20;

  groundIds.forEach((gndId, idx) => {
    const c = compMap[gndId];
    const kind: ComponentKind = 'ground';
    const meta = COMPONENT_REGISTRY.ground;
    const posX = Math.round((offsetX + (idx * colWidth)) / 20) * 20;
    const posY = Math.round(bottomY / 20) * 20;

    const fullParams: ComponentParams = { ...(meta.defaultParams || {}), ...(c.params || {}) };
    const compInstance: ComponentInstance = {
      id: c.id,
      kind,
      label: c.label || meta.name,
      params: fullParams,
    };

    componentsRecord[c.id] = compInstance;

    nodes.push({
      id: c.id,
      type: 'customComponent',
      position: { x: posX, y: posY },
      data: {
        kind,
        label: c.label || meta.name,
        params: fullParams,
      },
    });
  });

  // 5. Synthesize React Flow Edges and Validate Pin Handles
  const edgeSet = new Set<string>();

  rawConns.forEach((conn, idx) => {
    const fromParts = conn.from.split(':');
    const toParts = conn.to.split(':');

    const srcId = fromParts[0]?.trim();
    const rawSrcPin = fromParts[1]?.trim();
    const tgtId = toParts[0]?.trim();
    const rawTgtPin = toParts[1]?.trim();

    if (!srcId || !tgtId || !componentsRecord[srcId] || !componentsRecord[tgtId]) {
      return; // Skip invalid reference
    }

    const srcComp = componentsRecord[srcId];
    const tgtComp = componentsRecord[tgtId];
    const srcPins = getComponentPins(srcComp.kind, srcComp.params);
    const tgtPins = getComponentPins(tgtComp.kind, tgtComp.params);

    // Intelligently map aliases to exact handle IDs
    const srcPin = resolvePinHandle(rawSrcPin, srcComp.kind, srcPins, 'source');
    const tgtPin = resolvePinHandle(rawTgtPin, tgtComp.kind, tgtPins, 'target');

    const edgeKey = `${srcId}:${srcPin}->${tgtId}:${tgtPin}`;
    if (edgeSet.has(edgeKey)) return; // Prevent duplicate wires
    edgeSet.add(edgeKey);

    const edgeId = `edge_${srcId}_${srcPin}_${tgtId}_${tgtPin}_${Date.now()}_${idx}`;
    const netNodeId = `net_${srcId}:${srcPin}`;

    edges.push({
      id: edgeId,
      source: srcId,
      sourceHandle: srcPin,
      target: tgtId,
      targetHandle: tgtPin,
      type: 'circuitEdge',
      animated: true,
      data: {
        netNodeId,
      },
    });
  });

  return {
    nodes,
    edges,
    components: componentsRecord,
    title: spec.title || 'AI Generated Circuit',
    description: spec.description || 'Synthesized automatically by Gemini AI',
  };
}
