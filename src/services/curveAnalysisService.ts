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
  isMarked?: boolean;
  markerLabel?: string;
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
    const rawLabel = c.label || c.id;
    const marker = c.params?.analogMarker;

    const addVar = (metric: string, v: Omit<CircuitVariable, 'id'>) => {
      const isMarked = marker && marker.variableKey === metric;
      const displayLabel = isMarked
        ? `📈 [${marker.label}] ${v.label}`
        : v.label;
      vars.push({
        ...v,
        id: c.id + ':' + metric,
        label: displayLabel,
        isMarked: Boolean(isMarked),
        markerLabel: isMarked ? marker.label : undefined,
      });
    };

    if (c.kind === 'dc_voltage') {
      addVar('voltage', {
        label: rawLabel + ' Voltage (V)',
        unit: 'V',
        category: 'source',
        componentId: c.id,
        paramKey: 'voltage',
      });
    } else if (c.kind === 'ac_voltage' || c.kind === 'signal_generator') {
      addVar('amplitude', {
        label: rawLabel + ' Amplitude (V)',
        unit: 'V',
        category: 'source',
        componentId: c.id,
        paramKey: 'amplitude',
      });
      addVar('frequency', {
        label: rawLabel + ' Frequency (Hz)',
        unit: 'Hz',
        category: 'source',
        componentId: c.id,
        paramKey: 'frequency',
      });
    } else if (c.kind === 'current_source') {
      addVar('current', {
        label: rawLabel + ' Current (A)',
        unit: 'A',
        category: 'source',
        componentId: c.id,
        paramKey: 'current',
      });
    } else if (c.kind === 'resistor') {
      addVar('resistance', {
        label: rawLabel + ' Resistance (Ohms)',
        unit: 'Ohms',
        category: 'source',
        componentId: c.id,
        paramKey: 'resistance',
      });
      addVar('v_drop', {
        label: rawLabel + ' Voltage Drop (V_R)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      addVar('current', {
        label: rawLabel + ' Current (I_R)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind === 'diode' || c.kind === 'zener' || c.kind === 'led') {
      addVar('v_drop', {
        label: rawLabel + ' Forward Voltage (V_D)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      addVar('current', {
        label: rawLabel + ' Diode Current (I_D)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind === 'bjt_npn' || c.kind === 'bjt_pnp') {
      addVar('vce', {
        label: rawLabel + ' V_CE (Collector-Emitter)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      addVar('vbe', {
        label: rawLabel + ' V_BE (Base-Emitter)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      addVar('ic', {
        label: rawLabel + ' Collector Current (I_C)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
      addVar('ib', {
        label: rawLabel + ' Base Current (I_B)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind.startsWith('mosfet_')) {
      addVar('vds', {
        label: rawLabel + ' V_DS (Drain-Source)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      addVar('vgs', {
        label: rawLabel + ' V_GS (Gate-Source)',
        unit: 'V',
        category: 'voltage',
        componentId: c.id,
      });
      addVar('id', {
        label: rawLabel + ' Drain Current (I_D)',
        unit: 'A',
        category: 'current',
        componentId: c.id,
      });
    } else if (c.kind === 'opamp') {
      addVar('vout', {
        label: rawLabel + ' Output Voltage (V_out)',
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

  // Marked primary variables are hoisted to the top of the variable list
  vars.sort((a, b) => {
    if (a.isMarked && !b.isMarked) return -1;
    if (!a.isMarked && b.isMarked) return 1;
    return 0;
  });

  return vars;
}

export function getMarkedVariableValues(
  netlist: Netlist,
  compStates: Record<string, ComponentSimState>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const comp of Object.values(netlist.components)) {
    const marker = comp.params?.analogMarker;
    if (marker?.label && marker?.variableKey) {
      const varId = `${comp.id}:${marker.variableKey}`;
      const val = resolveVariableValue(varId, compStates, netlist.components);
      result[marker.label] = val;
      result[marker.label.toLowerCase()] = val;
    }
  }
  return result;
}

function resolveVariableValue(
  varId: string,
  compStates: Record<string, ComponentSimState>,
  comps: Record<string, ComponentInstance>
): number {
  if (varId.startsWith('node:')) {
    const targetNetId = varId.replace('node:', '');
    for (const state of Object.values(compStates)) {
      if (state && state.nodeVoltages) {
        for (const [pinId, v] of Object.entries(state.nodeVoltages)) {
          if (pinId === targetNetId) return v;
        }
      }
    }
    // Fallback: search for first non-zero voltage across nodes
    for (const state of Object.values(compStates)) {
      if (state && state.nodeVoltages) {
        for (const v of Object.values(state.nodeVoltages)) {
          if (v !== 0) return v;
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
      if (state && state.branchCurrents) {
        const cur = state.branchCurrents['collector'] ?? state.branchCurrents['c'] ??
                    state.branchCurrents['drain'] ?? state.branchCurrents['d'] ??
                    state.branchCurrents['p'] ?? state.branchCurrents['1'] ?? 0;
        return Math.abs(cur);
      }
      return 0;
    case 'resistance':
      return comp.params.resistance ?? 1000;
    case 'v_drop': {
      const vp = state?.nodeVoltages?.['p'] ?? state?.nodeVoltages?.['1'] ?? state?.nodeVoltages?.['A'] ?? 0;
      const vn = state?.nodeVoltages?.['n'] ?? state?.nodeVoltages?.['2'] ?? state?.nodeVoltages?.['K'] ?? 0;
      return vp - vn;
    }
    case 'vce': {
      const vc = state?.nodeVoltages?.['collector'] ?? state?.nodeVoltages?.['c'] ?? 0;
      const ve = state?.nodeVoltages?.['emitter'] ?? state?.nodeVoltages?.['e'] ?? 0;
      return vc - ve;
    }
    case 'vbe': {
      const vb = state?.nodeVoltages?.['base'] ?? state?.nodeVoltages?.['b'] ?? 0;
      const ve = state?.nodeVoltages?.['emitter'] ?? state?.nodeVoltages?.['e'] ?? 0;
      return vb - ve;
    }
    case 'ic':
      return state?.branchCurrents?.['collector'] ?? state?.branchCurrents?.['c'] ?? 0;
    case 'ib':
      return state?.branchCurrents?.['base'] ?? state?.branchCurrents?.['b'] ?? 0;
    case 'vds': {
      const vd = state?.nodeVoltages?.['drain'] ?? state?.nodeVoltages?.['d'] ?? 0;
      const vs = state?.nodeVoltages?.['source'] ?? state?.nodeVoltages?.['s'] ?? 0;
      return vd - vs;
    }
    case 'vgs': {
      const vg = state?.nodeVoltages?.['gate'] ?? state?.nodeVoltages?.['g'] ?? 0;
      const vs = state?.nodeVoltages?.['source'] ?? state?.nodeVoltages?.['s'] ?? 0;
      return vg - vs;
    }
    case 'id':
      return state?.branchCurrents?.['drain'] ?? state?.branchCurrents?.['d'] ?? 0;
    case 'vout':
      return state?.nodeVoltages?.['out'] ?? 0;
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
      const vp = nodeVoltages['p'] ?? nodeVoltages['1'] ?? 0;
      const vn = nodeVoltages['n'] ?? nodeVoltages['2'] ?? 0;
      const vDiff = vp - vn;
      const cur = vDiff / comp.params.resistance;
      branchCurrents['p'] = cur;
      branchCurrents['n'] = -cur;
      branchCurrents['1'] = cur;
      branchCurrents['2'] = -cur;
    } else if (comp.kind === 'diode' || comp.kind === 'zener' || comp.kind === 'led') {
      const vp = nodeVoltages['p'] ?? nodeVoltages['A'] ?? 0;
      const vn = nodeVoltages['n'] ?? nodeVoltages['K'] ?? 0;
      const vDiff = vp - vn;
      const Is = comp.params.saturationCurrent ?? 1e-12;
      const Vt = 0.026;
      const id = Is * (Math.exp(Math.min(vDiff / Vt, 30)) - 1);
      branchCurrents['p'] = id;
      branchCurrents['n'] = -id;
      branchCurrents['A'] = id;
      branchCurrents['K'] = -id;
    } else if (comp.kind === 'bjt_npn' || comp.kind === 'bjt_pnp') {
      const vb = nodeVoltages['base'] ?? nodeVoltages['b'] ?? 0;
      const ve = nodeVoltages['emitter'] ?? nodeVoltages['e'] ?? 0;
      const vc = nodeVoltages['collector'] ?? nodeVoltages['c'] ?? 0;
      const vbe = vb - ve;
      const vce = vc - ve;
      const beta = comp.params.beta ?? 100;
      const is = comp.params.saturationCurrent ?? 1e-14;
      const vt = 0.026;
      const vbe_clamped = Math.max(Math.min(vbe, 0.8), -5);
      const ib = (is / beta) * (Math.exp(vbe_clamped / vt) - 1);
      const satFactor = Math.max(0, Math.min(1, vce / 0.2));
      const earlyFactor = 1 + Math.max(0, vce) / (comp.params.earlyVoltage ?? 100);
      const ic = is * (Math.exp(vbe_clamped / vt) - 1) * satFactor * earlyFactor;
      branchCurrents['b'] = ib;
      branchCurrents['c'] = ic;
      branchCurrents['e'] = -(ib + ic);
      branchCurrents['base'] = ib;
      branchCurrents['collector'] = ic;
      branchCurrents['emitter'] = -(ib + ic);
    } else if (comp.kind.startsWith('mosfet_')) {
      const vg = nodeVoltages['gate'] ?? nodeVoltages['g'] ?? 0;
      const vs = nodeVoltages['source'] ?? nodeVoltages['s'] ?? 0;
      const vd = nodeVoltages['drain'] ?? nodeVoltages['d'] ?? 0;
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
      branchCurrents['drain'] = id;
      branchCurrents['source'] = -id;
      branchCurrents['gate'] = 0;
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

      // Frequency response AC impedance matching
      let simH = 0.001;
      let simT = 0;
      if (options.sweepParam === 'frequency') {
        const freq = Math.max(1, currentSweepVal);
        simH = 1 / (2 * Math.PI * freq);
        simT = 1 / (4 * freq); // 90 deg for peak sinusoidal output
      } else if (options.sweepParam === 'amplitude') {
        simH = 0.001;
        simT = 0.00025; // quarter period for 1kHz
      }
      const mnaResult = solveMNA(testNetlist, simConfig, simH, null, simT, {}, {});
      const compStates = computeStatesFromMna(testNetlist, mnaResult);

      const markedVars = getMarkedVariableValues(testNetlist, compStates);
      const xVal = resolveVariableValue(options.xVariableId, compStates, clonedComps);
      const rawY = resolveVariableValue(options.yVariableId, compStates, clonedComps);

      let yVal = 0;
      if (options.customFormula) {
        yVal = evaluateFormula(options.customFormula, {
          ...markedVars,
          x: xVal,
          xVal,
          v: xVal,
          rawY,
          y: rawY,
        });
      } else {
        yVal = rawY;
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
      // Ensure points are sorted and strictly ascending for uPlot compatibility
      seriesList.forEach((s) => {
        s.points.sort((a, b) => a.x - b.x);
        for (let i = 1; i < s.points.length; i++) {
          if (s.points[i].x <= s.points[i - 1].x) {
            s.points[i].x = s.points[i - 1].x + 1e-6;
          }
        }
      });
      onComplete(seriesList);
    }
  }

  requestAnimationFrame(stepChunk);
}
