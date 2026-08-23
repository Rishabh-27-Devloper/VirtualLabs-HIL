// ============================================================
// VirtualLab-HIL — Arbitrary Waveform Function Generator Modal
// ============================================================

import React, { useRef, useEffect, useState } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import { Zap, X, Activity } from 'lucide-react';
import type { WaveformType } from '@/types/circuit';
import { evaluateWaveform } from '@/engine/mnaSolver';

export const SignalGeneratorModal: React.FC = () => {
  const show = useCircuitStore((s) => s.showSignalGenerator);
  const setShow = useCircuitStore((s) => s.setShowSignalGenerator);
  const components = useCircuitStore((s) => s.components);
  const updateComponentParams = useCircuitStore((s) => s.updateComponentParams);

  // Find active signal generator or AC voltage source on canvas
  const activeGen = Object.values(components).find(
    (c) => c.kind === 'signal_generator' || c.kind === 'ac_voltage',
  );

  const [waveform, setWaveform] = useState<WaveformType>(activeGen?.params.waveform || 'sine');
  const [freq, setFreq] = useState<number>(activeGen?.params.frequency || 1000);
  const [amp, setAmp] = useState<number>(activeGen?.params.voltage || activeGen?.params.amplitude || 5);
  const [offset, setOffset] = useState<number>(activeGen?.params.offset || 0);
  const [duty, setDuty] = useState<number>(activeGen?.params.dutyCycle || 0.5);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync back to component params
  useEffect(() => {
    if (activeGen) {
      updateComponentParams(activeGen.id, {
        waveform,
        frequency: freq,
        voltage: amp,
        amplitude: amp,
        offset,
        dutyCycle: duty,
      });
    }
  }, [waveform, freq, amp, offset, duty, activeGen?.id]);

  // Render Wave Preview Canvas
  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    // Center baseline
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Draw 2 cycles
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    const period = 1 / freq;
    const totalT = period * 2;

    for (let x = 0; x < w; x++) {
      const t = (x / w) * totalT;
      const v = evaluateWaveform(waveform, amp, freq, 0, offset, t, duty);
      // Scale: +/- 10V full range
      const y = h / 2 - (v / 10) * (h / 2);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [show, waveform, freq, amp, offset, duty]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-bold text-white tracking-wide">
              Arbitrary Function Generator
            </h2>
          </div>
          <button
            onClick={() => setShow(false)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-4 flex flex-col gap-4 bg-slate-950">
          {/* Waveform Selector */}
          <div className="grid grid-cols-6 gap-2">
            {(['sine', 'cosine', 'square', 'triangle', 'sawtooth', 'pulse'] as WaveformType[]).map((w) => (
              <button
                key={w}
                onClick={() => setWaveform(w)}
                className={`py-2 px-1 text-xs font-semibold uppercase rounded-md border text-center transition ${
                  waveform === w
                    ? 'bg-purple-900/60 border-purple-400 text-purple-200 shadow-md shadow-purple-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          {/* Preview Display */}
          <div className="rounded-lg overflow-hidden border border-slate-800 shadow-inner">
            <canvas ref={canvasRef} width={580} height={140} className="w-full h-auto block" />
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-2 gap-4 bg-slate-900/70 p-3 rounded-lg border border-slate-800 text-xs">
            {/* Frequency */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Frequency</span>
                <span className="font-mono text-purple-300 font-bold">{freq} Hz</span>
              </div>
              <input
                type="range"
                min="1"
                max="5000"
                step="1"
                value={freq}
                onChange={(e) => setFreq(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded accent-purple-400"
              />
            </div>

            {/* Amplitude */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Amplitude (Vpk)</span>
                <span className="font-mono text-purple-300 font-bold">{amp} V</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="12"
                step="0.5"
                value={amp}
                onChange={(e) => setAmp(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded accent-purple-400"
              />
            </div>

            {/* Offset */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>DC Offset</span>
                <span className="font-mono text-purple-300 font-bold">{offset} V</span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="0.1"
                value={offset}
                onChange={(e) => setOffset(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded accent-purple-400"
              />
            </div>

            {/* Duty Cycle (for pulse) */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Duty Cycle</span>
                <span className="font-mono text-purple-300 font-bold">{Math.round(duty * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                value={duty}
                onChange={(e) => setDuty(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded accent-purple-400"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
