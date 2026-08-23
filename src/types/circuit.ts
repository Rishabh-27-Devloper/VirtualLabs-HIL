// ============================================================
// VirtualLab-HIL — Core Type Definitions
// ============================================================

export type ComponentKind =
  // Passives
  | 'resistor' | 'capacitor' | 'inductor' | 'ground'
  // Sources
  | 'dc_voltage' | 'ac_voltage' | 'current_source'
  // Semiconductors & ICs
  | 'diode' | 'zener' | 'bjt_npn' | 'bjt_pnp'
  | 'mosfet_n_enh' | 'mosfet_p_enh' | 'mosfet_n_dep' | 'mosfet_p_dep'
  | 'opamp' | 'ic555'
  // Digital Gates
  | 'gate_and' | 'gate_or' | 'gate_not' | 'gate_nand'
  | 'gate_nor' | 'gate_xor' | 'gate_xnor'
  // Digital Storage & Flip-Flops
  | 'latch_sr' | 'latch_d' | 'latch_jk'
  | 'ff_d' | 'ff_t' | 'ff_jk' | 'ff_sr'
  | 'counter_4bit' | 'decoder_2to4'
  // Digital I/O & Clock
  | 'clock_source' | 'digital_input' | 'digital_output'
  // Virtual Instruments
  | 'oscilloscope' | 'logic_analyzer' | 'multimeter' | 'voltmeter' | 'ammeter'
  | 'signal_generator'
  // Interactive
  | 'switch' | 'pushbutton' | 'led' | 'potentiometer'
  // Data Converters
  | 'adc' | 'dac'
  // HIL I/O
  | 'hil_ingress' | 'hil_egress';

export type PinKind =
  | 'analog'
  | 'power'
  | 'ground'
  | 'digital_in'
  | 'digital_out'
  | 'clock'
  | 'control'
  | 'hil';

export interface PinDefinition {
  id: string;
  label: string;
  kind: PinKind;
  x: number;
  y: number;
}

export interface ComponentParams {
  resistance?: number;
  capacitance?: number;
  inductance?: number;
  voltage?: number;
  frequency?: number;
  phase?: number;
  offset?: number;
  current?: number;
  waveform?: WaveformType;
  amplitude?: number;
  dutyCycle?: number;
  saturationCurrent?: number;
  thermalVoltage?: number;
  ideality?: number;
  zenerVoltage?: number;
  zenerImpedance?: number;
  beta?: number;
  earlyVoltage?: number;
  vth?: number;
  kn?: number;
  lambda?: number;
  color?: string;
  wiper?: number;
  hilPin?: string;
  hilPinType?: HilPinType;
  closed?: boolean;
  rotation?: number;
  scopeChannel?: 1 | 2 | 3 | 4;
  openLoopGain?: number;
  gbw?: number;
  vcc?: number;
  vee?: number;
  rout?: number;
  timerState?: number;
  inputCount?: number;
  // Digital I/O & Clock
  propagationDelay?: number;
  pulsePeriod?: number;
  logicState?: number;
  inputMode?: 'toggle' | 'momentary' | 'external';
  isTruthTableInput?: boolean;
  isTruthTableOutput?: boolean;
  truthTableLabel?: string;
  triggerType?: 'rising_edge' | 'falling_edge' | 'level_high' | 'level_low';
  logicAnalyzerChannel?: number;
  // Data Converters (ADC / DAC)
  resolution?: number; // 2, 4, 8, 12, 16 bits
  vMin?: number;       // Min analog voltage (V)
  vMax?: number;       // Max analog voltage / Vref (V)
}

export type WaveformType = 'sine' | 'cosine' | 'square' | 'triangle' | 'sawtooth' | 'pulse' | 'dc';
export type HilPinType = 'adc' | 'gpio_in' | 'dac' | 'pwm' | 'gpio_out';

export interface ComponentInstance {
  id: string;
  kind: ComponentKind;
  label: string;
  params: ComponentParams;
  simState?: ComponentSimState;
}

export interface ComponentSimState {
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  power?: number;
  logicState?: Record<string, LogicLevel>;
}

export type LogicLevel = 0 | 1 | 'X' | 'Z';

export interface NetNode {
  id: string;
  connectedPins: { componentId: string; pinId: string }[];
  voltage?: number;
  current?: number;
  isGround?: boolean;
}

export interface Wire {
  id: string;
  sourceComponentId: string;
  sourcePinId: string;
  targetComponentId: string;
  targetPinId: string;
  netNodeId: string;
}

export interface Netlist {
  components: Record<string, ComponentInstance>;
  wires: Wire[];
  netNodes: Record<string, NetNode>;
}

export type SimulationMode = 'virtual' | 'hil';
export type SimulationStatus = 'stopped' | 'running' | 'paused' | 'error';

export interface SimulationConfig {
  mode: SimulationMode;
  timeStep: number;
  subSteps: number;
  speedMultiplier: number;
  maxIterations: number;
  tolerance: number;
  vil: number;
  vih: number;
  vol: number;
  voh: number;
  performanceMode?: boolean;
}

export interface SimulationState {
  status: SimulationStatus;
  mode: SimulationMode;
  currentTime: number;
  stepCount: number;
  config: SimulationConfig;
  probeData: Record<string, ProbeTimeSeries>;
  logicTraces: Record<string, LogicTrace>;
  componentStates?: Record<string, ComponentSimState>;
}

export interface ProbeTimeSeries {
  label: string;
  times: Float64Array;
  values: Float32Array;
  maxPoints: number;
  head: number;
  count: number;
}

export interface LogicTrace {
  label: string;
  times: number[];
  values: LogicLevel[];
}

export interface MNAMatrix {
  A: number[][];
  z: number[];
  nodeIndex: Record<string, number>;
  vsourceIndex: Record<string, number>;
  x?: number[];
}

export interface HilIngressPacket {
  device_id: string;
  timestamp_ms: number;
  inputs: Record<string, number | 0 | 1>;
}

export interface HilEgressPacket {
  device_id: string;
  timestamp_ms: number;
  outputs: Record<string, number | 0 | 1>;
}

export interface HilPacketLog {
  id: string;
  time: string;
  type: 'rx_ingress' | 'tx_egress' | 'system';
  summary: string;
  raw: Record<string, any>;
}

export interface HilConnectionState {
  connected: boolean;
  hardwareConnected?: boolean;
  activeDevices?: string[];
  deviceId: string | null;
  serverUrl: string;
  lastPacketMs: number | null;
  roundtripMs: number | null;
  packetsPerSecond: number;
  ingressPinMap: Record<string, string>;
  egressPinMap: Record<string, string>;
  lastIngressData?: Record<string, number>;
  lastEgressData?: Record<string, number>;
  packetLogs?: HilPacketLog[];
}

export interface OscilloscopeSettings {
  channel1NodeId: string | null;
  channel2NodeId: string | null;
  channel3NodeId: string | null;
  channel4NodeId: string | null;
  enabled1: boolean;
  enabled2: boolean;
  enabled3: boolean;
  enabled4: boolean;
  timeDiv: number;
  voltDiv1: number;
  voltDiv2: number;
  voltDiv3: number;
  voltDiv4: number;
  offset1: number;
  offset2: number;
  offset3: number;
  offset4: number;
  triggerLevel: number;
  triggerChannel: 1 | 2 | 3 | 4;
  coupling1: 'DC' | 'AC' | 'GND';
  coupling2: 'DC' | 'AC' | 'GND';
  coupling3: 'DC' | 'AC' | 'GND';
  coupling4: 'DC' | 'AC' | 'GND';
  displayMode: 'overlay' | 'split_2ch' | 'split_4ch' | 'signal_analysis';
  running: boolean;
}

export interface LogicAnalyzerSettings {
  channels: (string | null)[];
  timeDiv: number;
  running: boolean;
  channelCount?: number;
}

export interface CircuitNodeData {
  componentId: string;
  kind: ComponentKind;
  label: string;
  params: ComponentParams;
  simState?: ComponentSimState;
}

export interface CircuitEdgeData {
  wireId: string;
  netNodeId: string;
  voltage?: number;
  current?: number;
}
