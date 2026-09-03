// ============================================================
// VirtualLab-HIL — Characteristic Curve & Parameter Sweeper Engine
// ============================================================

import type { Netlist, ComponentInstance, ComponentSimState, CurveSeries, SimulationConfig } from '@/types/circuit';
import { solveMNA, getPinNetId } from '@/engine/mnaSolver';
import { COMPONENT_REGISTRY } from '@/components/canvas/componentDefs';

export interface CircuitVariable {
  id: string;
  label: string;
  unit: string;
  category: 'source' | 'voltage' | 'current' | 'node';
  componentId?: string;
  paramKey?: string;
}

export interface SweepOptions {
  sweepComponentId: string;
  sweepParam: 'voltage' | 'amplitude' | 'frequency' | 'current' | 'resistance';
  sweepStart: number;
  sweepStop: number;
  sweepSteps: number;
  sweepScale: 'linear' | 'logarithmic';
  secondaryComponentId?: string;
  secondaryParam?: string;
  secondaryValues?: number[];
  xVariableId: string;
  yVariableId: string;
  customFormula?: string;
}

export function extractCircuitVariables(netlist: Netlist): CircuitVariable[] {
  const vars: CircuitVariable[] = [];
  const comps = netlist.components;

  Object.values(comps).forEach((c) => {
    const label = c.label || c.id;

    if (c.kind === 'dc_voltage') {
      vars.push({
        id: c.id + ':voltage',
        label: label + ' Voltage (V)',
        unit: 'V',
        category: 'source',
        componentId: c.id,
        paramKey: 'voltage',
      });
    } else if (c.kind === 'ac_voltage' || c.kind === 'signal_generator') {
      vars.push({
        id: c.id + ':amplitude',
        label: label + ' Amplitude (V)',
        unit: 'V',
        category: 'source',
        componentId: c.id,
        paramKey: 'amplitude',
      });
      vars.push({
        id: c.id + ':frequency',
        label: label + ' Frequency (Hz)',
        unit: 'Hz',
        category: 'source',
        componentId: c.id,
        paramKey: 'frequency',
      });
    } else if (c.kind === 'current_source') {
      vars.push({
        id: c.id + ':current',
        label: label + ' Current (A)',
        unit: 'A',
        category: 'source',
        componentId: c.id,
        paramKey: 'current',
      });
    } else if (c.kind === 'resistor') {
      vars.push({
        id: c.id + ':resistance',
        label: label + ' Resistance (Ohms)',
        unit: 'Ohms',
        category: 'source',
        componentId: c.id,
        paramKey: 'resistance',
      });
      vars.push({
        id: c.id + ':v_drop',
        label: label + ' Voltage Drop (V_R)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      vars.push({
        id: c.id + ':current',
        label: label + ' Current (I_R)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind === 'diode' || c.kind === 'zener' || c.kind === 'led') {
      vars.push({
        id: c.id + ':v_drop',
        label: label + ' Forward Voltage (V_D)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      vars.push({
        id: c.id + ':current',
        label: label + ' Diode Current (I_D)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind === 'bjt_npn' || c.kind === 'bjt_pnp') {
      vars.push({
        id: c.id + ':vce',
        label: label + ' V_CE (Collector-Emitter)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      vars.push({
        id: c.id + ':vbe',
        label: label + ' V_BE (Base-Emitter)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      vars.push({
        id: c.id + ':ic',
        label: label + ' Collector Current (I_C)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
      vars.push({
        id: c.id + ':ib',
        label: label + ' Base Current (I_B)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind.startsWith('mosfet_')) {
      vars.push({
        id: c.id + ':vds',
        label: label + ' V_DS (Drain-Source)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      vars.push({
        id: c.id + ':vgs',
        label: label + ' V_GS (Gate-Source)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      vars.push({
        id: c.id + ':id',
        label: label + ' Drain Current (I_D)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind === 'opamp') {
      vars.push({
        id: c.id + ':vout',
        label: label + ' Output Voltage (V_out)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
    }
  });

  if (netlist.netNodes) {
    Object.keys(netlist.netNodes).forEach((netId) => {
      vars.push({
        id: 'node:' + netId,
        label: 'Node Potential [' + netId + ']',
        unit: 'V',
        category: 'node',
      });
    });
  }

  return vars;
}

function resolveVariableValue(
  varId: string,
  compStates: Record<string, ComponentSimState>,
  comps: Record<string, ComponentInstance>
): number {
  if (varId.startsWith('node:')) {
    for (const state of Object.values(compStates)) {
      if (state && state.nodeVoltages) {
        for (const v of Object.values(state.nodeVoltages)) {
          return v;
        }
      }
    }
    return 0;
  }

  const parts = varId.split(':');
  const compId = parts[0];
  const metric = parts[1];
  const comp = comps[compId];
  const state = compStates[compId];
  if (!comp) return 0;

  switch (metric) {
    case 'voltage':
      return comp.params.voltage ?? 0;
    case 'amplitude':
      return comp.params.amplitude ?? 0;
    case 'frequency':
      return comp.params.frequency ?? 1000;
    case 'current':
      if (comp.kind === 'current_source') return comp.params.current ?? 0;
      if (state && state.branchCurrents && state.branchCurrents['p'] !== undefined) return Math.abs(state.branchCurrents['p']);
      if (comp.kind === 'resistor' && comp.params.resistance) {
        const vDiff = (state && state.nodeVoltages ? state.nodeVoltages['p'] ?? 0 : 0) - (state && state.nodeVoltages ? state.nodeVoltages['n'] ?? 0 : 0);
        return vDiff / comp.params.resistance;
      }
      return 0;
    case 'resistance':
      return comp.params.resistance ?? 1000;
    case 'v_drop': {
      const vp = state && state.nodeVoltages ? state.nodeVoltages['p'] ?? 0 : 0;
      const vn = state && state.nodeVoltages ? state.nodeVoltages['n'] ?? 0 : 0;
      return vp - vn;
    }
    case 'vce': {
      const vc = state && state.nodeVoltages ? state.nodeVoltages['c'] ?? 0 : 0;
      const ve = state && state.nodeVoltages ? state.nodeVoltages['e'] ?? 0 : 0;
      return vc - ve;
    }
    case 'vbe': {
      const vb = state && state.nodeVoltages ? state.nodeVoltages['b'] ?? 0 : 0;
      const ve = state && state.nodeVoltages ? state.nodeVoltages['e'] ?? 0 : 0;
      return vb - ve;
    }
    case 'ic':
      return state && state.branchCurrents ? state.branchCurrents['c'] ?? 0 : 0;
    case 'ib':
      return state && state.branchCurrents ? state.branchCurrents['b'] ?? 0 : 0;
    case 'vds': {
      const vd = state && state.nodeVoltages ? state.nodeVoltages['d'] ?? 0 : 0;
      const vs = state && state.nodeVoltages ? state.nodeVoltages['s'] ?? 0 : 0;
      return vd - vs;
    }
    case 'vgs': {
      const vg = state && state.nodeVoltages ? state.nodeVoltages['g'] ?? 0 : 0;
      const vs = state && state.nodeVoltages ? state.nodeVoltages['s'] ?? 0 : 0;
      return vg - vs;
    }
    case 'id':
      return state && state.branchCurrents ? state.branchCurrents['d'] ?? 0 : 0;
    case 'vout':
      return state && state.nodeVoltages ? state.nodeVoltages['out'] ?? 0 : 0;
    default:
      return 0;
  }
}

export function computeStatesFromMna(
  netlist: Netlist,
  mnaSolution: { x: number[]; nodeIndex: Record<string, number> } | null
): Record<string, ComponentSimState> {
  const result: Record<string, ComponentSimState> = {};
  if (!mnaSolution) return result;
  const { x, nodeIndex } = mnaSolution;

  for (const comp of Object.values(netlist.components)) {
    const meta = COMPONENT_REGISTRY[comp.kind];
    const nodeVoltages: Record<string, number> = {};
    if (meta) {
      for (const pin of meta.pins) {
        const netId = getPinNetId(netlist.wires, comp.id, pin.id);
        if (netId) {
          const idx = nodeIndex[netId];
          nodeVoltages[pin.id] = idx !== undefined && idx > 0 ? (x[idx - 1] ?? 0) : 0;
        } else {
          nodeVoltages[pin.id] = 0;
        }
      }
    }
    const branchCurrents: Record<string, number> = {};
    if (comp.kind === 'resistor' && comp.params.resistance) {
      const vDiff = (nodeVoltages['p'] ?? 0) - (nodeVoltages['n'] ?? 0);
      branchCurrents['p'] = vDiff / comp.params.resistance;
      branchCurrents['n'] = -branchCurrents['p'];
    } else if (comp.kind === 'diode' || comp.kind === 'zener' || comp.kind === 'led') {
      const vDiff = (nodeVoltages['p'] ?? 0) - (nodeVoltages['n'] ?? 0);
      const Is = comp.params.saturationCurrent ?? 1e-12;
      const Vt = 0.026;
      const id = Is * (Math.exp(Math.min(vDiff / Vt, 30)) - 1);
      branchCurrents['p'] = id;
      branchCurrents['n'] = -id;
    } else if (comp.kind === 'bjt_npn' || comp.kind === 'bjt_pnp') {
      const vb = nodeVoltages['b'] ?? 0;
      const ve = nodeVoltages['e'] ?? 0;
      const vc = nodeVoltages['c'] ?? 0;
      const vbe = vb - ve;
      const vce = vc - ve;
      const beta = comp.params.beta ?? 100;
      const is = comp.params.saturationCurrent ?? 1e-14;
      const vt = 0.026;
      const ib = (is / beta) * (Math.exp(Math.min(vbe / vt, 30)) - 1);
      const ic = Math.max(0, beta * ib * (1 + Math.max(0, vce) / (comp.params.earlyVoltage ?? 100)));
      branchCurrents['b'] = ib;
      branchCurrents['c'] = ic;
      branchCurrents['e'] = -(ib + ic);
    } else if (comp.kind.startsWith('mosfet_')) {
      const vg = nodeVoltages['g'] ?? 0;
      const vs = nodeVoltages['s'] ?? 0;
      const vd = nodeVoltages['d'] ?? 0;
      const vgs = vg - vs;
      const vds = vd - vs;
      const vth = comp.params.vth ?? 2.0;
      const kn = comp.params.kn ?? 0.002;
      const vgs_eff = vgs - vth;
      let id = 0;
      if (vgs_eff > 0) {
        if (vds >= vgs_eff) {
          id = (kn / 2) * vgs_eff * vgs_eff * (1 + (comp.params.lambda ?? 0.02) * vds);
        } else {
          id = kn * (vgs_eff * vds - 0.5 * vds * vds);
        }
      }
      branchCurrents['d'] = id;
      branchCurrents['s'] = -id;
      branchCurrents['g'] = 0;
    }

    result[comp.id] = { nodeVoltages, branchCurrents };
  }
  return result;
}

export function evaluateFormula(
  formula: string,
  variables: Record<string, number>
): number {
  try {
    const keys = Object.keys(variables);
    const vals = Object.values(variables);

    const mathScope = {
      log10: (x: number) => (x <= 0 ? -100 : Math.log10(x)),
      log: (x: number) => (x <= 0 ? -100 : Math.log(x)),
      abs: Math.abs,
      sqrt: (x: number) => (x < 0 ? 0 : Math.sqrt(x)),
      sin: Math.sin,
      cos: Math.cos,
      exp: (x: number) => Math.exp(Math.min(x, 50)),
      pow: Math.pow,
    };

    const func = new Function(...keys, ...Object.keys(mathScope), 'try { const res = (' + formula + '); if (!isFinite(res) || isNaN(res)) return 0; return Math.max(-1e9, Math.min(1e9, res)); } catch (e) { return 0; }');
    return func(...vals, ...Object.values(mathScope));
  } catch (e) {
    return 0;
  }
}

export function runParameterSweepAsync(
  baseNetlist: Netlist,
  options: SweepOptions,
  onProgress: (percent: number, currentPoints: number) => void,
  onComplete: (series: CurveSeries[]) => void,
  abortSignal?: AbortSignal
) {
  const steps = Math.max(10, Math.min(options.sweepSteps, 500));
  const start = options.sweepStart;
  const stop = options.sweepStop;
  const isLog = options.sweepScale === 'logarithmic' && start > 0 && stop > 0;

  const sweepValues: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    if (isLog) {
      const logVal = Math.log10(start) + frac * (Math.log10(stop) - Math.log10(start));
      sweepValues.push(Math.pow(10, logVal));
    } else {
      sweepValues.push(start + frac * (stop - start));
    }
  }

  const secondaryVals = options.secondaryValues && options.secondaryValues.length > 0
    ? options.secondaryValues
    : [0];

  const seriesList: CurveSeries[] = secondaryVals.map((secVal, sIdx) => {
    const colors = ['#22d3ee', '#f59e0b', '#34d399', '#a855f7', '#ec4899', '#3b82f6'];
    let name = 'Characteristic Curve';
    if (options.secondaryParam) {
      if (secVal >= 1e-3) {
        name = options.secondaryParam + ' = ' + (secVal * 1e3).toFixed(1) + 'mA';
      } else if (secVal >= 1e-6) {
        name = options.secondaryParam + ' = ' + (secVal * 1e6).toFixed(1) + 'uA';
      } else {
        name = options.secondaryParam + ' = ' + secVal;
      }
    }
    return {
      id: 'series_' + sIdx,
      name,
      color: colors[sIdx % colors.length],
      points: [],
      secondaryVal: secVal,
    };
  });

  let secIdx = 0;
  let sweepIdx = 0;
  const totalPoints = secondaryVals.length * sweepValues.length;
  let pointsProcessed = 0;

  function stepChunk() {
    if (abortSignal && abortSignal.aborted) return;

    const CHUNK_SIZE = 10;
    const chunkEnd = Math.min(pointsProcessed + CHUNK_SIZE, totalPoints);

    while (pointsProcessed < chunkEnd) {
      if (abortSignal && abortSignal.aborted) return;

      const currentSec = secondaryVals[secIdx];
      const currentSweepVal = sweepValues[sweepIdx];

      const clonedComps: Record<string, ComponentInstance> = {};
      Object.entries(baseNetlist.components).forEach(([k, c]) => {
        clonedComps[k] = {
          ...c,
          params: { ...c.params },
        };
      });

      if (clonedComps[options.sweepComponentId]) {
        clonedComps[options.sweepComponentId].params = {
          ...clonedComps[options.sweepComponentId].params,
          [options.sweepParam]: currentSweepVal,
        };
      }

      if (options.secondaryComponentId && options.secondaryParam && clonedComps[options.secondaryComponentId]) {
        clonedComps[options.secondaryComponentId].params = {
          ...clonedComps[options.secondaryComponentId].params,
          [options.secondaryParam]: currentSec,
        };
      }

      const testNetlist: Netlist = {
        components: clonedComps,
        wires: baseNetlist.wires,
        netNodes: baseNetlist.netNodes,
      };

      const simConfig: SimulationConfig = {
        mode: 'virtual',
        timeStep: 0.001,
        subSteps: 1,
        speedMultiplier: 1,
        maxIterations: 100,
        tolerance: 1e-5,
        vil: 0.8,
        vih: 2.0,
        vol: 0.2,
        voh: 4.8,
      };
      const mnaResult = solveMNA(testNetlist, simConfig, 0.001, null, 0, {}, {});
      const compStates = computeStatesFromMna(testNetlist, mnaResult);
      const xVal = resolveVariableValue(options.xVariableId, compStates, clonedComps);
      let yVal = 0;

      if (options.customFormula) {
        yVal = evaluateFormula(options.customFormula, {
          x: xVal,
          xVal: xVal,
          v: xVal,
          rawY: resolveVariableValue(options.yVariableId, compStates, clonedComps),
        });
      } else {
        yVal = resolveVariableValue(options.yVariableId, compStates, clonedComps);
      }

      const safeX = isNaN(xVal) || !isFinite(xVal) ? currentSweepVal : xVal;
      const safeY = isNaN(yVal) || !isFinite(yVal) ? 0 : Math.max(-1e9, Math.min(1e9, yVal));

      seriesList[secIdx].points.push({ x: safeX, y: safeY });

      sweepIdx++;
      if (sweepIdx >= sweepValues.length) {
        sweepIdx = 0;
        secIdx++;
      }
      pointsProcessed++;
    }

    const percent = Math.round((pointsProcessed / totalPoints) * 100);
    onProgress(percent, pointsProcessed);

    if (pointsProcessed < totalPoints) {
      requestAnimationFrame(stepChunk);
    } else {
      onComplete(seriesList);
    }
  }

  requestAnimationFrame(stepChunk);
}
