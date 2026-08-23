// ============================================================
// VirtualLab-HIL — ESP32 Hardware-in-the-Loop Bridge & Debug Console
// ============================================================

import React, { useState, useEffect } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  Radio, X, Wifi, CheckCircle2, AlertCircle, RefreshCw, ArrowRight,
  Sliders, Activity, Send, Terminal, Play, Pause
} from 'lucide-react';

export const HILBridgeBar: React.FC = () => {
  const show = useCircuitStore((s) => s.showHILBridge);
  const setShow = useCircuitStore((s) => s.setShowHILBridge);
  const hilState = useCircuitStore((s) => s.hilState);
  const connectHIL = useCircuitStore((s) => s.connectHIL);
  const disconnectHIL = useCircuitStore((s) => s.disconnectHIL);
  const injectHILIngress = useCircuitStore((s) => s.injectHILIngress);
  const components = useCircuitStore((s) => s.components);

  const [serverUrl, setServerUrl] = useState(hilState.serverUrl || 'ws://localhost:8000/ws/ui');
  const [deviceId, setDeviceId] = useState(hilState.deviceId || 'esp32_lab_01');
  const [activeTab, setActiveTab] = useState<'monitor' | 'simulator' | 'logs'>('monitor');

  // Simulator state
  const [simA0, setSimA0] = useState<number>(1.65);
  const [simA1, setSimA1] = useState<number>(3.3);
  const [simA2, setSimA2] = useState<number>(0.85);
  const [simA3, setSimA3] = useState<number>(2.5);
  const [simA4, setSimA4] = useState<number>(1.2);
  const [simA5, setSimA5] = useState<number>(2.0);
  const [simD0, setSimD0] = useState<number>(1);
  const [simD1, setSimD1] = useState<number>(0);
  const [simD4, setSimD4] = useState<number>(0);
  const [simD5, setSimD5] = useState<number>(1);
  const [simD6, setSimD6] = useState<number>(0);
  const [isAutoInjecting, setIsAutoInjecting] = useState<boolean>(false);

  // Auto-sine wave generator for hardware simulator
  useEffect(() => {
    if (!isAutoInjecting) return;
    let angle = 0;
    const interval = setInterval(() => {
      angle += 0.15;
      const vSine = parseFloat((1.65 + 1.65 * Math.sin(angle)).toFixed(3));
      setSimA0(vSine);
      injectHILIngress({
        A0: vSine,
        A1: simA1,
        A2: simA2,
        A3: simA3,
        A4: simA4,
        A5: simA5,
        D0: simD0,
        D1: simD1,
        D4: simD4,
        D5: simD5,
        D6: simD6,
      });
    }, 50); // 20Hz update
    return () => clearInterval(interval);
  }, [isAutoInjecting, simA1, simA2, simA3, simA4, simA5, simD0, simD1, simD4, simD5, simD6, injectHILIngress]);

  if (!show) return null;

  const ingressComps = Object.values(components).filter((c) => c.kind === 'hil_ingress');
  const egressComps = Object.values(components).filter((c) => c.kind === 'hil_egress');

  const handleSendManualPacket = () => {
    injectHILIngress({
      A0: simA0,
      A1: simA1,
      A2: simA2,
      A3: simA3,
      A4: simA4,
      A5: simA5,
      D0: simD0,
      D1: simD1,
      D4: simD4,
      D5: simD5,
      D6: simD6,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span>Hardware-in-the-Loop (ESP32) Bridge & Debug Console</span>
                {hilState.connected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </h2>
              <p className="text-[10px] text-slate-400 font-mono">
                Real-Time WebSocket Gateway Router & Live Hardware Telemetry
              </p>
            </div>
          </div>
          <button
            onClick={() => setShow(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Top Status Stats ── */}
        <div className="p-3 bg-slate-950/80 border-b border-slate-800 grid grid-cols-4 gap-2 text-xs shrink-0">
          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col items-center justify-center">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Hardware Status</span>
            {hilState.connected ? (
              hilState.hardwareConnected ? (
                <div className="flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> ESP32 ONLINE
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-400 font-bold text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5" /> ESP32 OFFLINE
                </div>
              )
            ) : (
              <div className="flex items-center gap-1 text-red-400 font-bold text-[11px]">
                <AlertCircle className="w-3.5 h-3.5" /> GATEWAY OFF
              </div>
            )}
          </div>

          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col items-center justify-center">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Roundtrip Latency</span>
            <span className="text-sm font-mono font-bold text-cyan-300">
              {hilState.roundtripMs !== null ? `${hilState.roundtripMs} ms` : '--'}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col items-center justify-center">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Telemetry Rate</span>
            <span className="text-sm font-mono font-bold text-orange-400">
              {hilState.packetsPerSecond} pkt/s
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col items-center justify-center">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Active Canvas Pins</span>
            <span className="text-sm font-mono font-bold text-purple-300">
              {ingressComps.length} IN / {egressComps.length} OUT
            </span>
          </div>
        </div>

        {/* ── Navigation Tabs ── */}
        <div className="flex items-center px-4 bg-slate-950 border-b border-slate-800 gap-1 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-3 py-2 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'monitor'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Live Pin Monitor
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-2 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'simulator'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Hardware Simulator / Injector
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-2 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" /> Live Packet Logs ({(hilState.packetLogs || []).length})
          </button>
        </div>

        {/* ── Content Area ── */}
        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-4 text-xs bg-slate-900/60">
          {/* Config Bar */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1 block">WebSocket Gateway URL</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1 block">Target ESP32 Device ID</label>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-mono">
                Subscribed Route: {serverUrl} ({deviceId})
              </span>
              <div className="flex gap-2">
                {hilState.connected ? (
                  <button
                    onClick={disconnectHIL}
                    className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-300 font-bold transition flex items-center gap-1"
                  >
                    Disconnect Gateway
                  </button>
                ) : (
                  <button
                    onClick={() => connectHIL(serverUrl, deviceId)}
                    className="px-3 py-1.5 rounded-lg bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500 text-orange-300 font-bold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Wifi className="w-3.5 h-3.5" /> Connect to Gateway
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TAB 1: LIVE PIN MONITOR */}
          {activeTab === 'monitor' && (
            <div className="grid grid-cols-2 gap-3">
              {/* Ingress */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <h3 className="font-bold text-cyan-400 text-xs flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" /> RX Ingress (ESP32 → Canvas)
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    {ingressComps.length} Pins
                  </span>
                </div>

                {ingressComps.length === 0 ? (
                  <p className="text-slate-500 text-[11px] italic py-4 text-center">
                    No ESP32 Ingress pins placed on canvas. Add one from the left palette to receive live sensor data.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {ingressComps.map((c) => {
                      const pin = c.params.hilPin || 'A0';
                      const type = c.params.hilPinType || 'adc';
                      const val = c.simState?.nodeVoltages?.['out'] ?? (hilState.lastIngressData?.[pin] ?? 0);
                      const isDigital = type === 'gpio_in';
                      return (
                        <div key={c.id} className="flex items-center justify-between font-mono text-[11px] bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                            <span className="text-orange-400 font-bold">{pin}</span>
                            <span className="text-[10px] text-slate-500 uppercase">({type})</span>
                          </div>
                          <div className="font-bold text-cyan-300">
                            {isDigital ? (val >= 1 ? '1 (HIGH)' : '0 (LOW)') : `${val.toFixed(3)} V`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Egress */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <h3 className="font-bold text-orange-400 text-xs flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" /> TX Egress (Canvas → ESP32)
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    {egressComps.length} Pins
                  </span>
                </div>

                {egressComps.length === 0 ? (
                  <p className="text-slate-500 text-[11px] italic py-4 text-center">
                    No ESP32 Egress pins placed on canvas. Add one from the left palette to route canvas voltage to hardware actuators.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {egressComps.map((c) => {
                      const pin = c.params.hilPin || 'DAC0';
                      const type = c.params.hilPinType || 'dac';
                      const val = c.simState?.nodeVoltages?.['in'] ?? (hilState.lastEgressData?.[pin] ?? 0);
                      const isDigital = type === 'gpio_out';
                      return (
                        <div key={c.id} className="flex items-center justify-between font-mono text-[11px] bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                            <span className="text-orange-400 font-bold">{pin}</span>
                            <span className="text-[10px] text-slate-500 uppercase">({type})</span>
                          </div>
                          <div className="font-bold text-orange-300">
                            {isDigital ? (val >= 1 ? '1 (HIGH)' : '0 (LOW)') : `${val.toFixed(3)} V`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HARDWARE SIMULATOR / INJECTOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-[11px] leading-relaxed text-cyan-200 flex items-center justify-between">
                <div>
                  <span className="font-bold block mb-0.5">ESP32 Hardware Simulation Injector</span>
                  Test your canvas circuit live by injecting virtual ESP32 ADC & GPIO sensor signals directly without physical hardware.
                </div>
                <button
                  onClick={() => setIsAutoInjecting(!isAutoInjecting)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 ${
                    isAutoInjecting
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'bg-cyan-600 text-white hover:bg-cyan-500'
                  }`}
                >
                  {isAutoInjecting ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isAutoInjecting ? 'Stop Auto-Wave' : 'Auto Sine on A0'}</span>
                </button>
              </div>

              {/* Analog ADC Sliders */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Analog Sensor Inputs (ADC: 0.0V - 3.3V)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'A0 (GPIO 36)', val: simA0, set: setSimA0 },
                    { label: 'A1 (GPIO 39)', val: simA1, set: setSimA1 },
                    { label: 'A2 (GPIO 34)', val: simA2, set: setSimA2 },
                    { label: 'A3 (GPIO 35)', val: simA3, set: setSimA3 },
                    { label: 'A4 (GPIO 32)', val: simA4, set: setSimA4 },
                    { label: 'A5 (GPIO 33)', val: simA5, set: setSimA5 },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-400">{item.label}</span>
                        <span className="text-cyan-400 font-bold">{item.val.toFixed(2)} V</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3.3"
                        step="0.05"
                        value={item.val}
                        onChange={(e) => item.set(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Digital GPIO Toggles */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Digital Sensor Inputs (GPIO 0 / 1)
                </h4>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  {[
                    { label: 'D0 (GPIO 4)', val: simD0, set: setSimD0 },
                    { label: 'D1 (GPIO 5)', val: simD1, set: setSimD1 },
                    { label: 'D4 (GPIO 13)', val: simD4, set: setSimD4 },
                    { label: 'D5 (GPIO 14)', val: simD5, set: setSimD5 },
                    { label: 'D6 (GPIO 15)', val: simD6, set: setSimD6 },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => item.set(item.val === 1 ? 0 : 1)}
                      className={`p-2 rounded-lg border font-bold flex flex-col items-center justify-center gap-1 transition ${
                        item.val === 1
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-[10px]">{item.label}</span>
                      <span className="text-xs">{item.val === 1 ? '1 (HIGH)' : '0 (LOW)'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSendManualPacket}
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-orange-950/50"
                >
                  <Send className="w-3.5 h-3.5" /> Inject Telemetry to Canvas Circuit
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE PACKET LOGS */}
          {activeTab === 'logs' && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-bold text-slate-200">Packet Traffic Stream</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Rolling buffer: 40 packets</span>
              </div>

              {(hilState.packetLogs || []).length === 0 ? (
                <p className="text-slate-500 text-[11px] italic py-6 text-center">
                  No packets recorded yet. Connect to the WebSocket gateway or start simulation to observe traffic.
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar font-mono text-[10px] pr-1">
                  {(hilState.packetLogs || []).map((log) => {
                    const isRx = log.type === 'rx_ingress';
                    const isTx = log.type === 'tx_egress';
                    return (
                      <div
                        key={log.id}
                        className={`p-1.5 rounded border flex items-center justify-between ${
                          isRx
                            ? 'bg-cyan-950/30 border-cyan-800/40 text-cyan-200'
                            : isTx
                            ? 'bg-orange-950/30 border-orange-800/40 text-orange-200'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-slate-500 text-[9px]">{log.time}</span>
                          <span className={`px-1 py-0.2 rounded font-bold text-[9px] ${
                            isRx ? 'bg-cyan-500/20 text-cyan-300' : isTx ? 'bg-orange-500/20 text-orange-300' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {isRx ? 'RX INGRESS' : isTx ? 'TX EGRESS' : 'SYSTEM'}
                          </span>
                          <span className="truncate">{log.summary}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 shrink-0">
                          {JSON.stringify(log.raw).slice(0, 35)}...
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
