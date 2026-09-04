// ============================================================
// VirtualLab-HIL — Modified Nodal Analysis (MNA) Solver
// ============================================================

import type {
  Netlist, ComponentInstance,
  MNAMatrix, SimulationConfig, WaveformType,
} from '@/types/circuit';
import { logger } from '@/utils/logger';

const VT = 0.025852;   // thermal voltage @ 300K (V)
const GMIN = 1e-12;    // minimum conductance to aid convergence

export function evaluateWaveform(
  waveform: WaveformType = 'sine',
  amplitude: number = 5.0,
  frequency: number = 1000.0,
  phase: number = 0.0,
  offset: number = 0.0,
  t: number = 0.0,
  dutyCycle = 0.5,
): number {
  const normDuty = dutyCycle > 1 ? dutyCycle / 100 : (dutyCycle <= 0 ? 0.5 : dutyCycle);
  const phaseRad = (phase * Math.PI) / 180;
  const theta = 2 * Math.PI * frequency * t + phaseRad;
  let v: number;
  switch (waveform) {
    case 'sine':
      v = amplitude * Math.sin(theta);
      break;
    case 'cosine':
      v = amplitude * Math.cos(theta);
      break;
    case 'square':
      v = Math.sin(theta) >= 0 ? amplitude : -amplitude;
      break;
    case 'triangle':
      v = amplitude * (2 / Math.PI) * Math.asin(Math.sin(theta));
      break;
    case 'sawtooth': {
      const frac = ((frequency * t + phase / 360) % 1 + 1) % 1;
      v = amplitude * (2 * frac - 1);
      break;
    }
    case 'pulse': {
      const frac = ((frequency * t + phase / 360) % 1 + 1) % 1;
      v = frac < normDuty ? amplitude : 0;
      break;
    }
    case 'dc':
    default:
      v = amplitude;
      break;
  }
  return v + offset;
}

function makeMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function makeVector(size: number): number[] {
  return new Array(size).fill(0);
}

export function gaussianElimination(A: number[][], z: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, z[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-20) {
      M[col][col] += 1e-9;
      maxVal = 1e-9;
    }

    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = M[row][n];
    for (let col = row + 1; col < n; col++) {
      x[row] -= M[row][col] * x[col];
    }
    x[row] /= M[row][row];
  }
  return x;
}

function stampConductance(
  A: number[][], ni: number, nj: number, g: number,
) {
  if (ni > 0) A[ni - 1][ni - 1] += g;
  if (nj > 0) A[nj - 1][nj - 1] += g;
  if (ni > 0 && nj > 0) {
    A[ni - 1][nj - 1] -= g;
    A[nj - 1][ni - 1] -= g;
  }
}

function stampCurrentSource(
  z: number[], ni: number, nj: number, I: number,
) {
  if (ni > 0) z[ni - 1] -= I;
  if (nj > 0) z[nj - 1] += I;
}

function stampVoltageSource(
  A: number[][], z: number[], ni: number, nj: number, vsIdx: number, V: number,
) {
  if (ni > 0) { A[ni - 1][vsIdx] += 1; A[vsIdx][ni - 1] += 1; }
  if (nj > 0) { A[nj - 1][vsIdx] -= 1; A[vsIdx][nj - 1] -= 1; }
  z[vsIdx] = V;
}

export interface BuildResult {
  matrix: MNAMatrix;
  n: number;
  m: number;
}

export function solveMNA(
  netlist: Netlist,
  config: SimulationConfig,
  t: number,
  prevX: number[] | null,
  _prevT: number,
  hilOverrides: Record<string, number> = {},
  inductorCurrents: Record<string, number> = {},
): { x: number[]; nodeIndex: Record<string, number>; vsourceIndex: Record<string, number> } | null {

  const { components, wires, netNodes } = netlist;
  const h = config.timeStep;

  // 1. Enumerate non-ground nodes
  const allNetIds = Object.keys(netNodes);
  let groundExists = allNetIds.some((id) => netNodes[id].isGround);

  // Auto-reference if no ground exists
  if (!groundExists && allNetIds.length > 0) {
    const autoGndId = allNetIds[0];
    netNodes[autoGndId].isGround = true;
    groundExists = true;
  }

  const nodeIds = allNetIds.filter((id) => !netNodes[id].isGround);
  const nodeIndex: Record<string, number> = {};
  nodeIds.forEach((id, i) => { nodeIndex[id] = i + 1; });
  const n = nodeIds.length;

  // 2. Identify voltage sources
  const voltageSources: { id: string; kind: string; pNode: number; nNode: number }[] = [];
  const vsourceIndex: Record<string, number> = {};

  for (const [netNodeId] of Object.entries(hilOverrides)) {
    const ni = nodeIndex[netNodeId] ?? 0;
    const vsId = `_hil_vs_${netNodeId}`;
    vsourceIndex[vsId] = n + voltageSources.length;
    voltageSources.push({ id: vsId, kind: '_hil', pNode: ni, nNode: 0 });
  }

  const compList: ComponentInstance[] = Object.values(components);
  for (const comp of compList) {
    if (comp.kind === 'dc_voltage' || comp.kind === 'ac_voltage' || comp.kind === 'signal_generator') {
      const pNetId = getPinNetId(wires, comp.id, 'p') ?? getPinNetId(wires, comp.id, 'out');
      const nNetId = getPinNetId(wires, comp.id, 'n') ?? getPinNetId(wires, comp.id, 'gnd');
      const ni = pNetId ? (nodeIndex[pNetId] ?? 0) : 0;
      const nj = nNetId ? (nodeIndex[nNetId] ?? 0) : 0;
      const vsId = `vs_${comp.id}`;
      vsourceIndex[vsId] = n + voltageSources.length;
      voltageSources.push({ id: vsId, kind: comp.kind, pNode: ni, nNode: nj });
    }
  }

  const m = voltageSources.length;
  const size = n + m;
  if (size === 0) return { x: [], nodeIndex, vsourceIndex };

  let x: number[] = prevX ? [...prevX].slice(0, size) : new Array(size).fill(0);
  if (x.length < size) x = [...x, ...new Array(size - x.length).fill(0)];

  const maxIter = config.maxIterations;
  const tol = config.tolerance;

  for (let iter = 0; iter < maxIter; iter++) {
    const A = makeMatrix(size);
    const z = makeVector(size);

    for (const comp of compList) {
      const { kind, params } = comp;
      const p = (pinId: string) => {
        const nid = getPinNetId(wires, comp.id, pinId);
        return nid ? (nodeIndex[nid] ?? 0) : 0;
      };
      const vNode = (ni: number) => (ni > 0 ? x[ni - 1] : 0);
      const vPrevNode = (ni: number) => (ni > 0 && prevX && prevX[ni - 1] !== undefined ? prevX[ni - 1] : (ni > 0 ? x[ni - 1] : 0));

      // Transient companion model for linear / parasitic capacitances
      const stampCapacitor = (ni: number, nj: number, C: number) => {
        if (C <= 0 || h <= 0 || (ni === 0 && nj === 0) || ni === nj) return;
        const Geq = C / h;
        // In companion modeling, Vprev is the voltage across the capacitor at the PREVIOUS timestep (t - h)
        const Vprev = vPrevNode(ni) - vPrevNode(nj);
        stampConductance(A, ni, nj, Geq);
        stampCurrentSource(z, ni, nj, -Geq * Vprev);
      };

      switch (kind) {
        case 'resistor': {
          const R = Math.max(params.resistance ?? 1000, 1e-6);
          const ni = p('p') || p('1');
          const nj = p('n') || p('2');
          stampConductance(A, ni, nj, 1 / R);
          if (params.cp) {
            stampCapacitor(ni, nj, params.cp);
          }
          break;
        }
        case 'capacitor': {
          const C = params.capacitance ?? 1e-6;
          const Geq = C / h;
          const ni = p('p') || p('1'), nj = p('n') || p('2');
          const Vprev = vPrevNode(ni) - vPrevNode(nj);
          stampConductance(A, ni, nj, Geq);
          stampCurrentSource(z, ni, nj, -Geq * Vprev);
          break;
        }
        case 'inductor': {
          const L = params.inductance ?? 0.01;
          const Geq = h / L;
          const ni = p('p') || p('1'), nj = p('n') || p('2');
          stampConductance(A, ni, nj, Geq);
          // Add history current source from previous inductor current
          const compId = comp.id;
          const Iprev = inductorCurrents[compId] ?? 0;
          stampCurrentSource(z, ni, nj, -Iprev);
          break;
        }
        case 'ground':
        case 'junction':
          break;
        case 'speaker': {
          const R = Math.max(params.resistance ?? 8, 1);
          stampConductance(A, p('p'), p('n'), 1 / R);
          break;
        }
        case 'ohmmeter': {
          const ni = p('p'), nj = p('n');
          // Reference test current Itest = 1mA with 100M safety shunt for open loops
          const Itest = 1e-3;
          stampCurrentSource(z, ni, nj, Itest);
          stampConductance(A, ni, nj, 1e-8);
          break;
        }
        case 'current_source': {
          const I = params.current ?? 0.01;
          stampCurrentSource(z, p('p'), p('n'), I);
          break;
        }
        case 'voltmeter':
        case 'multimeter':
        case 'oscilloscope': {
          // 10 MΩ high-impedance voltage sensing
          const pPin = p('p') || p('out');
          const nPin = p('n') || p('gnd');
          stampConductance(A, pPin, nPin, 1e-7);
          break;
        }
        case 'ammeter': {
          // 10 µΩ ultra-low impedance current shunt
          stampConductance(A, p('p'), p('n'), 1e5);
          break;
        }
        case 'diode':
        case 'zener':
        case 'led': {
          const Is = params.saturationCurrent ?? 1e-14;
          const n_factor = params.ideality ?? (kind === 'led' ? 1.8 : 1);
          const nVt = n_factor * VT;
          const ni = p('p'), nj = p('n');
          const Vd = Math.max(Math.min(vNode(ni) - vNode(nj), 3.5), -5);

          // Parasitic junction capacitance
          const Cj = params.cj ?? (kind === 'led' ? 3e-12 : 2.5e-12);
          stampCapacitor(ni, nj, Cj);

          if (kind === 'zener') {
            const Vz = params.zenerVoltage ?? 5.1;
            if (Vd < -Vz) {
              const Rz = params.zenerImpedance ?? 10;
              const Gz = 1 / Rz;
              const Ieq_z = -Gz * (-Vz) - Gz * Vd;
              stampConductance(A, ni, nj, Gz);
              stampCurrentSource(z, ni, nj, -Ieq_z);
              break;
            }
          }

          const expVd = Math.exp(Math.min(Vd / nVt, 500));
          const Id = Is * (expVd - 1);
          const Geq = (Is / nVt) * expVd + GMIN;
          const Ieq = Id - Geq * Vd;
          stampConductance(A, ni, nj, Geq);
          stampCurrentSource(z, ni, nj, Ieq);
          break;
        }
        case 'bjt_npn': {
          const beta = params.beta ?? 100;
          const Is = params.saturationCurrent ?? 1e-14;
          const Va = params.earlyVoltage ?? 100;
          const nVt_bjt = VT;
          const nb = p('base'), nc = p('collector'), ne = p('emitter');
          const Vbe = vNode(nb) - vNode(ne);
          const Vce = vNode(nc) - vNode(ne);
          const Vbe_c = Math.max(Math.min(Vbe, 0.8), -5);

          // Parasitic junction capacitances: Cbe (base-emitter), Cbc (Miller base-collector)
          const Cbe = params.cbe ?? 8e-12;
          const Cbc = params.cbc ?? 3e-12;
          stampCapacitor(nb, ne, Cbe);
          stampCapacitor(nb, nc, Cbc);

          // Base-Emitter Diode junction
          const Ibe = (Is / beta) * (Math.exp(Vbe_c / nVt_bjt) - 1);
          const Gbe = (Is / (beta * nVt_bjt)) * Math.exp(Vbe_c / nVt_bjt) + GMIN;
          stampConductance(A, nb, ne, Gbe);
          stampCurrentSource(z, nb, ne, Ibe - Gbe * Vbe_c);

          // Collector-Emitter with saturation softening (Vce < 0.2V)
          const satFactor = Math.max(0, Math.min(1, Vce / 0.2));
          const earlyFactor = 1 + Math.max(0, Vce) / Va;
          const Ic_ideal = Is * (Math.exp(Vbe_c / nVt_bjt) - 1);
          const Ic = Ic_ideal * satFactor * earlyFactor;
          const Gm = (Is / nVt_bjt) * Math.exp(Vbe_c / nVt_bjt) * satFactor * earlyFactor;
          const Gce_base = (Vce < 0.2 ? Math.max(Ic_ideal / 0.2, 0.01) : 1e-5);
          const Gce = Gce_base * earlyFactor + (Ic_ideal * satFactor / Va) + GMIN;

          stampConductance(A, nc, ne, Gce);
          if (nb > 0 && nc > 0) { A[nc - 1][nb - 1] += Gm; }
          if (nb > 0 && ne > 0) { A[ne - 1][nb - 1] -= Gm; }
          if (ne > 0 && nc > 0) { A[nc - 1][ne - 1] -= Gm; }
          if (ne > 0 && ne > 0) { A[ne - 1][ne - 1] += Gm; }
          if (nc > 0) z[nc - 1] -= Ic - Gm * Vbe_c - Gce * Math.max(0, Vce);
          if (ne > 0) z[ne - 1] += Ic - Gm * Vbe_c - Gce * Math.max(0, Vce);

          const Gbc = GMIN;
          stampConductance(A, nb, nc, Gbc);
          break;
        }
        case 'bjt_pnp': {
          const beta = params.beta ?? 100;
          const Is = params.saturationCurrent ?? 1e-14;
          const Va = params.earlyVoltage ?? 100;
          const nVt_bjt = VT;
          const nb = p('base'), nc = p('collector'), ne = p('emitter');
          const Veb = vNode(ne) - vNode(nb);
          const Vec = vNode(ne) - vNode(nc);
          const Veb_c = Math.max(Math.min(Veb, 0.8), -5);

          // Parasitic junction capacitances: Cbe (base-emitter), Cbc (Miller base-collector)
          const Cbe = params.cbe ?? 8e-12;
          const Cbc = params.cbc ?? 3e-12;
          stampCapacitor(nb, ne, Cbe);
          stampCapacitor(nb, nc, Cbc);

          const Ieb = (Is / beta) * (Math.exp(Veb_c / nVt_bjt) - 1);
          const Geb = (Is / (beta * nVt_bjt)) * Math.exp(Veb_c / nVt_bjt) + GMIN;
          stampConductance(A, ne, nb, Geb);
          stampCurrentSource(z, ne, nb, Ieb - Geb * Veb_c);

          const satFactor = Math.max(0, Math.min(1, Vec / 0.2));
          const earlyFactor = 1 + Math.max(0, Vec) / Va;
          const Ic_ideal = Is * (Math.exp(Veb_c / nVt_bjt) - 1);
          const Ic = Ic_ideal * satFactor * earlyFactor;
          const Gm = (Is / nVt_bjt) * Math.exp(Veb_c / nVt_bjt) * satFactor * earlyFactor;
          const Gec_base = (Vec < 0.2 ? Math.max(Ic_ideal / 0.2, 0.01) : 1e-5);
          const Gec = Gec_base * earlyFactor + (Ic_ideal * satFactor / Va) + GMIN;

          stampConductance(A, ne, nc, Gec);
          if (nb > 0 && nc > 0) { A[nc - 1][nb - 1] -= Gm; }
          if (nb > 0 && ne > 0) { A[ne - 1][nb - 1] += Gm; }
          if (ne > 0 && nc > 0) { A[nc - 1][ne - 1] += Gm; }
          if (ne > 0 && ne > 0) { A[ne - 1][ne - 1] -= Gm; }
          if (nc > 0) z[nc - 1] += Ic - Gm * Veb_c - Gec * Math.max(0, Vec);
          if (ne > 0) z[ne - 1] -= Ic - Gm * Veb_c - Gec * Math.max(0, Vec);

          const Gbc = GMIN;
          stampConductance(A, nb, nc, Gbc);
          break;
        }
        case 'mosfet_n_enh':
        case 'mosfet_n_dep': {
          const Vth = params.vth ?? (kind === 'mosfet_n_dep' ? -1.5 : 2.0);
          const kn = params.kn ?? 0.002;
          const lambda = params.lambda ?? 0.02;
          const ng = p('gate'), nd = p('drain'), ns = p('source');
          const Vgs = vNode(ng) - vNode(ns);
          const Vds = vNode(nd) - vNode(ns);
          const Vgs_eff = Vgs - Vth;

          // Parasitic capacitances: Cgs (gate-source), Cgd (Miller gate-drain), Cds
          const Cgs = params.cgs ?? 10e-12;
          const Cgd = params.cgd ?? 4e-12;
          const Cds = params.cds ?? 5e-12;
          stampCapacitor(ng, ns, Cgs);
          stampCapacitor(ng, nd, Cgd);
          stampCapacitor(nd, ns, Cds);

          let Id = 0, Gds = GMIN, Gm_m = 0;
          if (Vgs_eff > 0) {
            if (Vds >= Vgs_eff) {
              const Id_basic = (kn / 2) * Vgs_eff * Vgs_eff;
              Id = Id_basic * (1 + lambda * Vds);
              Gm_m = kn * Vgs_eff * (1 + lambda * Vds);
              Gds = lambda * Id_basic + GMIN;
            } else {
              const Id_basic = kn * (Vgs_eff * Vds - (Vds * Vds) / 2);
              Id = Id_basic * (1 + lambda * Vds);
              Gm_m = kn * Vds * (1 + lambda * Vds);
              Gds = kn * (Vgs_eff - Vds) * (1 + lambda * Vds) + lambda * Id_basic + GMIN;
            }
          }

          stampConductance(A, nd, ns, Gds);
          if (ng > 0 && nd > 0) A[nd - 1][ng - 1] += Gm_m;
          if (ng > 0 && ns > 0) A[ns - 1][ng - 1] -= Gm_m;
          if (nd > 0) z[nd - 1] -= Id - Gm_m * Vgs - Gds * Vds;
          if (ns > 0) z[ns - 1] += Id - Gm_m * Vgs - Gds * Vds;
          break;
        }
        case 'mosfet_p_enh':
        case 'mosfet_p_dep': {
          const Vth = params.vth ?? (kind === 'mosfet_p_dep' ? 1.5 : -2.0);
          const kp = params.kn ?? 0.002;
          const lambda = params.lambda ?? 0.02;
          const ng = p('gate'), nd = p('drain'), ns = p('source');
          const Vsg = vNode(ns) - vNode(ng);
          const Vsd = vNode(ns) - vNode(nd);
          const Vsg_eff = Vsg - Math.abs(Vth);

          // Parasitic capacitances: Cgs (gate-source), Cgd (Miller gate-drain), Cds
          const Cgs = params.cgs ?? 10e-12;
          const Cgd = params.cgd ?? 4e-12;
          const Cds = params.cds ?? 5e-12;
          stampCapacitor(ng, ns, Cgs);
          stampCapacitor(ng, nd, Cgd);
          stampCapacitor(nd, ns, Cds);

          let Id = 0, Gds = GMIN, Gm_m = 0;
          if (Vsg_eff > 0) {
            if (Vsd >= Vsg_eff) {
              const Id_basic = (kp / 2) * Vsg_eff * Vsg_eff;
              Id = Id_basic * (1 + lambda * Vsd);
              Gm_m = kp * Vsg_eff * (1 + lambda * Vsd);
              Gds = lambda * Id_basic + GMIN;
            } else {
              const Id_basic = kp * (Vsg_eff * Vsd - (Vsd * Vsd) / 2);
              Id = Id_basic * (1 + lambda * Vsd);
              Gm_m = kp * Vsd * (1 + lambda * Vsd);
              Gds = kp * (Vsg_eff - Vsd) * (1 + lambda * Vsd) + lambda * Id_basic + GMIN;
            }
          }

          stampConductance(A, ns, nd, Gds);
          if (ng > 0 && ns > 0) A[ns - 1][ng - 1] -= Gm_m;
          if (ng > 0 && nd > 0) A[nd - 1][ng - 1] += Gm_m;
          if (ns > 0) z[ns - 1] -= Id - Gm_m * Vsg - Gds * Vsd;
          if (nd > 0) z[nd - 1] += Id - Gm_m * Vsg - Gds * Vsd;
          break;
        }
        case 'switch':
        case 'pushbutton': {
          const closed = params.closed ?? false;
          const G = closed ? 1e4 : 1e-8; // 100 µΩ closed, 100 MΩ open
          stampConductance(A, p('p'), p('n'), G);
          break;
        }
        case 'potentiometer': {
          const R = Math.max(params.resistance ?? 10000, 1);
          const wiper = Math.max(0, Math.min(1, params.wiper ?? 0.5));
          const R1 = R * wiper;
          const R2 = R * (1 - wiper);
          stampConductance(A, p('p'), p('wiper'), R1 > 0 ? 1 / R1 : 1e6);
          stampConductance(A, p('wiper'), p('n'), R2 > 0 ? 1 / R2 : 1e6);
          break;
        }
        case 'oscilloscope':
        case 'multimeter':
        case 'logic_analyzer': {
          stampConductance(A, p('p'), p('n'), 1e-7);
          break;
        }
        case 'led': {
          const ni = p('p'), nj = p('n');
          const Vd = vNode(ni) - vNode(nj);
          // Color-dependent forward voltage
          const colorVfMap: Record<string, number> = {
            '#ef4444': 1.8,  // Red
            '#f97316': 1.9,  // Orange
            '#eab308': 2.0,  // Yellow
            '#22c55e': 2.2,  // Green
            '#06b6d4': 3.0,  // Cyan
            '#3b82f6': 3.2,  // Blue
            '#a855f7': 3.2,  // Purple
            '#f8fafc': 3.4,  // White
          };
          const Vf = colorVfMap[params.color ?? '#22c55e'] ?? 2.0;
          if (Vd > Vf - 0.2) {
            const G_on = 1 / 25;  // 25 ohm dynamic forward resistance
            stampConductance(A, ni, nj, G_on);
            // Correct Norton companion: constant current source for knee offset
            stampCurrentSource(z, ni, nj, G_on * Vf);
          } else {
            stampConductance(A, ni, nj, 1e-8);  // 100M reverse leakage
          }
          break;
        }
        case 'clock_source': {
          const nout = p('out');
          const G_out = 1 / 50;  // 50 ohm CMOS driver
          stampConductance(A, nout, 0, G_out);
          // Output voltage set by digital solver based on simTime
          const logicHigh = nout > 0 && comp.simState?.logicState?.['out'] === 1;
          if (nout > 0) z[nout - 1] += G_out * (logicHigh ? 5.0 : 0.0);
          break;
        }
        case 'digital_input': {
          const nout = p('out');
          const G_out = 1 / 50;  // 50 ohm CMOS driver
          stampConductance(A, nout, 0, G_out);
          const logicVal = params.logicState ?? 0;
          if (nout > 0) z[nout - 1] += G_out * (logicVal === 1 ? 5.0 : 0.0);
          break;
        }
        case 'digital_output': {
          const nin = p('in');
          // High impedance input - 10M pull-down
          stampConductance(A, nin, 0, 1e-7);
          break;
        }
        case 'adc': {
          const nin = p('in');
          if (nin > 0) {
            stampConductance(A, nin, 0, 1e-7); // 10 MΩ high-Z analog voltage sensing
          }
          const bits = Math.max(1, Math.min(16, comp.params.resolution ?? 4));
          const G_out = 1 / 50;
          for (let b = 0; b < bits; b++) {
            const nout = p(`d${b}`);
            if (nout > 0) {
              const bitVal = comp.simState?.logicState?.[`d${b}`] ?? 0;
              const v_out = bitVal === 1 ? (config.voh ?? 5.0) : (config.vol ?? 0.0);
              stampConductance(A, nout, 0, G_out);
              z[nout - 1] += G_out * v_out;
            }
          }
          break;
        }
        case 'dac': {
          const bits = Math.max(1, Math.min(16, comp.params.resolution ?? 4));
          for (let b = 0; b < bits; b++) {
            const nin = p(`d${b}`);
            if (nin > 0) {
              stampConductance(A, nin, 0, 1e-7); // 10 MΩ digital input impedance
            }
          }
          const nout = p('out');
          if (nout > 0) {
            const G_out = 1 / 50; // 50 ohm active low-Z output driver
            let code = 0;
            for (let b = 0; b < bits; b++) {
              const bitVal = comp.simState?.logicState?.[`d${b}`] ?? 0;
              if (bitVal === 1) code |= (1 << b);
            }
            const vMin = comp.params.vMin ?? 0.0;
            const vMax = comp.params.vMax ?? 5.0;
            const maxCode = (1 << bits) - 1;
            const vOut = vMin + (code / (maxCode || 1)) * (vMax - vMin);
            stampConductance(A, nout, 0, G_out);
            z[nout - 1] += G_out * vOut;
          }
          break;
        }
        case 'hil_ingress': {
          const nout = p('out');
          if (nout > 0) {
            const G_out = 1 / 50;
            const v = comp.simState?.nodeVoltages?.['out'] ?? (comp.params.hilPinType === 'gpio_in' ? 5.0 : 3.3);
            stampConductance(A, nout, 0, G_out);
            z[nout - 1] += G_out * v;
          }
          break;
        }
        case 'hil_egress': {
          const nin = p('in');
          if (nin > 0) {
            stampConductance(A, nin, 0, 1e-7); // 10 MΩ sensor load
          }
          break;
        }
        case 'gate_and':
        case 'gate_or':
        case 'gate_not':
        case 'gate_nand':
        case 'gate_nor':
        case 'gate_xor':
        case 'gate_xnor':
        case 'latch_sr':
        case 'latch_d':
        case 'latch_jk':
        case 'ff_d':
        case 'ff_t':
        case 'ff_jk':
        case 'ff_sr':
        case 'counter_4bit':
        case 'decoder_2to4': {
          // High-impedance CMOS pull-downs on all digital inputs (10 MΩ to GND)
          ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'in', 'in0', 'in1', 'in2', 'in3', 'in4', 'in5', 'in6', 'in7', 'CLK', 'clk', 'CLR', 'clr', 'SET', 'set', 'PRE', 'pre', 'D', 'T', 'J', 'K', 'S', 'R', 'EN', 'en'].forEach((pin) => {
            const n_in = p(pin);
            if (n_in > 0) {
              stampConductance(A, n_in, 0, 1e-7); // 10 MΩ pull-down
            }
          });

          // CMOS Totem-Pole Output Drivers (50Ω source/sink)
          ['out', 'Y', 'Q', 'Qbar', 'Y0', 'Y1', 'Y2', 'Y3'].forEach((pin) => {
            const n_out = p(pin);
            if (n_out > 0) {
              const G_out = 1 / 50; // 50 Ω output driver
              const logLevel = comp.simState?.logicState?.[pin] ?? 0;
              const V_out = logLevel === 1 ? (config.voh ?? 5.0) : (config.vol ?? 0.0);
              stampConductance(A, n_out, 0, G_out);
              z[n_out - 1] += G_out * V_out;
            }
          });
          break;
        }
        case 'opamp': {
          const inp = p('inp');
          const inn = p('inn');
          const nout = p('out');
          const nvcc = p('vcc');
          const nvee = p('vee');

          // High input impedance
          stampConductance(A, inp, 0, 1e-10);
          stampConductance(A, inn, 0, 1e-10);

          const V_pos = vNode(inp);
          const V_neg = vNode(inn);
          const V_vcc = nvcc > 0 ? vNode(nvcc) : (params.vcc ?? 15.0);
          const V_vee = nvee > 0 ? vNode(nvee) : (params.vee ?? -15.0);

          const Aol = params.openLoopGain ?? 100000;
          const Rout = Math.max(params.rout ?? 50, 1);
          const Gout = 1 / Rout;

          const rawVout = Aol * (V_pos - V_neg);
          const clampedVout = Math.max(V_vee, Math.min(V_vcc, rawVout));

          // Check if output is saturating against rails
          const isSaturated = rawVout >= V_vcc || rawVout <= V_vee;

          stampConductance(A, nout, 0, Gout);

          if (isSaturated) {
            // In saturation: act as voltage source at rail voltage
            if (nout > 0) {
              z[nout - 1] += Gout * clampedVout;
            }
          } else {
            // In linear region: stamp transconductance into matrix A for stable feedback
            // Vout = Aol * (V+ - V-) → stamp as VCVS
            const Gm_op = Gout * Aol;  // effective transconductance
            if (inp > 0 && nout > 0) A[nout - 1][inp - 1] += Gm_op;
            if (inn > 0 && nout > 0) A[nout - 1][inn - 1] -= Gm_op;
            // RHS correction for linearization
            if (nout > 0) {
              z[nout - 1] += Gout * clampedVout - Gm_op * (V_pos - V_neg);
            }
          }
          break;
        }
        case 'ic555': {
          const ngnd = p('gnd');
          const ntrig = p('trig');
          const nout = p('out');
          const nrst = p('rst');
          const nvcc = p('vcc');
          const ndisch = p('disch');
          const nthres = p('thres');
          const nctrl = p('ctrl');

          const V_gnd = vNode(ngnd);
          const V_vcc = nvcc > 0 ? Math.max(vNode(nvcc), V_gnd + 1.0) : 5.0;

          const R_ladder = 5000;
          if (nctrl > 0 && nvcc > 0) {
            stampConductance(A, nvcc, nctrl, 1 / R_ladder);
            stampConductance(A, nctrl, ngnd, 1 / (2 * R_ladder));
          }

          const V_ctrl = nctrl > 0 ? vNode(nctrl) : (V_gnd + (2 / 3) * (V_vcc - V_gnd));
          const V_trig_ref = V_gnd + (1 / 3) * (V_vcc - V_gnd);

          const V_trig = vNode(ntrig);
          const V_thres = vNode(nthres);
          const V_rst = nrst > 0 ? vNode(nrst) : V_vcc;

          let state = params.timerState ?? 0;
          if (nrst > 0 && V_rst < V_gnd + 0.7) {
            state = 0;
          } else if (V_trig < V_trig_ref) {
            state = 1;
          } else if (V_thres > V_ctrl) {
            state = 0;
          }
          params.timerState = state;

          const G_out = 1 / 20;
          const V_target_out = state === 1 ? (V_vcc - 1.4) : (V_gnd + 0.1);
          stampConductance(A, nout, ngnd, G_out);
          if (nout > 0) {
            z[nout - 1] += G_out * V_target_out;
          }
          if (ngnd > 0) {
            z[ngnd - 1] -= G_out * V_target_out;
          }

          if (state === 0) {
            stampConductance(A, ndisch, ngnd, 1 / 10);
          } else {
            stampConductance(A, ndisch, ngnd, 1e-9);
          }
          break;
        }
        default:
          break;
      }
    }

    for (const vs of voltageSources) {
      const vsIdx = vs.id.startsWith('_hil_vs_')
        ? vsourceIndex[vs.id]
        : vsourceIndex[`vs_${vs.id}`] ?? vsourceIndex[vs.id];
      
      if (vs.kind === '_hil') {
        const netNodeId = vs.id.replace('_hil_vs_', '');
        const V = hilOverrides[netNodeId] ?? 0;
        stampVoltageSource(A, z, vs.pNode, 0, vsIdx, V);
        continue;
      }

      const comp = components[vs.id.replace('vs_', '')];
      if (!comp) continue;
      let V = 0;
      if (comp.kind === 'dc_voltage') {
        V = comp.params.voltage ?? 0;
      } else if (comp.kind === 'ac_voltage' || comp.kind === 'signal_generator') {
        const amplitude = comp.params.amplitude ?? comp.params.voltage ?? 5.0;
        const frequency = comp.params.frequency ?? 1000.0;
        const phase = comp.params.phase ?? 0.0;
        const offset = comp.params.offset ?? 0.0;
        const waveform = comp.params.waveform ?? 'sine';
        const duty = comp.params.dutyCycle ?? 0.5;
        V = evaluateWaveform(waveform, amplitude, frequency, phase, offset, t, duty);
      }
      stampVoltageSource(A, z, vs.pNode, vs.nNode, vsIdx, V);
    }

    // Diagonal shunt conductance (1 GΩ to ground on all non-ground nodes)
    // Guarantees strictly non-singular, well-conditioned matrix even with open switches or floating pins
    for (let i = 0; i < n; i++) {
      A[i][i] += 1e-9;
    }

    const xNew = gaussianElimination(A, z);
    if (!xNew) {
      return null;
    }

    const converged = xNew.every((val, i) => Math.abs(val - x[i]) < tol);
    x = xNew;
    if (converged) break;
  }

  return { x, nodeIndex, vsourceIndex };
}

export function getPinNetId(
  wires: Netlist['wires'],
  componentId: string,
  pinId: string,
): string | null {
  const wire = wires.find(
    w => (w.sourceComponentId === componentId && w.sourcePinId === pinId)
      || (w.targetComponentId === componentId && w.targetPinId === pinId),
  );
  return wire ? wire.netNodeId : null;
}

export function getNodeVoltage(
  x: number[],
  nodeIndex: Record<string, number>,
  netNodeId: string,
): number {
  const idx = nodeIndex[netNodeId];
  if (idx === undefined || idx === 0) return 0;
  return x[idx - 1] ?? 0;
}
