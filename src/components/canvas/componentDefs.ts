// ============================================================
// VirtualLab-HIL — Component Metadata & Schematics Definitions
// ============================================================

import type { ComponentKind, PinDefinition, ComponentParams, PinKind } from '@/types/circuit';

export interface ComponentMetadata {
  kind: ComponentKind;
  name: string;
  category: 'passives' | 'sources' | 'semiconductors' | 'digital' | 'instruments' | 'hil' | 'controls';
  description: string;
  defaultParams: ComponentParams;
  pins: PinDefinition[];
  width: number;
  height: number;
}

export const PIN_COLOR_MAP: Record<PinKind, { border: string; bg: string; text: string; badgeBg: string; badgeText: string; label: string }> = {
  analog: { border: '#0284c7', bg: '#0369a1', text: '#38bdf8', badgeBg: '#0284c7', badgeText: '#ffffff', label: 'Analog Signal' },
  power: { border: '#eab308', bg: '#ca8a04', text: '#facc15', badgeBg: '#eab308', badgeText: '#000000', label: 'Power (V+)' },
  ground: { border: '#64748b', bg: '#475569', text: '#94a3b8', badgeBg: '#475569', badgeText: '#ffffff', label: 'Ground (0V)' },
  digital_in: { border: '#16a34a', bg: '#15803d', text: '#4ade80', badgeBg: '#16a34a', badgeText: '#ffffff', label: 'Logic In' },
  digital_out: { border: '#65a30d', bg: '#4d7c0f', text: '#a3e635', badgeBg: '#65a30d', badgeText: '#ffffff', label: 'Logic Out' },
  clock: { border: '#9333ea', bg: '#7e22ce', text: '#c084fc', badgeBg: '#9333ea', badgeText: '#ffffff', label: 'Clock (CLK)' },
  control: { border: '#e11d48', bg: '#be123c', text: '#fb7185', badgeBg: '#e11d48', badgeText: '#ffffff', label: 'Control' },
  hil: { border: '#ea580c', bg: '#c2410c', text: '#fb923c', badgeBg: '#ea580c', badgeText: '#ffffff', label: 'ESP32 HIL' },
};

export const COMPONENT_REGISTRY: Record<ComponentKind, ComponentMetadata> = {
  // ─── Passives ─────────────────────────────────────────────
  resistor: {
    kind: 'resistor',
    name: 'Resistor',
    category: 'passives',
    description: 'Linear 2-terminal resistor with configurable resistance (Ω).',
    defaultParams: { resistance: 1000 },
    pins: [
      { id: 'p', label: '1', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '2', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 175,
    height: 95,
  },
  capacitor: {
    kind: 'capacitor',
    name: 'Capacitor',
    category: 'passives',
    description: 'Energy storage capacitor with companion model for transient analysis.',
    defaultParams: { capacitance: 10e-6 },
    pins: [
      { id: 'p', label: '+', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '-', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 185,
    height: 100,
  },
  inductor: {
    kind: 'inductor',
    name: 'Inductor',
    category: 'passives',
    description: 'Magnetic energy storage inductor for AC/transient circuits.',
    defaultParams: { inductance: 10e-3 },
    pins: [
      { id: 'p', label: '1', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '2', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 185,
    height: 100,
  },
  ground: {
    kind: 'ground',
    name: 'Ground',
    category: 'passives',
    description: 'Reference 0V potential node for the circuit netlist.',
    defaultParams: {},
    pins: [
      { id: 'p', label: 'GND', kind: 'ground', x: 0.5, y: 0 },
    ],
    width: 120,
    height: 85,
  },
  junction: {
    kind: 'junction',
    name: 'Wire Junction (Dot)',
    category: 'passives',
    description: 'Electrical junction node connecting intersecting wires together.',
    defaultParams: {},
    pins: [
      { id: 'p', label: '•', kind: 'analog', x: 0.5, y: 0.5 },
    ],
    width: 28,
    height: 28,
  },

  // ─── Sources ──────────────────────────────────────────────
  dc_voltage: {
    kind: 'dc_voltage',
    name: 'DC Voltage',
    category: 'sources',
    description: 'Constant DC voltage supply (V).',
    defaultParams: { voltage: 5.0, frequency: 10 },
    pins: [
      { id: 'p', label: 'V+', kind: 'power', x: 0.5, y: 0 },
      { id: 'n', label: 'GND', kind: 'ground', x: 0.5, y: 1 },
    ],
    width: 175,
    height: 105,
  },
  ac_voltage: {
    kind: 'ac_voltage',
    name: 'AC Voltage',
    category: 'sources',
    description: 'Sinusoidal or arbitrary waveform AC signal source.',
    defaultParams: { voltage: 5.0, frequency: 10, waveform: 'sine', phase: 0, offset: 0 },
    pins: [
      { id: 'p', label: 'SIG', kind: 'analog', x: 0.5, y: 0 },
      { id: 'n', label: 'GND', kind: 'ground', x: 0.5, y: 1 },
    ],
    width: 190,
    height: 130,
  },
  current_source: {
    kind: 'current_source',
    name: 'Current Source',
    category: 'sources',
    description: 'Constant independent DC current source (A).',
    defaultParams: { current: 0.01 },
    pins: [
      { id: 'p', label: '+', kind: 'power', x: 0.5, y: 0 },
      { id: 'n', label: '-', kind: 'ground', x: 0.5, y: 1 },
    ],
    width: 175,
    height: 105,
  },

  // ─── Semiconductors ───────────────────────────────────────
  diode: {
    kind: 'diode',
    name: 'Diode (PN Junction)',
    category: 'semiconductors',
    description: 'Non-linear Shockley diode solved iteratively via Newton-Raphson.',
    defaultParams: { saturationCurrent: 1e-14, ideality: 1.0 },
    pins: [
      { id: 'p', label: 'A', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: 'K', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 175,
    height: 95,
  },
  zener: {
    kind: 'zener',
    name: 'Zener Diode',
    category: 'semiconductors',
    description: 'Voltage clamping diode with reverse breakdown voltage (Vz).',
    defaultParams: { zenerVoltage: 5.1, saturationCurrent: 1e-14 },
    pins: [
      { id: 'p', label: 'A', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: 'K', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 175,
    height: 100,
  },
  bjt_npn: {
    kind: 'bjt_npn',
    name: 'NPN Transistor',
    category: 'semiconductors',
    description: 'NPN Bipolar Junction Transistor (Base, Collector, Emitter).',
    defaultParams: { beta: 100, saturationCurrent: 1e-14 },
    pins: [
      { id: 'base', label: 'B', kind: 'analog', x: 0, y: 0.5 },
      { id: 'collector', label: 'C', kind: 'analog', x: 1, y: 0.2 },
      { id: 'emitter', label: 'E', kind: 'analog', x: 1, y: 0.8 },
    ],
    width: 185,
    height: 110,
  },
  bjt_pnp: {
    kind: 'bjt_pnp',
    name: 'PNP Transistor',
    category: 'semiconductors',
    description: 'PNP Bipolar Junction Transistor.',
    defaultParams: { beta: 100, saturationCurrent: 1e-14 },
    pins: [
      { id: 'base', label: 'B', kind: 'analog', x: 0, y: 0.5 },
      { id: 'collector', label: 'C', kind: 'analog', x: 1, y: 0.8 },
      { id: 'emitter', label: 'E', kind: 'analog', x: 1, y: 0.2 },
    ],
    width: 185,
    height: 110,
  },
  mosfet_n_enh: {
    kind: 'mosfet_n_enh',
    name: 'N-MOSFET (Enh)',
    category: 'semiconductors',
    description: 'N-Channel enhancement mode MOSFET (Gate, Drain, Source).',
    defaultParams: { vth: 2.0, kn: 0.002 },
    pins: [
      { id: 'gate', label: 'G', kind: 'analog', x: 0, y: 0.5 },
      { id: 'drain', label: 'D', kind: 'analog', x: 1, y: 0.2 },
      { id: 'source', label: 'S', kind: 'analog', x: 1, y: 0.8 },
    ],
    width: 185,
    height: 110,
  },
  mosfet_p_enh: {
    kind: 'mosfet_p_enh',
    name: 'P-MOSFET (Enh)',
    category: 'semiconductors',
    description: 'P-Channel enhancement mode MOSFET.',
    defaultParams: { vth: -2.0, kn: 0.002 },
    pins: [
      { id: 'gate', label: 'G', kind: 'analog', x: 0, y: 0.5 },
      { id: 'drain', label: 'D', kind: 'analog', x: 1, y: 0.8 },
      { id: 'source', label: 'S', kind: 'analog', x: 1, y: 0.2 },
    ],
    width: 185,
    height: 110,
  },
  mosfet_n_dep: {
    kind: 'mosfet_n_dep',
    name: 'N-MOSFET (Dep)',
    category: 'semiconductors',
    description: 'N-Channel depletion mode MOSFET.',
    defaultParams: { vth: -1.5, kn: 0.002 },
    pins: [
      { id: 'gate', label: 'G', kind: 'analog', x: 0, y: 0.5 },
      { id: 'drain', label: 'D', kind: 'analog', x: 1, y: 0.2 },
      { id: 'source', label: 'S', kind: 'analog', x: 1, y: 0.8 },
    ],
    width: 185,
    height: 110,
  },
  mosfet_p_dep: {
    kind: 'mosfet_p_dep',
    name: 'P-MOSFET (Dep)',
    category: 'semiconductors',
    description: 'P-Channel depletion mode MOSFET.',
    defaultParams: { vth: 1.5, kn: 0.002 },
    pins: [
      { id: 'gate', label: 'G', kind: 'analog', x: 0, y: 0.5 },
      { id: 'drain', label: 'D', kind: 'analog', x: 1, y: 0.8 },
      { id: 'source', label: 'S', kind: 'analog', x: 1, y: 0.2 },
    ],
    width: 185,
    height: 110,
  },
  opamp: {
    kind: 'opamp',
    name: 'Op-Amp',
    category: 'semiconductors',
    description: 'High-gain differential operational amplifier with rail-to-rail saturation.',
    defaultParams: { openLoopGain: 100000, vcc: 15, vee: -15, rout: 50 },
    pins: [
      { id: 'inp', label: 'IN+', kind: 'analog', x: 0, y: 0.3 },
      { id: 'inn', label: 'IN-', kind: 'analog', x: 0, y: 0.7 },
      { id: 'out', label: 'OUT', kind: 'analog', x: 1, y: 0.5 },
      { id: 'vcc', label: 'V+', kind: 'power', x: 0.5, y: 0 },
      { id: 'vee', label: 'V-', kind: 'ground', x: 0.5, y: 1 },
    ],
    width: 195,
    height: 125,
  },
  ic555: {
    kind: 'ic555',
    name: 'NE555 Precision Timer IC',
    category: 'semiconductors',
    description: '8-Pin standard timer IC for astable oscillators, monostable pulse generation, and PWM.',
    defaultParams: { timerState: 0 },
    pins: [
      { id: 'gnd', label: '1:GND', kind: 'ground', x: 0, y: 0.15 },
      { id: 'trig', label: '2:TRG', kind: 'analog', x: 0, y: 0.4 },
      { id: 'out', label: '3:OUT', kind: 'analog', x: 0, y: 0.65 },
      { id: 'rst', label: '4:RST', kind: 'control', x: 0, y: 0.9 },
      { id: 'vcc', label: '8:VCC', kind: 'power', x: 1, y: 0.15 },
      { id: 'disch', label: '7:DIS', kind: 'analog', x: 1, y: 0.4 },
      { id: 'thres', label: '6:THR', kind: 'analog', x: 1, y: 0.65 },
      { id: 'ctrl', label: '5:CV', kind: 'analog', x: 1, y: 0.9 },
    ],
    width: 165,
    height: 140,
  },

  // ─── Digital I/O & Clock ────────────────────────────────
  clock_source: {
    kind: 'clock_source',
    name: 'Clock Source',
    category: 'digital',
    description: 'Digital clock signal generator with configurable frequency and duty cycle',
    defaultParams: { pulsePeriod: 0.001, dutyCycle: 50, propagationDelay: 0 },
    pins: [
      { id: 'out', label: 'CLK', kind: 'digital_out' as PinKind, x: 1, y: 0.5 },
    ],
    width: 100,
    height: 70,
  },
  digital_input: {
    kind: 'digital_input',
    name: 'Logic Input',
    category: 'digital',
    description: 'Digital logic input switch (0/1) — no external supply needed',
    defaultParams: { logicState: 0, inputMode: 'toggle', isTruthTableInput: false, truthTableLabel: '' },
    pins: [
      { id: 'out', label: 'OUT', kind: 'digital_out' as PinKind, x: 1, y: 0.5 },
    ],
    width: 100,
    height: 70,
  },
  digital_output: {
    kind: 'digital_output',
    name: 'Logic Probe',
    category: 'digital',
    description: 'Digital logic output display — shows HIGH/LOW/X state',
    defaultParams: { isTruthTableOutput: false, truthTableLabel: '' },
    pins: [
      { id: 'in', label: 'IN', kind: 'digital_in' as PinKind, x: 0, y: 0.5 },
    ],
    width: 100,
    height: 70,
  },

  // ─── Digital Gates ────────────────────────────────────────
  gate_and: {
    kind: 'gate_and',
    name: 'AND Gate',
    category: 'digital',
    description: '2-Input Logic AND gate (Out = A · B).',
    defaultParams: {},
    pins: [
      { id: 'A', label: 'A', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'B', label: 'B', kind: 'digital_in', x: 0, y: 0.7 },
      { id: 'out', label: 'Y', kind: 'digital_out', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 70,
  },
  gate_or: {
    kind: 'gate_or',
    name: 'OR Gate',
    category: 'digital',
    description: '2-Input Logic OR gate (Out = A + B).',
    defaultParams: {},
    pins: [
      { id: 'A', label: 'A', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'B', label: 'B', kind: 'digital_in', x: 0, y: 0.7 },
      { id: 'out', label: 'Y', kind: 'digital_out', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 70,
  },
  gate_not: {
    kind: 'gate_not',
    name: 'NOT Gate (Inverter)',
    category: 'digital',
    description: 'Logic inverter gate (Out = ¬A).',
    defaultParams: {},
    pins: [
      { id: 'A', label: 'A', kind: 'digital_in', x: 0, y: 0.5 },
      { id: 'out', label: 'Y', kind: 'digital_out', x: 1, y: 0.5 },
    ],
    width: 120,
    height: 60,
  },
  gate_nand: {
    kind: 'gate_nand',
    name: 'NAND Gate',
    category: 'digital',
    description: '2-Input Logic NAND gate.',
    defaultParams: {},
    pins: [
      { id: 'A', label: 'A', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'B', label: 'B', kind: 'digital_in', x: 0, y: 0.7 },
      { id: 'out', label: 'Y', kind: 'digital_out', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 70,
  },
  gate_nor: {
    kind: 'gate_nor',
    name: 'NOR Gate',
    category: 'digital',
    description: '2-Input Logic NOR gate.',
    defaultParams: {},
    pins: [
      { id: 'A', label: 'A', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'B', label: 'B', kind: 'digital_in', x: 0, y: 0.7 },
      { id: 'out', label: 'Y', kind: 'digital_out', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 70,
  },
  gate_xor: {
    kind: 'gate_xor',
    name: 'XOR Gate',
    category: 'digital',
    description: '2-Input Exclusive OR gate.',
    defaultParams: {},
    pins: [
      { id: 'A', label: 'A', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'B', label: 'B', kind: 'digital_in', x: 0, y: 0.7 },
      { id: 'out', label: 'Y', kind: 'digital_out', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 70,
  },
  gate_xnor: {
    kind: 'gate_xnor',
    name: 'XNOR Gate',
    category: 'digital',
    description: '2-Input Exclusive NOR gate.',
    defaultParams: {},
    pins: [
      { id: 'A', label: 'A', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'B', label: 'B', kind: 'digital_in', x: 0, y: 0.7 },
      { id: 'out', label: 'Y', kind: 'digital_out', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 70,
  },

  // ─── Digital Storage & Sequential ─────────────────────────
  latch_sr: {
    kind: 'latch_sr',
    name: 'SR Latch',
    category: 'digital',
    description: 'Set-Reset Bistable Latch.',
    defaultParams: {},
    pins: [
      { id: 'S', label: 'S', kind: 'control', x: 0, y: 0.3 },
      { id: 'R', label: 'R', kind: 'control', x: 0, y: 0.7 },
      { id: 'Q', label: 'Q', kind: 'digital_out', x: 1, y: 0.3 },
      { id: 'Qbar', label: 'Q̄', kind: 'digital_out', x: 1, y: 0.7 },
    ],
    width: 140,
    height: 80,
  },
  latch_d: {
    kind: 'latch_d',
    name: 'D Latch',
    category: 'digital',
    description: 'Data Latch with Enable control.',
    defaultParams: {},
    pins: [
      { id: 'D', label: 'D', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'EN', label: 'EN', kind: 'control', x: 0, y: 0.7 },
      { id: 'Q', label: 'Q', kind: 'digital_out', x: 1, y: 0.3 },
      { id: 'Qbar', label: 'Q̄', kind: 'digital_out', x: 1, y: 0.7 },
    ],
    width: 140,
    height: 80,
  },
  latch_jk: {
    kind: 'latch_jk',
    name: 'JK Latch',
    category: 'digital',
    description: 'JK Latch with toggle capability.',
    defaultParams: {},
    pins: [
      { id: 'J', label: 'J', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'K', label: 'K', kind: 'digital_in', x: 0, y: 0.7 },
      { id: 'Q', label: 'Q', kind: 'digital_out', x: 1, y: 0.3 },
      { id: 'Qbar', label: 'Q̄', kind: 'digital_out', x: 1, y: 0.7 },
    ],
    width: 140,
    height: 80,
  },
  ff_d: {
    kind: 'ff_d',
    name: 'D Flip-Flop',
    category: 'digital',
    description: 'Edge-triggered Data Flip-Flop with async CLR.',
    defaultParams: {},
    pins: [
      { id: 'D', label: 'D', kind: 'digital_in', x: 0, y: 0.25 },
      { id: 'CLK', label: 'CLK', kind: 'clock', x: 0, y: 0.5 },
      { id: 'CLR', label: 'CLR', kind: 'control', x: 0, y: 0.75 },
      { id: 'Q', label: 'Q', kind: 'digital_out', x: 1, y: 0.3 },
      { id: 'Qbar', label: 'Q̄', kind: 'digital_out', x: 1, y: 0.7 },
    ],
    width: 150,
    height: 90,
  },
  ff_t: {
    kind: 'ff_t',
    name: 'T Flip-Flop',
    category: 'digital',
    description: 'Edge-triggered Toggle Flip-Flop.',
    defaultParams: { triggerType: 'rising_edge' },
    pins: [
      { id: 'T', label: 'T', kind: 'digital_in', x: 0, y: 0.3 },
      { id: 'CLK', label: 'CLK', kind: 'clock', x: 0, y: 0.7 },
      { id: 'Q', label: 'Q', kind: 'digital_out', x: 1, y: 0.3 },
      { id: 'Qbar', label: 'Q̄', kind: 'digital_out', x: 1, y: 0.7 },
    ],
    width: 140,
    height: 80,
  },
  ff_jk: {
    kind: 'ff_jk',
    name: 'JK Flip-Flop',
    category: 'digital',
    description: 'Clock-controlled JK Flip-Flop with configurable Edge/Level triggering & async CLR/SET.',
    defaultParams: { triggerType: 'rising_edge' },
    pins: [
      { id: 'J', label: 'J', kind: 'digital_in', x: 0, y: 0.2 },
      { id: 'CLK', label: 'CLK', kind: 'clock', x: 0, y: 0.4 },
      { id: 'K', label: 'K', kind: 'digital_in', x: 0, y: 0.6 },
      { id: 'CLR', label: 'CLR', kind: 'control', x: 0, y: 0.8 },
      { id: 'SET', label: 'SET', kind: 'control', x: 0.5, y: 0 },
      { id: 'Q', label: 'Q', kind: 'digital_out', x: 1, y: 0.3 },
      { id: 'Qbar', label: 'Q̄', kind: 'digital_out', x: 1, y: 0.7 },
    ],
    width: 155,
    height: 100,
  },
  ff_sr: {
    kind: 'ff_sr',
    name: 'SR Flip-Flop',
    category: 'digital',
    description: 'Clock-controlled SR Flip-Flop with configurable Edge/Level triggering & async CLR/SET.',
    defaultParams: { triggerType: 'rising_edge' },
    pins: [
      { id: 'S', label: 'S', kind: 'control', x: 0, y: 0.2 },
      { id: 'CLK', label: 'CLK', kind: 'clock', x: 0, y: 0.4 },
      { id: 'R', label: 'R', kind: 'control', x: 0, y: 0.6 },
      { id: 'CLR', label: 'CLR', kind: 'control', x: 0, y: 0.8 },
      { id: 'SET', label: 'SET', kind: 'control', x: 0.5, y: 0 },
      { id: 'Q', label: 'Q', kind: 'digital_out', x: 1, y: 0.3 },
      { id: 'Qbar', label: 'Q̄', kind: 'digital_out', x: 1, y: 0.7 },
    ],
    width: 155,
    height: 100,
  },
  counter_4bit: {
    kind: 'counter_4bit',
    name: '4-Bit Binary Counter',
    category: 'digital',
    description: 'Synchronous 4-bit up-counter with Terminal Count (TC).',
    defaultParams: {},
    pins: [
      { id: 'CLK', label: 'CLK', kind: 'clock', x: 0, y: 0.25 },
      { id: 'EN', label: 'EN', kind: 'control', x: 0, y: 0.5 },
      { id: 'CLR', label: 'CLR', kind: 'control', x: 0, y: 0.75 },
      { id: 'Q0', label: 'Q0', kind: 'digital_out', x: 1, y: 0.15 },
      { id: 'Q1', label: 'Q1', kind: 'digital_out', x: 1, y: 0.35 },
      { id: 'Q2', label: 'Q2', kind: 'digital_out', x: 1, y: 0.55 },
      { id: 'Q3', label: 'Q3', kind: 'digital_out', x: 1, y: 0.75 },
      { id: 'TC', label: 'TC', kind: 'digital_out', x: 1, y: 0.9 },
    ],
    width: 170,
    height: 120,
  },
  decoder_2to4: {
    kind: 'decoder_2to4',
    name: '2-to-4 Decoder',
    category: 'digital',
    description: 'Binary address decoder (A0, A1 -> Y0..Y3).',
    defaultParams: {},
    pins: [
      { id: 'A0', label: 'A0', kind: 'digital_in', x: 0, y: 0.25 },
      { id: 'A1', label: 'A1', kind: 'digital_in', x: 0, y: 0.5 },
      { id: 'EN', label: 'EN', kind: 'control', x: 0, y: 0.75 },
      { id: 'Y0', label: 'Y0', kind: 'digital_out', x: 1, y: 0.15 },
      { id: 'Y1', label: 'Y1', kind: 'digital_out', x: 1, y: 0.4 },
      { id: 'Y2', label: 'Y2', kind: 'digital_out', x: 1, y: 0.65 },
      { id: 'Y3', label: 'Y3', kind: 'digital_out', x: 1, y: 0.9 },
    ],
    width: 160,
    height: 110,
  },

  // ─── Virtual Instruments ──────────────────────────────────
  oscilloscope: {
    kind: 'oscilloscope',
    name: 'Oscilloscope Probe',
    category: 'instruments',
    description: 'High-impedance probe connecting to virtual dual-channel scope.',
    defaultParams: {},
    pins: [
      { id: 'p', label: 'PROBE', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: 'GND', kind: 'ground', x: 1, y: 0.5 },
    ],
    width: 220,
    height: 145,
  },
  logic_analyzer: {
    kind: 'logic_analyzer',
    name: 'Logic Analyzer Pod',
    category: 'instruments',
    description: 'Digital logic pod for capturing timing diagrams.',
    defaultParams: {},
    pins: [
      { id: 'p', label: 'SIG', kind: 'digital_in', x: 0, y: 0.5 },
      { id: 'n', label: 'GND', kind: 'ground', x: 1, y: 0.5 },
    ],
    width: 140,
    height: 70,
  },
  multimeter: {
    kind: 'multimeter',
    name: 'Digital Multimeter',
    category: 'instruments',
    description: 'Measures DC/AC voltage, branch current, and resistance with dynamic LCD readout.',
    defaultParams: {},
    pins: [
      { id: 'p', label: 'V+', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: 'COM', kind: 'ground', x: 1, y: 0.5 },
    ],
    width: 170,
    height: 95,
  },
  voltmeter: {
    kind: 'voltmeter',
    name: 'DC Voltmeter',
    category: 'instruments',
    description: 'High-impedance (10MΩ) DC voltage meter with live digital display.',
    defaultParams: {},
    pins: [
      { id: 'p', label: '+', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '-', kind: 'ground', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 75,
  },
  ammeter: {
    kind: 'ammeter',
    name: 'DC Ammeter',
    category: 'instruments',
    description: 'Ultra-low impedance (10µΩ) series branch current meter with live digital display.',
    defaultParams: {},
    pins: [
      { id: 'p', label: '+', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '-', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 130,
    height: 75,
  },
  signal_generator: {
    kind: 'signal_generator',
    name: 'Function Generator',
    category: 'instruments',
    description: 'Synthesizes Sine, Cosine, Square, Triangle, Sawtooth, Pulse waveforms.',
    defaultParams: { waveform: 'sine', amplitude: 5, frequency: 1000, offset: 0, dutyCycle: 0.5 },
    pins: [
      { id: 'out', label: 'OUT', kind: 'analog', x: 1, y: 0.3 },
      { id: 'gnd', label: 'GND', kind: 'ground', x: 1, y: 0.7 },
    ],
    width: 150,
    height: 80,
  },
  ohmmeter: {
    kind: 'ohmmeter',
    name: 'OhmMeter',
    category: 'instruments',
    description: 'Measures electrical resistance across two test leads with autoranging LCD display.',
    defaultParams: { ohmmeterRange: 'auto' },
    pins: [
      { id: 'p', label: 'Ω+', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: 'COM', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 170,
    height: 95,
  },

  // ─── Interactive Controls & Indicators ────────────────────
  speaker: {
    kind: 'speaker',
    name: 'Audio Speaker',
    category: 'controls',
    description: 'Dynamic voice-coil speaker (4Ω/8Ω/16Ω/32Ω) with Web Audio sound playback.',
    defaultParams: { resistance: 8, speakerVolume: 50, speakerMuted: false },
    pins: [
      { id: 'p', label: '+', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '-', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 165,
    height: 95,
  },
  switch: {
    kind: 'switch',
    name: 'SPST Toggle Switch',
    category: 'controls',
    description: 'Clickable toggle switch (Open ~∞Ω, Closed ~0Ω).',
    defaultParams: { closed: false },
    pins: [
      { id: 'p', label: '1', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '2', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 120,
    height: 60,
  },
  pushbutton: {
    kind: 'pushbutton',
    name: 'Momentary Pushbutton',
    category: 'controls',
    description: 'Press-and-hold momentary contact switch.',
    defaultParams: { closed: false },
    pins: [
      { id: 'p', label: '1', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: '2', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 120,
    height: 60,
  },
  led: {
    kind: 'led',
    name: 'Indicator LED',
    category: 'controls',
    description: 'Visual indicator LED that illuminates proportionally to voltage.',
    defaultParams: { color: '#22c55e' },
    pins: [
      { id: 'p', label: 'A (+)', kind: 'analog', x: 0, y: 0.5 },
      { id: 'n', label: 'K (-)', kind: 'ground', x: 1, y: 0.5 },
    ],
    width: 120,
    height: 60,
  },
  potentiometer: {
    kind: 'potentiometer',
    name: 'Potentiometer',
    category: 'controls',
    description: '3-Terminal variable voltage divider with adjustable wiper (0..1).',
    defaultParams: { resistance: 10000, wiper: 0.5 },
    pins: [
      { id: 'p', label: '1', kind: 'power', x: 0, y: 0.3 },
      { id: 'n', label: '3', kind: 'ground', x: 0, y: 0.7 },
      { id: 'wiper', label: 'W', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 140,
    height: 80,
  },

  // ─── Data Converters (ADC / DAC) ──────────────────────────
  adc: {
    kind: 'adc',
    name: 'ADC Converter',
    category: 'digital',
    description: 'Analog-to-Digital Converter with configurable bit resolution and voltage range (Vmin..Vmax).',
    defaultParams: { resolution: 4, vMin: 0.0, vMax: 5.0 },
    pins: [
      { id: 'in', label: 'IN', kind: 'analog', x: 0, y: 0.5 },
      { id: 'd0', label: 'D0', kind: 'digital_out', x: 1, y: 0.2 },
      { id: 'd1', label: 'D1', kind: 'digital_out', x: 1, y: 0.4 },
      { id: 'd2', label: 'D2', kind: 'digital_out', x: 1, y: 0.6 },
      { id: 'd3', label: 'D3', kind: 'digital_out', x: 1, y: 0.8 },
    ],
    width: 175,
    height: 120,
  },
  dac: {
    kind: 'dac',
    name: 'DAC Converter',
    category: 'digital',
    description: 'Digital-to-Analog Converter with configurable input bit resolution and reconstructed voltage range (Vmin..Vmax).',
    defaultParams: { resolution: 4, vMin: 0.0, vMax: 5.0 },
    pins: [
      { id: 'd0', label: 'D0', kind: 'digital_in', x: 0, y: 0.2 },
      { id: 'd1', label: 'D1', kind: 'digital_in', x: 0, y: 0.4 },
      { id: 'd2', label: 'D2', kind: 'digital_in', x: 0, y: 0.6 },
      { id: 'd3', label: 'D3', kind: 'digital_in', x: 0, y: 0.8 },
      { id: 'out', label: 'OUT', kind: 'analog', x: 1, y: 0.5 },
    ],
    width: 175,
    height: 120,
  },

  // ─── HIL Hardware I/O Pins ────────────────────────────────
  hil_ingress: {
    kind: 'hil_ingress',
    name: 'ESP32 Ingress Pin',
    category: 'hil',
    description: 'Maps physical sensor pin on ESP32 (ADC / GPIO) into virtual canvas.',
    defaultParams: { hilPin: 'A0', hilPinType: 'adc' },
    pins: [
      { id: 'out', label: 'SIG', kind: 'hil', x: 1, y: 0.5 },
    ],
    width: 160,
    height: 75,
  },
  hil_egress: {
    kind: 'hil_egress',
    name: 'ESP32 Egress Pin',
    category: 'hil',
    description: 'Routes simulated circuit node voltage to physical actuator pin (DAC / PWM / GPIO).',
    defaultParams: { hilPin: 'DAC0', hilPinType: 'dac' },
    pins: [
      { id: 'in', label: 'IN', kind: 'hil', x: 0, y: 0.5 },
    ],
    width: 160,
    height: 75,
  },
};

/**
 * Returns dynamic pin definitions for a component instance,
 * taking into account custom configurations like logic gate inputCount.
 */
export function getComponentPins(
  kind: ComponentKind,
  params?: ComponentParams,
): PinDefinition[] {
  const meta = COMPONENT_REGISTRY[kind];
  if (!meta) return [];

  // Dynamic pins for ADC
  if (kind === 'adc') {
    const bits = Math.max(1, Math.min(16, params?.resolution ?? 4));
    const pins: PinDefinition[] = [
      { id: 'in', label: 'IN', kind: 'analog', x: 0, y: 0.5 },
    ];
    for (let b = 0; b < bits; b++) {
      const y = bits === 1 ? 0.5 : (b + 1) / (bits + 1);
      const isLsb = b === 0;
      const isMsb = b === bits - 1;
      const label = `D${b}${isLsb ? ' (LSB)' : isMsb ? ' (MSB)' : ''}`;
      pins.push({
        id: `d${b}`,
        label,
        kind: 'digital_out',
        x: 1,
        y,
      });
    }
    return pins;
  }

  // Dynamic pins for DAC
  if (kind === 'dac') {
    const bits = Math.max(1, Math.min(16, params?.resolution ?? 4));
    const pins: PinDefinition[] = [];
    for (let b = 0; b < bits; b++) {
      const y = bits === 1 ? 0.5 : (b + 1) / (bits + 1);
      const isLsb = b === 0;
      const isMsb = b === bits - 1;
      const label = `D${b}${isLsb ? ' (LSB)' : isMsb ? ' (MSB)' : ''}`;
      pins.push({
        id: `d${b}`,
        label,
        kind: 'digital_in',
        x: 0,
        y,
      });
    }
    pins.push({ id: 'out', label: 'OUT', kind: 'analog', x: 1, y: 0.5 });
    return pins;
  }

  // Configurable multi-input logic gates
  if (
    kind === 'gate_and' ||
    kind === 'gate_or' ||
    kind === 'gate_nand' ||
    kind === 'gate_nor' ||
    kind === 'gate_xor' ||
    kind === 'gate_xnor'
  ) {
    const count = Math.max(2, Math.min(8, params?.inputCount ?? 2));
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const pins: PinDefinition[] = [];

    for (let i = 0; i < count; i++) {
      const y = count === 1 ? 0.5 : (i + 1) / (count + 1);
      pins.push({
        id: letters[i],
        label: letters[i],
        kind: 'digital_in',
        x: 0,
        y,
      });
    }

    pins.push({
      id: 'out',
      label: 'Y',
      kind: 'digital_out',
      x: 1,
      y: 0.5,
    });

    return pins;
  }

  return meta.pins;
}

/**
 * Returns dynamic dimensions (width, height) for a component instance.
 */
export function getComponentDimensions(
  kind: ComponentKind,
  params?: ComponentParams,
): { width: number; height: number } {
  const meta = COMPONENT_REGISTRY[kind];
  if (!meta) return { width: 140, height: 80 };

  if (kind === 'adc' || kind === 'dac') {
    const bits = Math.max(1, Math.min(16, params?.resolution ?? 4));
    const dynamicHeight = Math.max(85, 32 + bits * 22);
    return { width: 175, height: dynamicHeight };
  }

  if (
    kind === 'gate_and' ||
    kind === 'gate_or' ||
    kind === 'gate_nand' ||
    kind === 'gate_nor' ||
    kind === 'gate_xor' ||
    kind === 'gate_xnor'
  ) {
    const count = Math.max(2, Math.min(8, params?.inputCount ?? 2));
    const dynamicHeight = Math.max(70, 30 + count * 22);
    return { width: 135, height: dynamicHeight };
  }

  return { width: meta.width || 150, height: meta.height || 80 };
}
