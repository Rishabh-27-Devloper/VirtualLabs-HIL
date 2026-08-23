// ============================================================
// VirtualLab-HIL — 4-Channel Professional Virtual Oscilloscope
// (With Separate Signal Analysis Mode & 100 V/div Scale)
// ============================================================

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  Activity, X, Sliders, Layers, Columns2, Columns4,
  BarChart3, Zap, Eye, EyeOff, Radio, Play, Pause,
  Camera, Download, Sparkles, Wand2, ChevronLeft, ChevronRight,
} from 'lucide-react';

interface ChannelMetrics {
  vpp: number;
  vrms: number;
  vavg: number;
  vmax: number;
  vmin: number;
  freq: number;
}

const DEFAULT_METRICS: ChannelMetrics = {
  vpp: 0,
  vrms: 0,
  vavg: 0,
  vmax: 0,
  vmin: 0,
  freq: 0,
};

export const TIME_DIV_PRESETS = [
  { label: '100ns', value: 100e-9 },
  { label: '200ns', value: 200e-9 },
  { label: '500ns', value: 500e-9 },
  { label: '1µs', value: 1e-6 },
  { label: '2µs', value: 2e-6 },
  { label: '5µs', value: 5e-6 },
  { label: '10µs', value: 10e-6 },
  { label: '20µs', value: 20e-6 },
  { label: '50µs', value: 50e-6 },
  { label: '100µs', value: 100e-6 },
  { label: '200µs', value: 200e-6 },
  { label: '500µs', value: 500e-6 },
  { label: '1ms', value: 1e-3 },
  { label: '2ms', value: 2e-3 },
  { label: '5ms', value: 5e-3 },
  { label: '10ms', value: 10e-3 },
  { label: '20ms', value: 20e-3 },
  { label: '50ms', value: 50e-3 },
  { label: '100ms', value: 100e-3 },
  { label: '200ms', value: 200e-3 },
  { label: '500ms', value: 500e-3 },
  { label: '1s', value: 1.0 },
  { label: '2s', value: 2.0 },
  { label: '5s', value: 5.0 },
];

export const VOLT_DIV_STEPS = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0,
];

export function formatTimeDiv(seconds: number): string {
  if (seconds < 1e-6) return `${(seconds * 1e9).toFixed(0)} ns/div`;
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(seconds * 1e6 >= 10 ? 0 : 1)} µs/div`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(seconds * 1e3 >= 10 ? 0 : 1)} ms/div`;
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s/div`;
}

const CHANNEL_COLORS = [
  { key: 'ch1', name: 'CH 1', color: '#22d3ee', glow: 'rgba(34,211,238,0.25)', border: 'border-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-950/40' },
  { key: 'ch2', name: 'CH 2', color: '#f59e0b', glow: 'rgba(245,158,11,0.25)', border: 'border-amber-500', text: 'text-amber-400', bg: 'bg-amber-950/40' },
  { key: 'ch3', name: 'CH 3', color: '#10b981', glow: 'rgba(16,185,129,0.25)', border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-950/40' },
  { key: 'ch4', name: 'CH 4', color: '#c084fc', glow: 'rgba(192,132,252,0.25)', border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-950/40' },
];

export const OscilloscopeModal: React.FC = () => {
  const show = useCircuitStore((s) => s.showOscilloscope);
  const setShow = useCircuitStore((s) => s.setShowOscilloscope);
  const simulationState = useCircuitStore((s) => s.simulationState);
  const performanceMode = useCircuitStore((s) => s.performanceMode);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const scopeSettings = useCircuitStore((s) => s.scopeSettings);
  const updateScopeSettings = useCircuitStore((s) => s.updateScopeSettings);
  const setSpeedMultiplier = useCircuitStore((s) => s.setSpeedMultiplier);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Active channel selection tab in sidebar
  const [selectedChannelTab, setSelectedChannelTab] = useState<1 | 2 | 3 | 4>(1);

  // Channel probe nodes
  const [ch1Node, setCh1Node] = useState<string>('');
  const [ch2Node, setCh2Node] = useState<string>('');
  const [ch3Node, setCh3Node] = useState<string>('');
  const [ch4Node, setCh4Node] = useState<string>('');

  // Pause / Frozen state & snapshot reference
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const pausedTimeRef = useRef<number | null>(null);

  // Persistent reference for 60fps RAF loop to avoid effect churn
  const renderStateRef = useRef({
    probeData: simulationState.probeData,
    scopeSettings,
    simulationState,
    isPaused,
    performanceMode,
    ch1Node,
    ch2Node,
    ch3Node,
    ch4Node,
  });

  useEffect(() => {
    renderStateRef.current = {
      probeData: simulationState.probeData,
      scopeSettings,
      simulationState,
      isPaused,
      performanceMode,
      ch1Node,
      ch2Node,
      ch3Node,
      ch4Node,
    };
  });

  // Auto-Set Toast Notification
  const [autoSetToast, setAutoSetToast] = useState<string | null>(null);

  // Channel live metrics
  const [metrics1, setMetrics1] = useState<ChannelMetrics>(DEFAULT_METRICS);
  const [metrics2, setMetrics2] = useState<ChannelMetrics>(DEFAULT_METRICS);
  const [metrics3, setMetrics3] = useState<ChannelMetrics>(DEFAULT_METRICS);
  const [metrics4, setMetrics4] = useState<ChannelMetrics>(DEFAULT_METRICS);

  const probeData = simulationState.probeData;
  const netIds = Object.keys(probeData);

  // Generate friendly names for net nodes & canvas probes
  const friendlyNetNodes = useMemo(() => {
    const map: { id: string; label: string; isProbe?: boolean; probeCh?: number }[] = [];

    // 1. First list any physical canvas oscilloscope probes
    const scopeComps = Object.values(components).filter((c) => c.kind === 'oscilloscope');
    scopeComps.forEach((comp) => {
      const ch = comp.params.scopeChannel ?? 1;
      const pEdge = edges.find(
        (e) => (e.source === comp.id && (e.sourceHandle === 'p' || !e.sourceHandle)) ||
               (e.target === comp.id && (e.targetHandle === 'p' || !e.targetHandle)),
      );
      const targetComp = pEdge ? (pEdge.source === comp.id ? components[pEdge.target] : components[pEdge.source]) : null;
      const targetPin = pEdge ? (pEdge.source === comp.id ? pEdge.targetHandle || 'p' : pEdge.sourceHandle || 'p') : '';
      const sensedLabel = targetComp ? `${targetComp.label} (${targetPin})` : 'Canvas Probe';

      map.push({
        id: `scope_ch_${ch}`,
        label: `🎯 Canvas Probe (CH ${ch}) → ${sensedLabel}`,
        isProbe: true,
        probeCh: ch,
      });
    });

    // 2. List all other circuit net nodes
    netIds.forEach((netId) => {
      if (netId.startsWith('scope_ch_') || netId.startsWith('probe_')) return;
      const connectedParts: string[] = [];
      edges.forEach((e) => {
        const compSrc = components[e.source];
        const compTgt = components[e.target];
        if (compSrc && (netId.includes(e.source) || netId.includes(e.target))) {
          connectedParts.push(`${compSrc.label} (${e.sourceHandle || 'p'})`);
        }
        if (compTgt && (netId.includes(e.source) || netId.includes(e.target))) {
          connectedParts.push(`${compTgt.label} (${e.targetHandle || 'n'})`);
        }
      });

      const uniqueParts = Array.from(new Set(connectedParts));
      const label = uniqueParts.length > 0
        ? uniqueParts.slice(0, 2).join(' ↔ ')
        : `Net #${netId.slice(-6)}`;
      map.push({ id: netId, label, isProbe: false });
    });
    return map;
  }, [netIds, components, edges]);

  // Default probes initialization with intelligent canvas probe detection
  useEffect(() => {
    // If a canvas probe exists for CH 1, default to scope_ch_1
    if (!ch1Node || (!probeData[ch1Node] && probeData['scope_ch_1'])) {
      if (probeData['scope_ch_1']) {
        setCh1Node('scope_ch_1');
      } else if (netIds.length > 0 && !ch1Node) {
        setCh1Node(netIds[0]);
      }
    }
    // If a canvas probe exists for CH 2, default to scope_ch_2
    if (!ch2Node || (!probeData[ch2Node] && probeData['scope_ch_2'])) {
      if (probeData['scope_ch_2']) {
        setCh2Node('scope_ch_2');
      } else if (netIds.length > 1 && !ch2Node) {
        setCh2Node(netIds[1]);
      }
    }
    // CH 3
    if (!ch3Node && probeData['scope_ch_3']) {
      setCh3Node('scope_ch_3');
    }
    // CH 4
    if (!ch4Node && probeData['scope_ch_4']) {
      setCh4Node('scope_ch_4');
    }
  }, [probeData, netIds, ch1Node, ch2Node, ch3Node, ch4Node]);

  // Main High-Efficiency Canvas Rendering Loop
  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const {
        probeData: liveProbes,
        scopeSettings: liveScopeSettings,
        simulationState: liveSimState,
        isPaused: livePaused,
        performanceMode: isPerf,
        ch1Node: node1,
        ch2Node: node2,
        ch3Node: node3,
        ch4Node: node4,
      } = renderStateRef.current;

      const w = canvas.width;
      const h = canvas.height;

      // 1. Dark Screen Phosphor Clear
      ctx.fillStyle = '#060910';
      ctx.fillRect(0, 0, w, h);

      const mode = liveScopeSettings.displayMode || 'overlay';

      // 2. Draw CRT Grid
      const drawGrid = (gx: number, gy: number, gw: number, gh: number) => {
        ctx.strokeStyle = '#152033';
        ctx.lineWidth = 1;
        const divX = gw / 10;
        const divY = gh / 8;

        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          ctx.moveTo(gx + i * divX, gy);
          ctx.lineTo(gx + i * divX, gy + gh);
        }
        for (let j = 0; j <= 8; j++) {
          ctx.moveTo(gx, gy + j * divY);
          ctx.lineTo(gx + gw, gy + j * divY);
        }
        ctx.stroke();

        // Center Axis ticks
        ctx.strokeStyle = '#2d3f5e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gx, gy + gh / 2);
        ctx.lineTo(gx + gw, gy + gh / 2);
        ctx.moveTo(gx + gw / 2, gy);
        ctx.lineTo(gx + gw / 2, gy + gh);
        ctx.stroke();
      };

      // Helper to compute and draw waveform
      const processWaveform = (
        netId: string,
        strokeColor: string,
        glowColor: string,
        voltDiv: number,
        offsetDiv: number,
        onMetrics: (m: ChannelMetrics) => void,
        screenX: number,
        screenY: number,
        screenW: number,
        screenH: number,
      ) => {
        const stream = liveProbes[netId];
        if (!stream || stream.count < 2) return;
        const timeSpan = liveScopeSettings.timeDiv * 10; // 10 horizontal divisions
        const curTime = livePaused && pausedTimeRef.current !== null
          ? pausedTimeRef.current
          : liveSimState.currentTime;
        const startTime = curTime - timeSpan;

        const count = stream.count;
        const maxPts = stream.maxPoints;
        const head = stream.head;

        const points: { x: number; y: number; v: number; t: number }[] = [];
        let vMin = Infinity;
        let vMax = -Infinity;
        let sumV = 0;
        let sumSq = 0;

        for (let i = 0; i < count; i++) {
          const idx = (head - 1 - i + maxPts) % maxPts;
          const t = stream.times[idx];
          const v = stream.values[idx];

          if (t < startTime) break;

          const px = screenX + ((t - startTime) / timeSpan) * screenW;
          const py = screenY + screenH / 2 - ((v / voltDiv) * (screenH / 8)) - (offsetDiv * (screenH / 8));

          points.push({ x: px, y: py, v, t });

          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
          sumV += v;
          sumSq += v * v;
        }

        if (points.length >= 2) {
          const N = points.length;
          const vpp = Math.max(0, vMax - vMin);
          const vavg = sumV / N;
          const vrms = Math.sqrt(Math.max(0, sumSq / N));

          // Estimate signal frequency from zero-crossings
          let zeroCrossings = 0;
          for (let i = 0; i < points.length - 1; i++) {
            const v1 = points[i].v - vavg;
            const v2 = points[i + 1].v - vavg;
            if (v1 <= 0 && v2 > 0) zeroCrossings++;
          }
          const dtObserved = points[0].t - points[points.length - 1].t;
          const freq = dtObserved > 0 && zeroCrossings > 0 ? (zeroCrossings / dtObserved) : 0;

          onMetrics({ vpp, vrms, vavg, vmax: vMax, vmin: vMin, freq });

          // Draw Waveform trace
          ctx.save();
          ctx.beginPath();
          ctx.rect(screenX, screenY, screenW, screenH);
          ctx.clip();

          // Step index for Performance Mode downsampling
          const step = isPerf && points.length > 250 ? Math.max(1, Math.floor(points.length / 250)) : 1;

          // Outer Glow (Omitted in Performance Mode to save GPU fill rate)
          if (!isPerf) {
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            for (let idx = 0; idx < points.length; idx += step) {
              const p = points[idx];
              if (idx === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
          }

          // Sharp Core Trace
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = isPerf ? 1.5 : 1.8;
          ctx.beginPath();
          for (let idx = 0; idx < points.length; idx += step) {
            const p = points[idx];
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.restore();
        }
      };

      // 3. Render according to active Display Mode
      if (mode === 'overlay') {
        drawGrid(0, 0, w, h);
        if (node1) processWaveform(node1, '#22d3ee', 'rgba(34,211,238,0.25)', liveScopeSettings.voltDiv1, liveScopeSettings.offset1, setMetrics1, 0, 0, w, h);
        if (node2) processWaveform(node2, '#f59e0b', 'rgba(245,158,11,0.25)', liveScopeSettings.voltDiv2, liveScopeSettings.offset2, setMetrics2, 0, 0, w, h);
        if (node3) processWaveform(node3, '#10b981', 'rgba(16,185,129,0.25)', liveScopeSettings.voltDiv3, liveScopeSettings.offset3, setMetrics3, 0, 0, w, h);
        if (node4) processWaveform(node4, '#c084fc', 'rgba(192,132,252,0.25)', liveScopeSettings.voltDiv4, liveScopeSettings.offset4, setMetrics4, 0, 0, w, h);
      } else if (mode === 'split_2ch' || mode === 'signal_analysis') {
        const subH = h / 2;
        drawGrid(0, 0, w, subH);
        drawGrid(0, subH, w, subH);

        // Divider
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, subH);
        ctx.lineTo(w, subH);
        ctx.stroke();

        if (node1) processWaveform(node1, '#22d3ee', 'rgba(34,211,238,0.25)', liveScopeSettings.voltDiv1, 0, setMetrics1, 0, 0, w, subH);
        if (node2) processWaveform(node2, '#f59e0b', 'rgba(245,158,11,0.25)', liveScopeSettings.voltDiv2, 0, setMetrics2, 0, subH, w, subH);
      } else if (mode === 'split_4ch') {
        const subH = h / 4;
        for (let i = 0; i < 4; i++) {
          drawGrid(0, i * subH, w, subH);
          if (i > 0) {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, i * subH);
            ctx.lineTo(w, i * subH);
            ctx.stroke();
          }
        }
        if (node1) processWaveform(node1, '#22d3ee', 'rgba(34,211,238,0.25)', liveScopeSettings.voltDiv1, 0, setMetrics1, 0, 0, w, subH);
        if (node2) processWaveform(node2, '#f59e0b', 'rgba(245,158,11,0.25)', liveScopeSettings.voltDiv2, 0, setMetrics2, 0, subH, w, subH);
        if (node3) processWaveform(node3, '#10b981', 'rgba(16,185,129,0.25)', liveScopeSettings.voltDiv3, 0, setMetrics3, 0, subH * 2, w, subH);
        if (node4) processWaveform(node4, '#c084fc', 'rgba(192,132,252,0.25)', liveScopeSettings.voltDiv4, 0, setMetrics4, 0, subH * 3, w, subH);
      }

      // Draw PAUSED / FROZEN banner if frozen
      if (livePaused || liveSimState.status !== 'running') {
        ctx.fillStyle = liveSimState.status === 'error' ? '#ef4444' : '#f59e0b';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(liveSimState.status === 'error' ? '⚠ PAUSED (ERROR/AUTO-CUT)' : '⏸ PAUSED / FROZEN', w - 18, 26);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [show]);

  // Save / Export High-Res PNG Image of CRT Canvas
  const handleSaveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const expCtx = exportCanvas.getContext('2d');
      if (!expCtx) return;

      // Draw base CRT content
      expCtx.drawImage(canvas, 0, 0);

      // Watermark & Channel Summary footer
      expCtx.font = 'bold 11px monospace';
      expCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      expCtx.textAlign = 'right';
      const timestampStr = new Date().toLocaleString();
      expCtx.fillText(`VirtualLab-HIL DSO • ${timestampStr}`, canvas.width - 15, canvas.height - 12);

      const dataUrl = exportCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = dataUrl;
      a.download = `oscilloscope_snapshot_${dateStr}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export oscilloscope image', err);
    }
  };

  if (!show) return null;

  const currentTabVoltDiv =
    selectedChannelTab === 1 ? scopeSettings.voltDiv1 :
    selectedChannelTab === 2 ? scopeSettings.voltDiv2 :
    selectedChannelTab === 3 ? scopeSettings.voltDiv3 : scopeSettings.voltDiv4;

  const updateCurrentTabVoltDiv = (val: number) => {
    const safeVal = Math.max(0.01, Math.min(val, 1000));
    if (selectedChannelTab === 1) updateScopeSettings({ voltDiv1: safeVal });
    else if (selectedChannelTab === 2) updateScopeSettings({ voltDiv2: safeVal });
    else if (selectedChannelTab === 3) updateScopeSettings({ voltDiv3: safeVal });
    else updateScopeSettings({ voltDiv4: safeVal });
  };

  // Timebase Step Up / Down
  const handleTimeDivStep = (direction: 'prev' | 'next') => {
    const current = scopeSettings.timeDiv;
    let closestIdx = 0;
    let minDiff = Infinity;
    TIME_DIV_PRESETS.forEach((p, idx) => {
      const diff = Math.abs(p.value - current);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    if (direction === 'prev' && closestIdx > 0) {
      updateScopeSettings({ timeDiv: TIME_DIV_PRESETS[closestIdx - 1].value });
    } else if (direction === 'next' && closestIdx < TIME_DIV_PRESETS.length - 1) {
      updateScopeSettings({ timeDiv: TIME_DIV_PRESETS[closestIdx + 1].value });
    }
  };

  // Volt/Div Step Up / Down
  const handleVoltDivStep = (direction: 'prev' | 'next') => {
    let closestIdx = 0;
    let minDiff = Infinity;
    VOLT_DIV_STEPS.forEach((step, idx) => {
      const diff = Math.abs(step - currentTabVoltDiv);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    if (direction === 'prev' && closestIdx > 0) {
      updateCurrentTabVoltDiv(VOLT_DIV_STEPS[closestIdx - 1]);
    } else if (direction === 'next' && closestIdx < VOLT_DIV_STEPS.length - 1) {
      updateCurrentTabVoltDiv(VOLT_DIV_STEPS[closestIdx + 1]);
    }
  };

  // Auto-Set Function (DSO AutoScale)
  const handleAutoScale = () => {
    const activeChannels: {
      chNum: 1 | 2 | 3 | 4;
      nodeId: string;
      metrics: ChannelMetrics;
    }[] = [];

    if (scopeSettings.enabled1 && ch1Node) activeChannels.push({ chNum: 1, nodeId: ch1Node, metrics: metrics1 });
    if (scopeSettings.enabled2 && ch2Node) activeChannels.push({ chNum: 2, nodeId: ch2Node, metrics: metrics2 });
    if (scopeSettings.enabled3 && ch3Node) activeChannels.push({ chNum: 3, nodeId: ch3Node, metrics: metrics3 });
    if (scopeSettings.enabled4 && ch4Node) activeChannels.push({ chNum: 4, nodeId: ch4Node, metrics: metrics4 });

    // Auto-connect CH1 if disconnected
    if (activeChannels.length === 0) {
      if (friendlyNetNodes.length > 0) {
        const firstNode = friendlyNetNodes[0].id;
        setCh1Node(firstNode);
        updateScopeSettings({ enabled1: true });
        activeChannels.push({ chNum: 1, nodeId: firstNode, metrics: metrics1 });
      }
    }

    const newSettings: Partial<typeof scopeSettings> = {};

    // 1. Calculate optimal V/div for each channel
    activeChannels.forEach(({ chNum, metrics }) => {
      const vpp = Math.max(metrics.vpp, 0.05);
      // Fit waveform within 4.5 to 5 vertical divisions on screen
      const idealVdiv = vpp / 4.5;
      const bestVoltDiv = VOLT_DIV_STEPS.find((step) => step >= idealVdiv) || VOLT_DIV_STEPS[VOLT_DIV_STEPS.length - 1];

      if (chNum === 1) {
        newSettings.voltDiv1 = bestVoltDiv;
        newSettings.offset1 = 0;
      } else if (chNum === 2) {
        newSettings.voltDiv2 = bestVoltDiv;
        newSettings.offset2 = 0;
      } else if (chNum === 3) {
        newSettings.voltDiv3 = bestVoltDiv;
        newSettings.offset3 = 0;
      } else if (chNum === 4) {
        newSettings.voltDiv4 = bestVoltDiv;
        newSettings.offset4 = 0;
      }
    });

    // 2. Calculate optimal Timebase from detected frequency
    const detectedFreqs = activeChannels
      .map((c) => c.metrics.freq)
      .filter((f) => f > 0.2 && isFinite(f));
    const dominantFreq = detectedFreqs.length > 0 ? Math.max(...detectedFreqs) : 1000;

    let targetTimeDiv = 0.001;
    if (dominantFreq > 0.2) {
      const period = 1 / dominantFreq;
      // Show ~2.5 to 3 full cycles across 10 horizontal divisions: 10 * timeDiv = 3 * period
      const idealTimeDiv = (3 * period) / 10;
      let minDiff = Infinity;
      let closestPreset = TIME_DIV_PRESETS[12]; // 1ms default
      for (const preset of TIME_DIV_PRESETS) {
        const diff = Math.abs(Math.log10(preset.value) - Math.log10(idealTimeDiv));
        if (diff < minDiff) {
          minDiff = diff;
          closestPreset = preset;
        }
      }
      targetTimeDiv = closestPreset.value;
    }
    newSettings.timeDiv = targetTimeDiv;

    // 3. Lock Trigger Source and Level
    if (activeChannels.length > 0) {
      const primary = activeChannels[0];
      newSettings.triggerChannel = primary.chNum;
      newSettings.triggerLevel = primary.metrics.vavg || 0;
    }

    updateScopeSettings(newSettings);

    const freqLabel = dominantFreq > 0.2 ? `${dominantFreq >= 1000 ? `${(dominantFreq / 1000).toFixed(1)} kHz` : `${dominantFreq.toFixed(0)} Hz`}` : 'DC';
    setAutoSetToast(`AUTO-SET: ${freqLabel} • ${formatTimeDiv(targetTimeDiv)}`);
    setTimeout(() => setAutoSetToast(null), 2800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-b border-slate-800 gap-3">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-700 text-cyan-400 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <h2 className="text-sm font-bold text-white tracking-wide whitespace-nowrap">
                  4-Channel Virtual Oscilloscope
                </h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 whitespace-nowrap shrink-0">
                  4-CH / 100V/div Max
                </span>
                {isPaused && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 animate-pulse whitespace-nowrap shrink-0">
                    FROZEN
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate hidden md:block">
                Multi-Channel Transient Waveform Visualizer & Signal Analyzer
              </p>
            </div>
          </div>

          {/* Action Controls & Display Mode Switcher */}
          <div className="flex items-center gap-2 shrink-0">
            {/* ⚡ AUTO / AUTOSCALE Button */}
            <button
              onClick={handleAutoScale}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.5)] transition hover:scale-105 active:scale-95 whitespace-nowrap shrink-0"
              title="AUTO-SET: Automatically adjust Timebase, Volts/Div, and Trigger for optimal viewing"
            >
              <Sparkles className="w-3.5 h-3.5 fill-slate-950 text-slate-950 animate-pulse" />
              <span>AUTO</span>
            </button>

            {/* Pause / Resume Button */}
            <button
              onClick={() => {
                if (!isPaused) {
                  pausedTimeRef.current = simulationState.currentTime;
                }
                setIsPaused(!isPaused);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0 ${
                isPaused
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm animate-pulse'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white'
              }`}
              title={isPaused ? 'Resume live transient trace' : 'Freeze & pause transient trace for inspection'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 fill-amber-300 text-amber-300" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'RESUME' : 'PAUSE'}</span>
            </button>

            {/* Save Waveform Image Button */}
            <button
              onClick={handleSaveImage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition shadow-sm whitespace-nowrap shrink-0"
              title="Save Oscilloscope Screen as High-Resolution PNG Image"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Save PNG</span>
            </button>

            {/* Display Mode Switcher (Overlay vs Separate Analysis) */}
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs font-medium shrink-0">
              <button
                onClick={() => updateScopeSettings({ displayMode: 'overlay' })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition whitespace-nowrap ${
                  (scopeSettings.displayMode || 'overlay') === 'overlay'
                    ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Overlay all channels on single CRT grid"
              >
                <Layers className="w-3.5 h-3.5" /> Overlay
              </button>
              <button
                onClick={() => updateScopeSettings({ displayMode: 'split_2ch' })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition whitespace-nowrap ${
                  scopeSettings.displayMode === 'split_2ch'
                    ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Separate 2-Channel Isolated Stack"
              >
                <Columns2 className="w-3.5 h-3.5" /> Dual Split
              </button>
              <button
                onClick={() => updateScopeSettings({ displayMode: 'split_4ch' })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition whitespace-nowrap ${
                  scopeSettings.displayMode === 'split_4ch'
                    ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Separate 4-Channel Quad Screen"
              >
                <Columns4 className="w-3.5 h-3.5" /> Quad Split
              </button>
              <button
                onClick={() => updateScopeSettings({ displayMode: 'signal_analysis' })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition whitespace-nowrap ${
                  scopeSettings.displayMode === 'signal_analysis'
                    ? 'bg-purple-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Separate Signal Analysis & FFT Comparative Mode"
              >
                <BarChart3 className="w-3.5 h-3.5" /> Analysis
              </button>
            </div>

            <button
              onClick={() => setShow(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0 ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Main Work Area (Canvas + Controls Sidebar) ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Canvas Screen */}
          <div className="flex-1 bg-black relative flex flex-col items-center justify-center p-3">
            <canvas
              ref={canvasRef}
              width={820}
              height={440}
              className="w-full h-full rounded-xl border border-slate-800 shadow-2xl"
            />

            {/* Auto-Set Toast Notification Floating Banner */}
            {autoSetToast && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-amber-950/90 border border-amber-500/80 text-amber-200 font-mono text-xs shadow-2xl flex items-center gap-2 backdrop-blur-md animate-in fade-in zoom-in duration-150">
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400 animate-spin [animation-duration:3s]" />
                <span className="font-bold tracking-wide">{autoSetToast}</span>
              </div>
            )}

            {/* Live Channel Badges Floating Overlay */}
            <div className="absolute top-5 left-5 flex gap-2 pointer-events-none">
              {scopeSettings.enabled1 && ch1Node && (
                <div className="px-2.5 py-1 rounded-md bg-cyan-950/90 border border-cyan-700 text-cyan-300 font-mono text-[11px] flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>CH1: {metrics1.vpp.toFixed(2)}Vpp ({metrics1.freq > 0 ? `${metrics1.freq.toFixed(0)}Hz` : 'DC'})</span>
                </div>
              )}
              {scopeSettings.enabled2 && ch2Node && (
                <div className="px-2.5 py-1 rounded-md bg-amber-950/90 border border-amber-700 text-amber-300 font-mono text-[11px] flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>CH2: {metrics2.vpp.toFixed(2)}Vpp ({metrics2.freq > 0 ? `${metrics2.freq.toFixed(0)}Hz` : 'DC'})</span>
                </div>
              )}
              {scopeSettings.enabled3 && ch3Node && (
                <div className="px-2.5 py-1 rounded-md bg-emerald-950/90 border border-emerald-700 text-emerald-300 font-mono text-[11px] flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>CH3: {metrics3.vpp.toFixed(2)}Vpp</span>
                </div>
              )}
              {scopeSettings.enabled4 && ch4Node && (
                <div className="px-2.5 py-1 rounded-md bg-purple-950/90 border border-purple-700 text-purple-300 font-mono text-[11px] flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span>CH4: {metrics4.vpp.toFixed(2)}Vpp</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Controls & Signal Analysis Sidebar ── */}
          <div className="w-96 bg-slate-950/90 border-l border-slate-800 p-4 flex flex-col gap-3 overflow-y-auto custom-scrollbar text-xs">
            {/* Channel Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
              {CHANNEL_COLORS.map((ch, idx) => {
                const chNum = (idx + 1) as 1 | 2 | 3 | 4;
                const isSelected = selectedChannelTab === chNum;
                return (
                  <button
                    key={ch.key}
                    onClick={() => setSelectedChannelTab(chNum)}
                    className={`py-1.5 rounded-lg font-mono font-bold transition flex items-center justify-center gap-1 text-[11px] ${
                      isSelected
                        ? `${ch.bg} ${ch.text} ${ch.border} border shadow-md`
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span>{ch.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected Channel Settings Card */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`font-bold font-mono text-sm ${CHANNEL_COLORS[selectedChannelTab - 1].text}`}>
                  {CHANNEL_COLORS[selectedChannelTab - 1].name} Probe Source
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={
                      selectedChannelTab === 1 ? scopeSettings.enabled1 :
                      selectedChannelTab === 2 ? scopeSettings.enabled2 :
                      selectedChannelTab === 3 ? scopeSettings.enabled3 : scopeSettings.enabled4
                    }
                    onChange={(e) => {
                      const val = e.target.checked;
                      if (selectedChannelTab === 1) updateScopeSettings({ enabled1: val });
                      else if (selectedChannelTab === 2) updateScopeSettings({ enabled2: val });
                      else if (selectedChannelTab === 3) updateScopeSettings({ enabled3: val });
                      else updateScopeSettings({ enabled4: val });
                    }}
                    className="accent-cyan-500 rounded"
                  />
                  <span>Active</span>
                </label>
              </div>

              {/* Probe Node Selector */}
              <select
                value={
                  selectedChannelTab === 1 ? ch1Node :
                  selectedChannelTab === 2 ? ch2Node :
                  selectedChannelTab === 3 ? ch3Node : ch4Node
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (selectedChannelTab === 1) setCh1Node(val);
                  else if (selectedChannelTab === 2) setCh2Node(val);
                  else if (selectedChannelTab === 3) setCh3Node(val);
                  else setCh4Node(val);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs outline-none focus:border-cyan-400 font-mono"
              >
                <option value="">-- Disconnected --</option>
                {friendlyNetNodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>

              {/* Sensed Connection Details Box */}
              {(() => {
                const activeNodeId =
                  selectedChannelTab === 1 ? ch1Node :
                  selectedChannelTab === 2 ? ch2Node :
                  selectedChannelTab === 3 ? ch3Node : ch4Node;
                const activeMetrics =
                  selectedChannelTab === 1 ? metrics1 :
                  selectedChannelTab === 2 ? metrics2 :
                  selectedChannelTab === 3 ? metrics3 : metrics4;
                const activeFriendly = friendlyNetNodes.find((n) => n.id === activeNodeId);

                return activeNodeId ? (
                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 space-y-1.5 text-[11px] font-mono shadow-inner">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-cyan-400 font-bold">Probe Node (+):</span>
                      <span className="text-right text-white font-medium truncate max-w-[170px]">
                        {activeFriendly?.label || activeNodeId}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span className="text-slate-500 font-bold">Reference (-):</span>
                      <span className="text-right text-slate-300">0V Ground Net</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                      <span className="text-slate-400">Channel Output:</span>
                      <span className="font-bold text-cyan-300">
                        CH {selectedChannelTab} ({activeMetrics.vpp.toFixed(2)} Vpp, {activeMetrics.freq > 0 ? `${activeMetrics.freq.toFixed(0)} Hz` : 'DC'})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-2 rounded bg-slate-950/40 border border-slate-800 text-[10px] text-slate-500 italic text-center font-mono">
                    No probe node connected to CH {selectedChannelTab}
                  </div>
                );
              })()}

              {/* ── Vertical Scale: V/div (10mV to 100V with Rotary Steps) ── */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 font-semibold">Vertical Scale (V/div)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleVoltDivStep('prev')}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      title="Step Down Scale"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span className="px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-center font-mono font-bold text-cyan-300 text-xs min-w-[64px]">
                      {currentTabVoltDiv >= 1 ? `${currentTabVoltDiv} V/div` : `${Math.round(currentTabVoltDiv * 1000)} mV/div`}
                    </span>
                    <button
                      onClick={() => handleVoltDivStep('next')}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      title="Step Up Scale"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Quick Presets from 10mV to 100V */}
                <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
                  {[0.05, 0.2, 0.5, 1.0, 2.0, 5.0, 20.0, 100.0].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateCurrentTabVoltDiv(preset)}
                      className={`py-1 rounded border transition ${
                        currentTabVoltDiv === preset
                          ? 'bg-cyan-600 text-white border-cyan-500 font-bold shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {preset >= 1 ? `${preset}V` : `${preset * 1000}mV`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Offset Position Slider */}
              <div className="space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Position Offset</span>
                  <span className="font-mono text-slate-200">
                    {selectedChannelTab === 1 ? scopeSettings.offset1 :
                     selectedChannelTab === 2 ? scopeSettings.offset2 :
                     selectedChannelTab === 3 ? scopeSettings.offset3 : scopeSettings.offset4} div
                  </span>
                </div>
                <input
                  type="range"
                  min="-4"
                  max="4"
                  step="0.2"
                  value={
                    selectedChannelTab === 1 ? scopeSettings.offset1 :
                    selectedChannelTab === 2 ? scopeSettings.offset2 :
                    selectedChannelTab === 3 ? scopeSettings.offset3 : scopeSettings.offset4
                  }
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (selectedChannelTab === 1) updateScopeSettings({ offset1: val });
                    else if (selectedChannelTab === 2) updateScopeSettings({ offset2: val });
                    else if (selectedChannelTab === 3) updateScopeSettings({ offset3: val });
                    else updateScopeSettings({ offset4: val });
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            {/* ── Separate Signal Analysis Section ── */}
            {scopeSettings.displayMode === 'signal_analysis' && (
              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/60 space-y-2">
                <div className="flex items-center gap-1.5 text-purple-300 font-bold font-mono text-xs">
                  <BarChart3 className="w-4 h-4" />
                  <span>Comparative Signal Analytics</span>
                </div>

                <div className="space-y-1.5 text-[11px] font-mono">
                  <div className="flex justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-cyan-400">CH1 Peak-to-Peak:</span>
                    <span className="font-bold text-white">{metrics1.vpp.toFixed(3)} V</span>
                  </div>
                  <div className="flex justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-amber-400">CH2 Peak-to-Peak:</span>
                    <span className="font-bold text-white">{metrics2.vpp.toFixed(3)} V</span>
                  </div>
                  <div className="flex justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-purple-300">Voltage Ratio (Gain):</span>
                    <span className="font-bold text-green-400">
                      {metrics1.vpp > 0 ? (metrics2.vpp / metrics1.vpp).toFixed(3) : 'N/A'} (
                      {metrics1.vpp > 0 && metrics2.vpp > 0 ? `${(20 * Math.log10(metrics2.vpp / metrics1.vpp)).toFixed(1)} dB` : '0 dB'}
                      )
                    </span>
                  </div>
                  <div className="flex justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400">CH1 RMS / DC Avg:</span>
                    <span className="text-slate-200">{metrics1.vrms.toFixed(2)}V / {metrics1.vavg.toFixed(2)}V</span>
                  </div>
                  <div className="flex justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400">CH2 RMS / DC Avg:</span>
                    <span className="text-slate-200">{metrics2.vrms.toFixed(2)}V / {metrics2.vavg.toFixed(2)}V</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Extended Timebase Scale (100ns to 5s) ── */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-semibold text-slate-300">Horizontal Timebase</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTimeDivStep('prev')}
                    className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                    title="Zoom In (Decrease Time/div)"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="px-2.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-center font-mono font-bold text-green-400 text-xs min-w-[78px]">
                    {formatTimeDiv(scopeSettings.timeDiv)}
                  </span>
                  <button
                    onClick={() => handleTimeDivStep('next')}
                    className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                    title="Zoom Out (Increase Time/div)"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Quick Decade Presets (100ns to 5s) */}
              <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
                {[
                  { label: '100ns', val: 100e-9 },
                  { label: '1µs', val: 1e-6 },
                  { label: '10µs', val: 10e-6 },
                  { label: '100µs', val: 100e-6 },
                  { label: '1ms', val: 1e-3 },
                  { label: '10ms', val: 10e-3 },
                  { label: '100ms', val: 100e-3 },
                  { label: '1s', val: 1.0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => updateScopeSettings({ timeDiv: preset.val })}
                    className={`py-1 rounded border transition ${
                      Math.abs(scopeSettings.timeDiv - preset.val) < preset.val * 0.1
                        ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Decade Step Range Slider */}
              <input
                type="range"
                min="0"
                max={TIME_DIV_PRESETS.length - 1}
                step="1"
                value={(() => {
                  let closestIdx = 0;
                  let minDiff = Infinity;
                  TIME_DIV_PRESETS.forEach((p, idx) => {
                    const diff = Math.abs(p.value - scopeSettings.timeDiv);
                    if (diff < minDiff) {
                      minDiff = diff;
                      closestIdx = idx;
                    }
                  });
                  return closestIdx;
                })()}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  updateScopeSettings({ timeDiv: TIME_DIV_PRESETS[idx].value });
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-green-400"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>100ns (HF)</span>
                <span>1ms</span>
                <span>5s (Slow)</span>
              </div>
            </div>

            {/* Simulation Slow-Motion Speed */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span className="font-semibold">Simulation Speed Multiplier</span>
                <span className="font-mono text-amber-400 font-bold">
                  {simulationState.config.speedMultiplier ?? 0.05}x
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 font-mono text-[10px]">
                {[0.05, 0.1, 0.25, 0.5, 1.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSpeedMultiplier(spd)}
                    className={`py-1 rounded border transition ${
                      (simulationState.config.speedMultiplier ?? 0.05) === spd
                        ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
