// ============================================================
// VirtualLab-HIL — Digital Logic Solver
// ============================================================
// Handles: AND, OR, NOT, NAND, NOR, XOR, XNOR gates
//          SR Latch, D Latch, JK Latch, D Flip-Flop,
//          T Flip-Flop, 4-bit Binary Counter, 2-to-4 Decoder

import type {
  ComponentInstance, LogicLevel, SimulationConfig,
} from '@/types/circuit';

// ─── Logic helpers ───────────────────────────────────────────

export function voltageToLogic(v: number, config: SimulationConfig): LogicLevel {
  if (v >= config.vih) return 1;
  if (v <= config.vil) return 0;
  return 'X'; // metastable / unknown
}

export function logicToVoltage(l: LogicLevel, config: SimulationConfig): number {
  if (l === 1) return config.voh;
  if (l === 0) return config.vol;
  if (l === 'Z') return 0; // hi-Z — no drive, treat as 0
  return (config.voh + config.vol) / 2; // X — midpoint
}

function land(a: LogicLevel, b: LogicLevel): LogicLevel {
  if (a === 0 || b === 0) return 0;
  if (a === 1 && b === 1) return 1;
  return 'X';
}
function lor(a: LogicLevel, b: LogicLevel): LogicLevel {
  if (a === 1 || b === 1) return 1;
  if (a === 0 && b === 0) return 0;
  return 'X';
}
function lnot(a: LogicLevel): LogicLevel {
  if (a === 1) return 0;
  if (a === 0) return 1;
  return 'X';
}
function lxor(a: LogicLevel, b: LogicLevel): LogicLevel {
  if (a === 'X' || b === 'X') return 'X';
  return (a === b) ? 0 : 1;
}

// ─── Propagation Delay Queue ───────────────────────────────

export interface DelayedEvent {
  targetCompId: string;
  pinId: string;
  value: LogicLevel;
  fireTime: number;
}

let delayQueue: DelayedEvent[] = [];

export function clearDelayQueue() {
  delayQueue = [];
}

export function processDelayQueue(currentTime: number): Record<string, Record<string, LogicLevel>> {
  const ready: Record<string, Record<string, LogicLevel>> = {};
  const remaining: DelayedEvent[] = [];
  for (const evt of delayQueue) {
    if (evt.fireTime <= currentTime) {
      if (!ready[evt.targetCompId]) ready[evt.targetCompId] = {};
      ready[evt.targetCompId][evt.pinId] = evt.value;
    } else {
      remaining.push(evt);
    }
  }
  delayQueue = remaining;
  return ready;
}

export function scheduleDelayedOutput(
  compId: string, pinId: string, value: LogicLevel, currentTime: number, delaySeconds: number
) {
  if (delaySeconds <= 0) return; // no delay, applied immediately
  delayQueue.push({ targetCompId: compId, pinId, value, fireTime: currentTime + delaySeconds });
}

// ─── Flip-Flop & Latch State Storage ─────────────────────────

const latchState: Record<string, { Q: LogicLevel; Qbar: LogicLevel; prevClk: LogicLevel; count: number }> = {};

function getState(id: string) {
  if (!latchState[id]) {
    latchState[id] = { Q: 0, Qbar: 1, prevClk: 0, count: 0 };
  }
  return latchState[id];
}

export function resetDigitalState(componentId?: string) {
  if (componentId) {
    delete latchState[componentId];
  } else {
    Object.keys(latchState).forEach(k => delete latchState[k]);
  }
}

// ─── Main Gate / Storage Solver ───────────────────────────────

/**
 * Evaluates a digital component's output given its input logic levels.
 * Returns a record of pin-id -> LogicLevel for all outputs.
 */
export function solveDigitalComponent(
  comp: ComponentInstance,
  inputs: Record<string, LogicLevel>,
  config: SimulationConfig,
  risingEdge = false,
): Record<string, LogicLevel> {
  const { kind, id } = comp;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const inputCount = Math.max(2, Math.min(8, comp.params.inputCount ?? 2));
  const activeInputs: LogicLevel[] = [];
  for (let i = 0; i < inputCount; i++) {
    const key = letters[i];
    activeInputs.push(inputs[key] ?? inputs[`in${i}`] ?? 0);
  }

  const A = activeInputs[0] ?? 0;
  const B = activeInputs[1] ?? 0;

  switch (kind) {
    // ─── Basic Gates (2 to 8 Inputs) ─────────────────────────
    case 'gate_and': {
      const out = activeInputs.reduce((acc, val) => land(acc, val), 1 as LogicLevel);
      return { out };
    }
    case 'gate_or': {
      const out = activeInputs.reduce((acc, val) => lor(acc, val), 0 as LogicLevel);
      return { out };
    }
    case 'gate_not': return { out: lnot(A) };
    case 'gate_nand': {
      const out = lnot(activeInputs.reduce((acc, val) => land(acc, val), 1 as LogicLevel));
      return { out };
    }
    case 'gate_nor': {
      const out = lnot(activeInputs.reduce((acc, val) => lor(acc, val), 0 as LogicLevel));
      return { out };
    }
    case 'gate_xor': {
      const out = activeInputs.reduce((acc, val) => lxor(acc, val), 0 as LogicLevel);
      return { out };
    }
    case 'gate_xnor': {
      const out = lnot(activeInputs.reduce((acc, val) => lxor(acc, val), 0 as LogicLevel));
      return { out };
    }

function isClockTriggered(
  st: { prevClk: LogicLevel },
  clk: LogicLevel,
  triggerType: 'rising_edge' | 'falling_edge' | 'level_high' | 'level_low' = 'rising_edge',
  risingEdge = false,
): boolean {
  switch (triggerType) {
    case 'rising_edge':
      return (st.prevClk === 0 && clk === 1) || (risingEdge && clk === 1 && st.prevClk === 0);
    case 'falling_edge':
      return st.prevClk === 1 && clk === 0;
    case 'level_high':
      return clk === 1;
    case 'level_low':
      return clk === 0;
    default:
      return (st.prevClk === 0 && clk === 1) || (risingEdge && clk === 1 && st.prevClk === 0);
  }
}

    // ─── SR Latch (NOR-based / Level / Edge) ──────────────────
    case 'latch_sr': {
      const S = inputs['S'] ?? 0;
      const R = inputs['R'] ?? 0;
      const EN = inputs['EN'] ?? inputs['en'] ?? inputs['CLK'] ?? inputs['clk'] ?? 1;
      const trigger = comp.params.triggerType ?? 'level_high';
      const st = getState(id);

      const isTriggered = (trigger === 'level_high' && EN === 1) ||
                          (trigger === 'level_low' && EN === 0) ||
                          isClockTriggered(st, EN, trigger, risingEdge);

      if (isTriggered) {
        if (S === 1 && R === 0) { st.Q = 1; st.Qbar = 0; }
        else if (S === 0 && R === 1) { st.Q = 0; st.Qbar = 1; }
        else if (S === 1 && R === 1) { st.Q = 'X'; st.Qbar = 'X'; } // forbidden
      }
      st.prevClk = EN;
      return { Q: st.Q, Qbar: st.Qbar };
    }

    // ─── D Latch (Level-sensitive / Configurable) ─────────────
    case 'latch_d': {
      const D = inputs['D'] ?? 0;
      const EN = inputs['EN'] ?? inputs['en'] ?? inputs['CLK'] ?? inputs['clk'] ?? 0;
      const trigger = comp.params.triggerType ?? 'level_high';
      const st = getState(id);

      const isTriggered = (trigger === 'level_high' && EN === 1) ||
                          (trigger === 'level_low' && EN === 0) ||
                          isClockTriggered(st, EN, trigger, risingEdge);

      if (isTriggered) { st.Q = D; st.Qbar = lnot(D); }
      st.prevClk = EN;
      return { Q: st.Q, Qbar: st.Qbar };
    }

    // ─── JK Latch ────────────────────────────────────────────
    case 'latch_jk': {
      const J = inputs['J'] ?? 0;
      const K = inputs['K'] ?? 0;
      const EN = inputs['EN'] ?? inputs['en'] ?? inputs['CLK'] ?? inputs['clk'] ?? 1;
      const trigger = comp.params.triggerType ?? 'level_high';
      const st = getState(id);

      const isTriggered = (trigger === 'level_high' && EN === 1) ||
                          (trigger === 'level_low' && EN === 0) ||
                          isClockTriggered(st, EN, trigger, risingEdge);

      if (isTriggered) {
        if (J === 1 && K === 0) { st.Q = 1; st.Qbar = 0; }
        else if (J === 0 && K === 1) { st.Q = 0; st.Qbar = 1; }
        else if (J === 1 && K === 1) { st.Q = lnot(st.Q); st.Qbar = lnot(st.Qbar); }
      }
      st.prevClk = EN;
      return { Q: st.Q, Qbar: st.Qbar };
    }

    // ─── D Flip-Flop (Configurable Trigger, Async CLR/SET) ───
    case 'ff_d': {
      const D = inputs['D'] ?? 0;
      const CLK = inputs['CLK'] ?? inputs['clk'] ?? 0;
      const CLR = inputs['CLR'] ?? inputs['clr'] ?? 0; // async clear
      const SET = inputs['SET'] ?? inputs['set'] ?? inputs['PRE'] ?? inputs['pre'] ?? 0; // async preset
      const trigger = comp.params.triggerType ?? 'rising_edge';
      const st = getState(id);

      if (CLR === 1) {
        st.Q = 0; st.Qbar = 1;
      } else if (SET === 1) {
        st.Q = 1; st.Qbar = 0;
      } else if (isClockTriggered(st, CLK, trigger, risingEdge)) {
        st.Q = D; st.Qbar = lnot(D);
      }
      st.prevClk = CLK;
      return { Q: st.Q, Qbar: st.Qbar };
    }

    // ─── T Flip-Flop (Configurable Trigger, Async CLR/SET) ───
    case 'ff_t': {
      const T = inputs['T'] ?? 0;
      const CLK = inputs['CLK'] ?? inputs['clk'] ?? 0;
      const CLR = inputs['CLR'] ?? inputs['clr'] ?? 0;
      const SET = inputs['SET'] ?? inputs['set'] ?? inputs['PRE'] ?? inputs['pre'] ?? 0;
      const trigger = comp.params.triggerType ?? 'rising_edge';
      const st = getState(id);

      if (CLR === 1) {
        st.Q = 0; st.Qbar = 1;
      } else if (SET === 1) {
        st.Q = 1; st.Qbar = 0;
      } else if (isClockTriggered(st, CLK, trigger, risingEdge) && T === 1) {
        st.Q = lnot(st.Q); st.Qbar = lnot(st.Qbar);
      }
      st.prevClk = CLK;
      return { Q: st.Q, Qbar: st.Qbar };
    }

    // ─── JK Flip-Flop (Clock Controlled, Configurable Trigger, Async CLR/SET) ───
    case 'ff_jk': {
      const J = inputs['J'] ?? 0;
      const K = inputs['K'] ?? 0;
      const CLK = inputs['CLK'] ?? inputs['clk'] ?? 0;
      const CLR = inputs['CLR'] ?? inputs['clr'] ?? 0;
      const SET = inputs['SET'] ?? inputs['set'] ?? inputs['PRE'] ?? inputs['pre'] ?? 0;
      const trigger = comp.params.triggerType ?? 'rising_edge';
      const st = getState(id);

      if (CLR === 1 && SET === 0) {
        st.Q = 0; st.Qbar = 1;
      } else if (SET === 1 && CLR === 0) {
        st.Q = 1; st.Qbar = 0;
      } else if (SET === 1 && CLR === 1) {
        st.Q = 'X'; st.Qbar = 'X'; // unstable/forbidden
      } else if (isClockTriggered(st, CLK, trigger, risingEdge)) {
        if (J === 1 && K === 0) { st.Q = 1; st.Qbar = 0; }
        else if (J === 0 && K === 1) { st.Q = 0; st.Qbar = 1; }
        else if (J === 1 && K === 1) { st.Q = lnot(st.Q); st.Qbar = lnot(st.Qbar); }
        // else: hold
      }
      st.prevClk = CLK;
      return { Q: st.Q, Qbar: st.Qbar };
    }

    // ─── SR Flip-Flop (Clock Controlled, Configurable Trigger, Async CLR/SET) ───
    case 'ff_sr': {
      const S = inputs['S'] ?? 0;
      const R = inputs['R'] ?? 0;
      const CLK = inputs['CLK'] ?? inputs['clk'] ?? 0;
      const CLR = inputs['CLR'] ?? inputs['clr'] ?? 0;
      const SET = inputs['SET'] ?? inputs['set'] ?? inputs['PRE'] ?? inputs['pre'] ?? 0;
      const trigger = comp.params.triggerType ?? 'rising_edge';
      const st = getState(id);

      if (CLR === 1 && SET === 0) {
        st.Q = 0; st.Qbar = 1;
      } else if (SET === 1 && CLR === 0) {
        st.Q = 1; st.Qbar = 0;
      } else if (SET === 1 && CLR === 1) {
        st.Q = 'X'; st.Qbar = 'X'; // forbidden
      } else if (isClockTriggered(st, CLK, trigger, risingEdge)) {
        if (S === 1 && R === 0) { st.Q = 1; st.Qbar = 0; }
        else if (S === 0 && R === 1) { st.Q = 0; st.Qbar = 1; }
        else if (S === 1 && R === 1) { st.Q = 'X'; st.Qbar = 'X'; } // forbidden
        // else: hold
      }
      st.prevClk = CLK;
      return { Q: st.Q, Qbar: st.Qbar };
    }

    // ─── 4-bit Binary Counter (Rising edge) ──────────────────
    case 'counter_4bit': {
      const CLK = inputs['CLK'] ?? inputs['clk'] ?? 0;
      const CLR = inputs['CLR'] ?? 0;
      const EN = inputs['EN'] ?? inputs['en'] ?? 1;
      const st = getState(id);
      if (CLR === 1) { st.count = 0; }
      else if (risingEdge && st.prevClk === 0 && CLK === 1 && EN === 1) {
        st.count = (st.count + 1) % 16;
      }
      st.prevClk = CLK;
      const c = st.count;
      return {
        Q0: (c & 1) ? 1 : 0,
        Q1: (c & 2) ? 1 : 0,
        Q2: (c & 4) ? 1 : 0,
        Q3: (c & 8) ? 1 : 0,
        TC: c === 15 ? 1 : 0,
      };
    }

    // ─── 2-to-4 Decoder ──────────────────────────────────────
    case 'decoder_2to4': {
      const A0 = inputs['A0'] ?? 0;
      const A1 = inputs['A1'] ?? 0;
      const EN = inputs['EN'] ?? inputs['en'] ?? 1;
      const idx = ((A1 as number) * 2 + (A0 as number)) as number;
      const outs: Record<string, LogicLevel> = { Y0: 0, Y1: 0, Y2: 0, Y3: 0 };
      if (EN === 1 && (A0 === 0 || A0 === 1) && (A1 === 0 || A1 === 1)) {
        outs[`Y${idx}`] = 1;
      }
      return outs;
    }

    // ─── Digital I/O & Clock ─────────────────────────────────
    case 'clock_source': {
      // Output is computed based on simulation time - handled by dispatcher
      // The simState.logicState.out is set externally by the simulation dispatcher
      const currentOut = comp.simState?.logicState?.['out'] ?? 0;
      return { out: currentOut as LogicLevel };
    }
    case 'digital_input': {
      const state = (comp.params.logicState ?? 0) as LogicLevel;
      return { out: state === 1 ? 1 : 0 };
    }
    case 'digital_output': {
      // Read-only probe — just reads its input, stores for display
      const inVal = inputs['in'] ?? inputs['IN'] ?? 'Z';
      return { display: inVal };
    }
    case 'adc': {
      // Analog-to-Digital Converter
      const rawIn = comp.simState?.nodeVoltages?.['in'] ?? (inputs['in'] === 1 ? 5.0 : 0.0);
      const vMin = comp.params.vMin ?? 0.0;
      const vMax = comp.params.vMax ?? 5.0;
      const bits = Math.max(1, Math.min(16, comp.params.resolution ?? 4));
      const maxCode = (1 << bits) - 1;
      const vSpan = vMax - vMin || 1.0;
      const vClamped = Math.max(vMin, Math.min(vMax, rawIn));
      const code = Math.round(((vClamped - vMin) / vSpan) * maxCode);

      const outputs: Record<string, LogicLevel> = {};
      for (let b = 0; b < bits; b++) {
        outputs[`d${b}`] = ((code >> b) & 1) as LogicLevel;
      }
      return outputs;
    }
    case 'dac': {
      // Digital-to-Analog Converter
      const bits = Math.max(1, Math.min(16, comp.params.resolution ?? 4));
      let code = 0;
      for (let b = 0; b < bits; b++) {
        const bitVal = inputs[`d${b}`] ?? 0;
        if (bitVal === 1) {
          code |= (1 << b);
        }
      }
      const vMin = comp.params.vMin ?? 0.0;
      const vMax = comp.params.vMax ?? 5.0;
      const maxCode = (1 << bits) - 1;
      const vOut = vMin + (code / (maxCode || 1)) * (vMax - vMin);
      // simState logicState stores vOut and code for MNA buffer
      return { out: (vOut >= (vMin + vMax) / 2 ? 1 : 0) as LogicLevel };
    }

    default:
      return {};
  }
}

// ─── Digital Propagation Engine ───────────────────────────────

export interface DigitalNetworkState {
  /** componentId -> pinId -> current logic level */
  nodeLogic: Record<string, Record<string, LogicLevel>>;
}

/**
 * One-pass propagation of logic levels through the digital component graph.
 * Multiple passes may be needed for combinational loops; call this N times
 * until stable or max iterations reached.
 */
export function propagateDigitalNetwork(
  components: Record<string, ComponentInstance>,
  wireMap: Map<string, string>,       // 'compId:pinId' -> netId
  netLogic: Record<string, LogicLevel>, // netId -> current logic level
  config: SimulationConfig,
  risingEdge = false,
): Record<string, LogicLevel> {
  const updated = { ...netLogic };

  for (const comp of Object.values(components)) {
    if (!isDigitalComponent(comp.kind)) continue;

    // Gather input logic levels from net nodes
    const inputs: Record<string, LogicLevel> = {};
    for (const pin of getDigitalInputPins(comp.kind)) {
      const netId = wireMap.get(`${comp.id}:${pin}`);
      inputs[pin] = netId !== undefined ? (updated[netId] ?? 0) : 0;
    }

    // Solve output
    const outputs = solveDigitalComponent(comp, inputs, config, risingEdge);

    // Write back to net nodes
    for (const [pin, level] of Object.entries(outputs)) {
      const netId = wireMap.get(`${comp.id}:${pin}`);
      if (netId !== undefined) {
        updated[netId] = level;
      }
    }
  }

  return updated;
}

export function isDigitalComponent(kind: string): boolean {
  return [
    'gate_and', 'gate_or', 'gate_not', 'gate_nand', 'gate_nor', 'gate_xor', 'gate_xnor',
    'latch_sr', 'latch_d', 'latch_jk', 'ff_d', 'ff_t', 'ff_jk', 'ff_sr', 'counter_4bit', 'decoder_2to4',
    'clock_source', 'digital_input', 'digital_output', 'adc', 'dac',
  ].includes(kind);
}

function getDigitalInputPins(kind: string): string[] {
  switch (kind) {
    case 'gate_not': return ['A'];
    case 'gate_and': case 'gate_or': case 'gate_nand':
    case 'gate_nor': case 'gate_xor': case 'gate_xnor':
      return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    case 'latch_sr': return ['S', 'R', 'EN', 'CLK'];
    case 'latch_d': return ['D', 'EN', 'CLK'];
    case 'latch_jk': return ['J', 'K', 'EN', 'CLK'];
    case 'ff_d': return ['D', 'CLK', 'CLR', 'SET', 'PRE'];
    case 'ff_t': return ['T', 'CLK', 'CLR', 'SET', 'PRE'];
    case 'ff_jk': return ['J', 'K', 'CLK', 'CLR', 'SET', 'PRE'];
    case 'ff_sr': return ['S', 'R', 'CLK', 'CLR', 'SET', 'PRE'];
    case 'counter_4bit': return ['CLK', 'CLR', 'EN'];
    case 'decoder_2to4': return ['A0', 'A1', 'EN'];
    case 'digital_output': return ['in'];
    case 'adc': return ['in'];
    case 'dac':
      return ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12', 'd13', 'd14', 'd15'];
    case 'clock_source':
    case 'digital_input':
      return [];
    default: return [];
  }
}
