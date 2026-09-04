// ============================================================
// VirtualLab-HIL — Simulation Dispatcher (With Error Halting & Speed Multiplier)
// ============================================================

import {
  solveMNA, getPinNetId, evaluateWaveform,
} from './mnaSolver';
import {
  propagateDigitalNetwork, voltageToLogic, logicToVoltage,
  isDigitalComponent, resetDigitalState,
  clearDelayQueue, processDelayQueue,
} from './digitalSolver';
import type {
  Netlist, SimulationConfig, SimulationState,
  HilIngressPacket, HilEgressPacket, HilConnectionState, HilPacketLog,
  LogicLevel, ComponentInstance, ComponentSimState,
} from '@/types/circuit';
import type { CircuitDiagnosticError } from './circuitValidator';
import { COMPONENT_REGISTRY } from '@/components/canvas/componentDefs';
import { logger } from '@/utils/logger';

export const DEFAULT_CONFIG: SimulationConfig = {
  mode: 'virtual',
  timeStep: 1 / 60,
  subSteps: 16,
  speedMultiplier: 0.05, // 0.05x (Smooth Slow-Mo default) to 5.0x
  maxIterations: 100,
  tolerance: 1e-6,
  vil: 0.8,
  vih: 2.0,
  vol: 0.0,
  voh: 5.0,
};

const MAX_PROBE_POINTS = 8192;

export class SimulationDispatcher {
  private netlist: Netlist;
  private config: SimulationConfig;
  private state: SimulationState;

  private animFrameId: number | null = null;
  private lastTimestamp: number | null = null;

  private prevX: number[] | null = null;
  private prevDt = 1 / 60 / 16;

  private wireMap: Map<string, string> = new Map();
  private netLogic: Record<string, LogicLevel> = {};
  private prevClkLevels: Record<string, LogicLevel> = {};
  private inductorCurrents: Record<string, number> = {};
  private activeHILOverrides: Record<string, number> = {};
  private netRmsAvg: Record<string, number> = {};
  private hasScopeComponents = false;

  private ws: WebSocket | null = null;
  private lastEgressSentTime = 0;
  private hilState: HilConnectionState = {
    connected: false,
    deviceId: null,
    serverUrl: 'wss://virtuallabs-hil.onrender.com/ws/ui',
    lastPacketMs: null,
    roundtripMs: null,
    packetsPerSecond: 0,
    ingressPinMap: {},
    egressPinMap: {},
    lastIngressData: {},
    lastEgressData: {},
    packetLogs: [],
  };
  private hilPacketTimes: number[] = [];
  private hilReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private onStateUpdate: ((state: SimulationState, hilState: HilConnectionState) => void) | null = null;
  private onErrorCallback: ((err: CircuitDiagnosticError) => void) | null = null;

  private lowFpsStreak = 0;
  private heavyComputeStreak = 0;

  constructor(
    netlist: Netlist,
    config: Partial<SimulationConfig> = {},
    onStateUpdate?: (state: SimulationState, hilState: HilConnectionState) => void,
    onErrorCallback?: (err: CircuitDiagnosticError) => void,
  ) {
    this.netlist = netlist;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hasScopeComponents = Object.values(netlist.components).some((c) => c.kind === 'oscilloscope');
    this.onStateUpdate = onStateUpdate ?? null;
    this.onErrorCallback = onErrorCallback ?? null;
    this.state = this._makeInitialState();
    this._buildWireMap();
  }

  updateNetlist(netlist: Netlist) {
    this.netlist = netlist;
    this.hasScopeComponents = Object.values(netlist.components).some((c) => c.kind === 'oscilloscope');
    this._buildWireMap();
    this._resetProbes();
  }

  setRecordingProbes(enabled: boolean) {
    this.config.recordProbes = enabled;
    this.state.config.recordProbes = enabled;
    if (!enabled) {
      this._resetProbes();
    }
  }

  updateConfig(config: Partial<SimulationConfig>) {
    this.config = { ...this.config, ...config };
    this.state.config = this.config;
    if (config.mode !== undefined) {
      this.state.mode = config.mode;
    }
    this._notifyUpdate();
  }

  private _logHILPacket(type: 'rx_ingress' | 'tx_egress' | 'system', summary: string, raw: Record<string, any>) {
    const logs = this.hilState.packetLogs || [];
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const newLog: HilPacketLog = {
      id: Math.random().toString(36).substring(2, 9),
      time: timeStr,
      type,
      summary,
      raw,
    };
    this.hilState.packetLogs = [newLog, ...logs.slice(0, 40)];
  }

  start() {
    if (this.state.status === 'running') return;

    const compCount = Object.keys(this.netlist.components).length;
    const wireCount = this.netlist.wires.length;
    const netCount = Object.keys(this.netlist.netNodes).length;

    logger.info('engine', `Run clicked — Pre-flight Check: [${compCount} parts, ${wireCount} wires, ${netCount} nets, speed=${this.config.speedMultiplier}x]`);

    if (compCount === 0) {
      logger.warn('engine', 'Canvas is currently empty. Place components or load a preset.');
    } else if (wireCount === 0 && compCount > 1) {
      logger.warn('engine', 'No wires detected connecting components. Connect terminals to close current loops.');
    }

    this.state.status = 'running';
    this.lastTimestamp = null;
    logger.success('engine', `Simulation engine STARTED (${this.config.mode.toUpperCase()} MODE, speed=${this.config.speedMultiplier}x).`);
    this._notifyUpdate();

    // Start unified continuous simulation loop for both virtual and HIL modes
    this.animFrameId = requestAnimationFrame(this._virtualLoop.bind(this));
  }

  pause() {
    this.state.status = 'paused';
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    logger.info('engine', `Simulation PAUSED at t=${this.state.currentTime.toFixed(3)}s (step #${this.state.stepCount}).`);
    this._notifyUpdate();
  }

  stop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.state.status = 'stopped';
    this.state.currentTime = 0;
    this.state.stepCount = 0;
    this.prevX = null;
    resetDigitalState();
    clearDelayQueue();
    this.netLogic = {};
    this.inductorCurrents = {};
    this.activeHILOverrides = {};
    this._resetProbes();
    logger.info('engine', 'Simulation STOPPED and clock reset to 0.000s.');
    this._notifyUpdate();
  }

  reset() {
    this.stop();
    this.state = this._makeInitialState();
    this._notifyUpdate();
  }

  connectHIL(serverUrl: string, deviceId: string) {
    if (this.hilReconnectTimer) {
      clearTimeout(this.hilReconnectTimer);
      this.hilReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.hilState.serverUrl = serverUrl;
    this.hilState.deviceId = deviceId;
    this._logHILPacket('system', `Connecting to WebSocket: ${serverUrl} (${deviceId})`, { serverUrl, deviceId });
    logger.info('hil', `Connecting WebSocket to HIL Gateway: ${serverUrl} (Target: ${deviceId})...`);

    try {
      const socket = new WebSocket(serverUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.hilState.connected = true;
        socket.send(JSON.stringify({ type: 'subscribe', device_id: deviceId }));
        this._logHILPacket('system', `Connected to Gateway! Subscribing to "${deviceId}"...`, { deviceId });
        logger.info('hil', `Connected to Gateway! Subscribing to hardware device "${deviceId}"...`);
        this._notifyUpdate();
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.hilState.connected = false;
        this.hilState.hardwareConnected = false;
        this.hilState.roundtripMs = null;
        this.ws = null;
        this._logHILPacket('system', `WebSocket disconnected from Gateway (${serverUrl})`, { serverUrl });
        logger.warn('hil', `HIL WebSocket disconnected from ${serverUrl}.`);

        if (this.config.mode === 'hil') {
          this.config.mode = 'virtual';
          this.state.mode = 'virtual';
          this.stop();
          if (this.onErrorCallback) {
            this.onErrorCallback({
              title: 'HIL Gateway Disconnected',
              message: 'Lost connection to HIL Gateway backend server. Switched back to Virtual mode and stopped simulation.',
              severity: 'warning',
              details: [
                'Ensure the FastAPI backend server is running on port 8000.',
                'Check network connection to the Gateway IP address.'
              ]
            });
          }
        }
        this._notifyUpdate();
      };

      socket.onerror = (err) => {
        if (this.ws !== socket) return;
        this.hilState.connected = false;
        this.hilState.hardwareConnected = false;
        this._logHILPacket('system', `WebSocket error connecting to ${serverUrl}`, {});
        logger.error('hil', `HIL WebSocket connection error to ${serverUrl}.`, err);

        if (this.config.mode === 'hil') {
          this.config.mode = 'virtual';
          this.state.mode = 'virtual';
          this.stop();
          if (this.onErrorCallback) {
            this.onErrorCallback({
              title: 'HIL Connection Error',
              message: `Could not connect to HIL Gateway at ${serverUrl}. Switched back to Virtual mode.`,
              severity: 'warning',
              details: [
                'Make sure backend is started: python -m uvicorn backend.main:app --port 8000',
                'Check that the server URL in HIL settings is correct.'
              ]
            });
          }
        }
        this._notifyUpdate();
      };

      socket.onmessage = (event: MessageEvent) => {
        if (this.ws !== socket) return;
        try {
          const packet = JSON.parse(event.data as string);
          if (!packet || typeof packet !== 'object') return;

          if (packet.status === 'subscribed' || packet.type === 'subscribed') {
            const isHwConnected = !!packet.hardware_connected;
            this.hilState.hardwareConnected = isHwConnected;
            this.hilState.activeDevices = packet.active_devices || [];

            if (!isHwConnected) {
              this._logHILPacket('system', `Gateway connected, but no ESP32 hardware detected.`, packet);
              logger.warn('hil', `Connected to Gateway, but no physical ESP32 hardware is active.`);

              if (this.config.mode === 'hil') {
                this.config.mode = 'virtual';
                this.state.mode = 'virtual';
                this.stop();
                this.disconnectHIL();
                if (this.onErrorCallback) {
                  this.onErrorCallback({
                    title: 'ESP32 Hardware Offline',
                    message: 'The HIL backend Gateway is online, but no physical ESP32 hardware is connected. Switched back to Virtual mode.',
                    severity: 'warning',
                    details: [
                      'Power on your ESP32 board and check its Wi-Fi connection.',
                      'Check the ESP32 Serial Monitor to ensure it connected to the Gateway.',
                      'You can use the Hardware Simulator tab in the HIL menu to test without hardware.'
                    ]
                  });
                }
              }
              this._notifyUpdate();
              return;
            }

            this._logHILPacket('system', `ESP32 hardware verified for "${packet.device_id}"`, packet);
            logger.success('hil', `ESP32 hardware verified online for device "${packet.device_id}".`);
            this._notifyUpdate();
            return;
          }

          if (packet.type === 'device_status') {
            this.hilState.activeDevices = packet.active_devices || [];
            if (packet.connected === false) {
              this.hilState.hardwareConnected = false;
              this._logHILPacket('system', `ESP32 device "${packet.device_id}" disconnected.`, packet);
              logger.warn('hil', `ESP32 device "${packet.device_id}" disconnected from Gateway.`);

              if (this.config.mode === 'hil') {
                this.config.mode = 'virtual';
                this.state.mode = 'virtual';
                this.stop();
                this.disconnectHIL();
                if (this.onErrorCallback) {
                  this.onErrorCallback({
                    title: 'ESP32 Hardware Disconnected',
                    message: `Physical ESP32 device "${packet.device_id}" disconnected. Switched back to Virtual mode and stopped simulation.`,
                    severity: 'warning',
                    details: [
                      'Check ESP32 power and Wi-Fi connection.',
                      'Check Serial Monitor on ESP32 to verify Wi-Fi status.'
                    ]
                  });
                }
              }
              this._notifyUpdate();
            } else if (packet.connected === true) {
              this.hilState.hardwareConnected = true;
              this._logHILPacket('system', `ESP32 device "${packet.device_id}" is now ONLINE.`, packet);
              logger.success('hil', `ESP32 device "${packet.device_id}" connected to Gateway.`);
              this._notifyUpdate();
            }
            return;
          }

          if (packet.inputs && typeof packet.inputs === 'object') {
            this.hilState.hardwareConnected = true;
            this._onHILPacket(packet as HilIngressPacket);
          }
        } catch (e) {
          logger.warn('hil', 'Received unparseable packet from Gateway', event.data);
        }
      };
    } catch (e) {
      logger.error('hil', `Failed to initialize WebSocket to ${serverUrl}`, e);
    }
  }

  disconnectHIL() {
    if (this.hilReconnectTimer) {
      clearTimeout(this.hilReconnectTimer);
      this.hilReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.hilState.connected = false;
    this.hilState.hardwareConnected = false;
    this.hilState.roundtripMs = null;
    logger.info('hil', 'Disconnected from HIL Gateway.');
    this._notifyUpdate();
  }

  setHILPinMap(
    ingressPinMap: Record<string, string>,
    egressPinMap: Record<string, string>,
  ) {
    this.hilState.ingressPinMap = ingressPinMap;
    this.hilState.egressPinMap = egressPinMap;
    this._notifyUpdate();
  }

  getState(): SimulationState { return this.state; }
  getHILState(): HilConnectionState { return this.hilState; }

  private _virtualLoop(ts: number) {
    if (this.state.status !== 'running') return;

    const frameDt = this.lastTimestamp !== null
      ? Math.min((ts - this.lastTimestamp) / 1000, 0.05)
      : this.config.timeStep;

    // ─── Real-Time FPS Drop & Lag Tracker ───
    if (this.lastTimestamp !== null) {
      const frameDeltaMs = (ts - this.lastTimestamp);
      // Frame took > 85ms (corresponds to < 12 FPS)
      if (frameDeltaMs > 85) {
        this.lowFpsStreak++;
      } else if (frameDeltaMs < 40) {
        this.lowFpsStreak = Math.max(0, this.lowFpsStreak - 1);
      }
    }
    this.lastTimestamp = ts;

    const isPerf = !!this.config.performanceMode;
    const baseSubSteps = this.config.subSteps || 16;
    // In Performance Mode, use 6 sub-steps to cut compute by >60%
    const subSteps = isPerf ? Math.max(6, Math.floor(baseSubSteps / 2.5)) : baseSubSteps;
    const speed = this.config.speedMultiplier || 1.0;
    const subDt = (frameDt / subSteps) * speed;

    const computeStart = performance.now();
    for (let s = 0; s < subSteps; s++) {
      // Pass active persistent Sample-and-Hold HIL overrides into every sub-step
      const ok = this._step(subDt, this.activeHILOverrides);
      if (!ok) {
        // Halt simulation immediately on solver error!
        this.pause();
        this.state.status = 'error';
        this._notifyUpdate();
        return; // stop RAF loop!
      }
    }
    const computeDurationMs = performance.now() - computeStart;

    if (computeDurationMs > 45) {
      this.heavyComputeStreak++;
    } else if (computeDurationMs < 20) {
      this.heavyComputeStreak = Math.max(0, this.heavyComputeStreak - 1);
    }

    // ─── Thermal & Overload Auto-Cut (Protects Client Responsiveness) ───
    if (this.lowFpsStreak >= 12 || this.heavyComputeStreak >= 12) {
      this.pause();
      this.state.status = 'error';
      this.lowFpsStreak = 0;
      this.heavyComputeStreak = 0;
      logger.error('engine', 'Auto-Cut Triggered: Excessive CPU/GPU overload detected. Simulation automatically stopped to preserve client performance.');
      this.onErrorCallback?.({
        title: 'Simulation Auto-Cut (Overload Protection)',
        message: 'Simulation was halted automatically because excessive CPU load or severe frame drops (< 15 FPS) were detected.',
        details: [
          'High graphical fidelity, complex non-linear nodes, or high speed multipliers exceeded the browser frame budget.',
          'Toggle "⚡ Performance Mode" in the Navbar to reduce sub-steps and disable heavy visual glow passes.',
          'Lower the simulation speed multiplier or reduce the number of high-frequency signal probes.',
        ],
        severity: 'warning',
      });
      this._notifyUpdate();
      return;
    }

    // ─── Continuous HIL Egress Streaming (when connected) ───
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const now = performance.now();
      if (now - this.lastEgressSentTime >= 28) {
        this.lastEgressSentTime = now;
        this._sendHILEgress(Math.round(now));
      }
    }

    this.animFrameId = requestAnimationFrame(this._virtualLoop.bind(this));
  }

  private _onHILPacket(packet: HilIngressPacket) {
    if (!packet || !packet.inputs) return;
    const now = performance.now();

    this.hilPacketTimes.push(now);
    this.hilPacketTimes = this.hilPacketTimes.filter(t => now - t < 1000);
    this.hilState.packetsPerSecond = this.hilPacketTimes.length;
    this.hilState.lastPacketMs = now;
    this.hilState.lastIngressData = { ...packet.inputs };

    const sent = packet.timestamp_ms || now;
    this.hilState.roundtripMs = Math.round(now - sent);
    this._logHILPacket('rx_ingress', `RX Ingress (${Object.keys(packet.inputs).length} pins)`, packet.inputs);

    if (this.hilState.ingressPinMap) {
      for (const [hilPin, compId] of Object.entries(this.hilState.ingressPinMap)) {
        const value = packet.inputs[hilPin];
        if (value === undefined) continue;
        const comp = this.netlist.components[compId];
        if (!comp) continue;
        const numVal = typeof value === 'number' ? value : (value ? 5.0 : 0.0);
        if (!comp.simState) comp.simState = { nodeVoltages: {}, branchCurrents: {}, logicState: {} };
        comp.simState.nodeVoltages['out'] = numVal;
        comp.simState.logicState = { out: (numVal >= (this.config.vih ?? 3.5) ? 1 : numVal >= 2.0 ? 1 : 0) as LogicLevel };

        const netId = getPinNetId(this.netlist.wires, compId, 'out');
        if (netId) {
          // Sample-and-Hold: latch the latest physical hardware voltage persistently
          this.activeHILOverrides[netId] = numVal;
          this.netLogic[netId] = comp.simState.logicState['out'];
        }
      }
    }

    if (this.state.status === 'running') {
      this._sendHILEgress(packet.timestamp_ms || now);
    }
    this._notifyUpdate();
  }

  injectHILIngress(inputs: Record<string, number>) {
    this._onHILPacket({
      device_id: this.hilState.deviceId ?? 'esp32_lab_01',
      timestamp_ms: Math.round(performance.now()),
      inputs,
    });
  }

  private _step(dt: number, hilOverrides: Record<string, number>): boolean {
    const t = this.state.currentTime;
    const config = this.config;

    // Update clock_source logic states based on simulation time
    for (const comp of Object.values(this.netlist.components)) {
      if (comp.kind === 'clock_source') {
        const period = comp.params.pulsePeriod ?? 0.001;
        const duty = (comp.params.dutyCycle ?? 50) / 100;
        const phase = t % period;
        const isHigh = phase < period * duty;
        if (!comp.simState) comp.simState = { nodeVoltages: {}, branchCurrents: {}, logicState: {} };
        if (!comp.simState.logicState) comp.simState.logicState = {};
        comp.simState.logicState['out'] = isHigh ? 1 : 0;
      }
    }

    let mnaSolution: { x: number[]; nodeIndex: Record<string, number>; vsourceIndex: Record<string, number> } | null = null;
    try {
      mnaSolution = solveMNA(
        this.netlist, config, t, this.prevX, this.prevDt, hilOverrides, this.inductorCurrents,
      );
    } catch (err) {
      logger.error('solver', `MNA Solver exception at t=${t.toFixed(3)}s: Circuit has singular matrix or open node.`, err);
      return false;
    }

    if (!mnaSolution) {
      logger.error('solver', `Simulation STOPPED at t=${t.toFixed(3)}s: Unsolvable circuit (singular matrix). Check open pins or add Ground reference.`);
      return false;
    }

    const { x, nodeIndex } = mnaSolution;
    this.prevX = x;
    this.prevDt = dt;

    // Update inductor companion currents
    for (const comp of Object.values(this.netlist.components)) {
      if (comp.kind === 'inductor') {
        const L = comp.params.inductance ?? 0.01;
        const Geq = dt / L;
        const n1NetId = this.wireMap.get(`${comp.id}:1`);
        const n2NetId = this.wireMap.get(`${comp.id}:2`);
        const n1 = n1NetId ? (nodeIndex[n1NetId] ?? 0) : 0;
        const n2 = n2NetId ? (nodeIndex[n2NetId] ?? 0) : 0;
        const v1 = n1 > 0 ? (x[n1 - 1] ?? 0) : 0;
        const v2 = n2 > 0 ? (x[n2 - 1] ?? 0) : 0;
        const Iprev = this.inductorCurrents[comp.id] ?? 0;
        this.inductorCurrents[comp.id] = Iprev + Geq * (v1 - v2);
      }
    }

    // ─── Digital Domain Evaluation ───
    const digitalCount = Object.values(this.netlist.components).filter(c => isDigitalComponent(c.kind)).length;
    if (digitalCount > 0) {
      for (let pass = 0; pass < 3; pass++) {
        this.netLogic = propagateDigitalNetwork(
          this.netlist.components,
          this.wireMap,
          this.netLogic,
          config,
          false,
        );
      }
    }

    // ─── Calculate Running RMS Node Voltages & Sample Probes ───
    const netRmsVoltages: Record<string, number> = {};
    for (const [netId] of Object.entries(this.netlist.netNodes)) {
      const idx = nodeIndex[netId];
      const v = idx !== undefined && idx > 0 ? (x[idx - 1] ?? 0) : 0;
      const vSq = v * v;
      this.netRmsAvg[netId] = this.netRmsAvg[netId] !== undefined
        ? this.netRmsAvg[netId] * 0.95 + vSq * 0.05
        : vSq;
      netRmsVoltages[netId] = Math.sqrt(this.netRmsAvg[netId]);
    }
    this.state.netRmsVoltages = netRmsVoltages;

    const shouldRecordProbes = Boolean(this.config.recordProbes && this.state.status === 'running');
    if (shouldRecordProbes) {
      this._sampleProbes(x, nodeIndex, t);
    }

    // Update each component's local simState
    for (const comp of Object.values(this.netlist.components)) {
      const meta = COMPONENT_REGISTRY[comp.kind];
      const nodeVoltages: Record<string, number> = {};
      const nodeRmsVoltages: Record<string, number> = {};
      if (meta) {
        for (const pin of meta.pins) {
          const netId = getPinNetId(this.netlist.wires, comp.id, pin.id);
          if (netId) {
            const idx = nodeIndex[netId];
            const v = idx !== undefined && idx > 0 ? (x[idx - 1] ?? 0) : 0;
            nodeVoltages[pin.id] = v;
            nodeRmsVoltages[pin.id] = netRmsVoltages[netId] ?? Math.abs(v);
          } else {
            nodeVoltages[pin.id] = 0;
            nodeRmsVoltages[pin.id] = 0;
          }
        }
      }

      // Compute physical branch currents for live badge display & direction sensing
      const branchCurrents: Record<string, number> = {};
      if (comp.kind === 'resistor') {
        const R = Math.max(comp.params.resistance ?? 1000, 1e-6);
        const vDiff = (nodeVoltages['p'] ?? 0) - (nodeVoltages['n'] ?? 0);
        const iR = vDiff / R;
        branchCurrents['p'] = iR;
        branchCurrents['n'] = -iR;
        branchCurrents['1'] = iR;
        branchCurrents['2'] = -iR;
      } else if (comp.kind === 'capacitor') {
        const C = comp.params.capacitance ?? 1e-6;
        const vDiffRms = Math.abs((nodeRmsVoltages['p'] ?? 0) - (nodeRmsVoltages['n'] ?? 0));
        const iC = Math.max(1e-9, 2 * Math.PI * 1000 * C * vDiffRms);
        const sign = (nodeVoltages['p'] ?? 0) >= (nodeVoltages['n'] ?? 0) ? 1 : -1;
        branchCurrents['p'] = iC * sign;
        branchCurrents['n'] = -iC * sign;
        branchCurrents['1'] = iC * sign;
        branchCurrents['2'] = -iC * sign;
      } else if (comp.kind === 'inductor') {
        const L = Math.max(comp.params.inductance ?? 10e-3, 1e-9);
        const vDiffRms = Math.abs((nodeRmsVoltages['p'] ?? 0) - (nodeRmsVoltages['n'] ?? 0));
        const iL = vDiffRms / Math.max(2 * Math.PI * 1000 * L, 1e-3);
        const sign = (nodeVoltages['p'] ?? 0) >= (nodeVoltages['n'] ?? 0) ? 1 : -1;
        branchCurrents['p'] = iL * sign;
        branchCurrents['n'] = -iL * sign;
        branchCurrents['1'] = iL * sign;
        branchCurrents['2'] = -iL * sign;
      } else if (comp.kind === 'diode' || comp.kind === 'zener' || comp.kind === 'led') {
        const vDiff = (nodeVoltages['p'] ?? 0) - (nodeVoltages['n'] ?? 0);
        const Is = comp.params.saturationCurrent ?? 1e-14;
        const iD = vDiff > 0.3 ? Is * (Math.exp(Math.min(vDiff / 0.026, 40)) - 1) : 0;
        branchCurrents['p'] = iD;
        branchCurrents['n'] = -iD;
        branchCurrents['A'] = iD;
        branchCurrents['K'] = -iD;
      } else if (comp.kind === 'bjt_npn') {
        const vBe = (nodeVoltages['base'] ?? 0) - (nodeVoltages['emitter'] ?? 0);
        const vCe = (nodeVoltages['collector'] ?? 0) - (nodeVoltages['emitter'] ?? 0);
        const beta = comp.params.beta ?? 100;
        const Is = comp.params.saturationCurrent ?? 1e-14;
        const iB = vBe > 0.4 ? (Is / beta) * (Math.exp(Math.min(vBe / 0.026, 40)) - 1) : 0;
        const iC = iB * beta * Math.max(0, Math.min(1, vCe / 0.2));
        branchCurrents['base'] = iB;
        branchCurrents['collector'] = iC;
        branchCurrents['emitter'] = -(iB + iC);
      } else if (comp.kind === 'bjt_pnp') {
        const vEb = (nodeVoltages['emitter'] ?? 0) - (nodeVoltages['base'] ?? 0);
        const vEc = (nodeVoltages['emitter'] ?? 0) - (nodeVoltages['collector'] ?? 0);
        const beta = comp.params.beta ?? 100;
        const Is = comp.params.saturationCurrent ?? 1e-14;
        const iB = vEb > 0.4 ? -(Is / beta) * (Math.exp(Math.min(vEb / 0.026, 40)) - 1) : 0;
        const iC = -Math.abs(iB) * beta * Math.max(0, Math.min(1, vEc / 0.2));
        branchCurrents['base'] = iB;
        branchCurrents['collector'] = iC;
        branchCurrents['emitter'] = -(iB + iC);
      } else if (comp.kind === 'mosfet_n_enh' || comp.kind === 'mosfet_n_dep') {
        const vGs = (nodeVoltages['gate'] ?? 0) - (nodeVoltages['source'] ?? 0);
        const vTh = comp.params.vth ?? (comp.kind === 'mosfet_n_dep' ? -1.5 : 2.0);
        const kn = comp.params.kn ?? 0.002;
        const vEff = vGs - vTh;
        const iD = vEff > 0 ? (kn / 2) * vEff * vEff : 0;
        branchCurrents['drain'] = iD;
        branchCurrents['source'] = -iD;
        branchCurrents['gate'] = 0;
      } else if (comp.kind === 'mosfet_p_enh' || comp.kind === 'mosfet_p_dep') {
        const vSg = (nodeVoltages['source'] ?? 0) - (nodeVoltages['gate'] ?? 0);
        const vTh = comp.params.vth ?? (comp.kind === 'mosfet_p_dep' ? 1.5 : -2.0);
        const kp = comp.params.kn ?? 0.002;
        const vEff = vSg - Math.abs(vTh);
        const iD = vEff > 0 ? (kp / 2) * vEff * vEff : 0;
        branchCurrents['source'] = iD;
        branchCurrents['drain'] = -iD;
        branchCurrents['gate'] = 0;
      } else if (comp.kind === 'opamp') {
        const vOut = nodeVoltages['out'] ?? 0;
        const rOut = Math.max(comp.params.rout ?? 50, 1);
        branchCurrents['out'] = vOut / rOut;
        branchCurrents['inp'] = 0;
        branchCurrents['inn'] = 0;
      } else if (comp.kind === 'dc_voltage' || comp.kind === 'ac_voltage' || comp.kind === 'signal_generator') {
        const vP = nodeVoltages['p'] ?? nodeVoltages['out'] ?? 0;
        const vN = nodeVoltages['n'] ?? nodeVoltages['gnd'] ?? 0;
        const iEstimated = Math.max(0.001, Math.abs(vP - vN) / 100);
        branchCurrents['p'] = iEstimated;
        branchCurrents['out'] = iEstimated;
        branchCurrents['n'] = -iEstimated;
        branchCurrents['gnd'] = -iEstimated;
      }

      comp.simState = {
        nodeVoltages,
        nodeRmsVoltages,
        branchCurrents,
      };

      if (isDigitalComponent(comp.kind)) {
        const compLogic: Record<string, LogicLevel> = {};
        if (meta) {
          for (const pin of meta.pins) {
            const netId = getPinNetId(this.netlist.wires, comp.id, pin.id);
            if (netId) {
              compLogic[pin.id] = this.netLogic[netId] ?? 0;
            }
          }
        }
        comp.simState.logicState = compLogic;
      }

      if (comp.kind === 'led') {
        const vP = nodeVoltages['p'] ?? 0;
        const vN = nodeVoltages['n'] ?? 0;
        comp.params.voltage = Math.max(0, vP - vN);
      }

      if ((comp.kind === 'signal_generator' || comp.kind === 'ac_voltage') && shouldRecordProbes) {
        const netId = getPinNetId(this.netlist.wires, comp.id, 'out') ?? getPinNetId(this.netlist.wires, comp.id, 'p');
        if (netId) {
          const v = evaluateWaveform(
            comp.params.waveform ?? 'sine',
            comp.params.amplitude ?? comp.params.voltage ?? 5,
            comp.params.frequency ?? 1000,
            comp.params.phase ?? 0,
            comp.params.offset ?? 0,
            t,
            comp.params.dutyCycle,
          );
          this._appendProbe(netId, t, v);
        }
      }

      if (comp.kind === 'oscilloscope' && shouldRecordProbes) {
        const ch = comp.params.scopeChannel ?? 1;
        const vP = nodeVoltages['p'] ?? 0;
        const vN = nodeVoltages['n'] ?? 0;
        const vDiff = vP - vN;
        this._appendProbe(`scope_ch_${ch}`, t, vDiff);
        this._appendProbe(`probe_${comp.id}`, t, vDiff);
      }
    }

    // Populate componentStates snapshot for live visual rendering on canvas
    const compStates: Record<string, ComponentSimState> = {};
    for (const comp of Object.values(this.netlist.components)) {
      if (comp.simState) {
        compStates[comp.id] = {
          nodeVoltages: { ...comp.simState.nodeVoltages },
          nodeRmsVoltages: { ...comp.simState.nodeRmsVoltages },
          branchCurrents: { ...comp.simState.branchCurrents },
          logicState: { ...comp.simState.logicState },
        };
      }
    }
    this.state.componentStates = compStates;

    this.state.currentTime += dt;
    this.state.stepCount++;
    this._notifyUpdate();
    return true;
  }

  private _sampleProbes(x: number[], nodeIndex: Record<string, number>, t: number) {
    for (const [netId] of Object.entries(this.netlist.netNodes)) {
      const idx = nodeIndex[netId];
      const v = idx !== undefined && idx > 0 ? (x[idx - 1] ?? 0) : 0;
      this._appendProbe(netId, t, v);
      const level = this.netLogic[netId] ?? voltageToLogic(v, this.config);
      this._appendLogicTrace(netId, t, level);
    }
  }

  private _appendProbe(netId: string, t: number, v: number) {
    if (!this.state.probeData[netId]) {
      this.state.probeData[netId] = {
        label: netId,
        times: new Float64Array(MAX_PROBE_POINTS),
        values: new Float32Array(MAX_PROBE_POINTS),
        maxPoints: MAX_PROBE_POINTS,
        head: 0,
        count: 0,
      };
    }
    const p = this.state.probeData[netId];
    p.times[p.head] = t;
    p.values[p.head] = v;
    p.head = (p.head + 1) % MAX_PROBE_POINTS;
    if (p.count < MAX_PROBE_POINTS) p.count++;
  }

  private _appendLogicTrace(netId: string, t: number, level: LogicLevel) {
    if (!this.state.logicTraces[netId]) {
      this.state.logicTraces[netId] = { label: netId, times: [], values: [] };
    }
    const trace = this.state.logicTraces[netId];
    const last = trace.values[trace.values.length - 1];
    if (last !== level) {
      trace.times.push(t);
      trace.values.push(level);
      if (trace.times.length > 2048) {
        trace.times = trace.times.slice(-2048);
        trace.values = trace.values.slice(-2048);
      }
    }
  }

  private _sendHILEgress(ingressTimestampMs: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const outputs: Record<string, number | 0 | 1> = {};
    for (const [hilPin, compId] of Object.entries(this.hilState.egressPinMap)) {
      const comp = this.netlist.components[compId];
      if (!comp) continue;
      const netId = getPinNetId(this.netlist.wires, compId, 'in');
      if (!netId) continue;

      let v = 0;
      const probe = this.state.probeData[netId];
      if (probe && probe.count > 0) {
        const lastIdx = (probe.head - 1 + MAX_PROBE_POINTS) % MAX_PROBE_POINTS;
        v = probe.values[lastIdx];
      } else {
        const logVal = this.netLogic[netId] ?? 0;
        v = logVal === 1 ? (this.config.voh ?? 5.0) : 0.0;
      }

      const rawPin = comp.params.hilPin || hilPin || 'DAC0';
      const pinName = rawPin.toUpperCase();
      let outVal: number;
      if (pinName.startsWith('DAC')) {
        outVal = parseFloat(Math.max(0, Math.min(3.3, v)).toFixed(3));
      } else if (pinName.startsWith('PWM')) {
        outVal = Math.round(Math.max(0, Math.min(255, (v / 5) * 255)));
      } else {
        outVal = (v >= (this.config.vih ?? 2.0) || this.netLogic[netId] === 1) ? 1 : 0;
      }
      outputs[pinName] = outVal;

      if (!comp.simState) comp.simState = { nodeVoltages: {}, branchCurrents: {}, logicState: {} };
      comp.simState.nodeVoltages['in'] = v;
      comp.simState.logicState = { in: (outVal >= 1 ? 1 : 0) as LogicLevel };
    }

    if (Object.keys(outputs).length === 0) return;

    this.hilState.lastEgressData = { ...outputs };
    const packet: HilEgressPacket = {
      device_id: this.hilState.deviceId ?? 'esp32_lab_01',
      timestamp_ms: ingressTimestampMs,
      outputs,
    };
    try {
      this.ws.send(JSON.stringify({ type: 'egress', payload: packet }));
      this._logHILPacket('tx_egress', `TX Egress (${Object.keys(outputs).length} pins)`, outputs);
    } catch {}
  }

  private _buildWireMap() {
    this.wireMap.clear();
    for (const wire of this.netlist.wires) {
      this.wireMap.set(`${wire.sourceComponentId}:${wire.sourcePinId}`, wire.netNodeId);
      this.wireMap.set(`${wire.targetComponentId}:${wire.targetPinId}`, wire.netNodeId);
    }
  }

  private _resetProbes() {
    this.state.probeData = {};
    this.state.logicTraces = {};
    this.state.componentStates = {};
  }

  private _makeInitialState(): SimulationState {
    return {
      status: 'stopped',
      mode: this.config.mode,
      currentTime: 0,
      stepCount: 0,
      config: this.config,
      probeData: {},
      logicTraces: {},
      componentStates: {},
    };
  }

  private _notifyUpdate() {
    this.onStateUpdate?.(this.state, this.hilState);
  }
}

let _dispatcher: SimulationDispatcher | null = null;

export function getDispatcher(): SimulationDispatcher | null {
  return _dispatcher;
}

export function createDispatcher(
  netlist: Netlist,
  config?: Partial<SimulationConfig>,
  onUpdate?: (state: SimulationState, hilState: HilConnectionState) => void,
  onError?: (err: CircuitDiagnosticError) => void,
): SimulationDispatcher {
  if (_dispatcher) _dispatcher.stop();
  _dispatcher = new SimulationDispatcher(netlist, config, onUpdate, onError);
  return _dispatcher;
}
