// ============================================================
// VirtualLab-HIL — Characteristic Curve Analyzer & X-Y Plotter Modal
// ============================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useCircuitStore, computeNetlist } from '@/store/circuitStore';
import {
  LineChart, X, Play, Square, Sparkles, FileSpreadsheet
} from 'lucide-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import {
  extractCircuitVariables,
  runParameterSweepAsync,
  type SweepOptions,
} from '@/services/curveAnalysisService';
import type { CurveSeries } from '@/types/circuit';
import { logger } from '@/utils/logger';

export const CharacteristicCurveModal: React.FC = () => {
  const show = useCircuitStore((s) => s.showCharacteristicCurve);
  const setShow = useCircuitStore((s) => s.setShowCharacteristicCurve);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const pauseSimulation = useCircuitStore((s) => s.pauseSimulation);
  const simulationState = useCircuitStore((s) => s.simulationState);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  const chartRef = useRef<HTMLDivElement>(null);
  const uplotInstance = useRef<uPlot | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const netlist = useMemo(() => computeNetlist(components, edges), [components, edges]);
  const availableVars = useMemo(() => extractCircuitVariables(netlist), [netlist]);

  // Sweep Setup State
  const [sweepCompId, setSweepCompId] = useState<string>('');
  const [sweepParam, setSweepParam] = useState<'voltage' | 'amplitude' | 'frequency' | 'current' | 'resistance'>('voltage');
  const [sweepStart, setSweepStart] = useState<number>(0);
  const [sweepStop, setSweepStop] = useState<number>(5);
  const [sweepSteps, setSweepSteps] = useState<number>(100);
  const [sweepScale, setSweepScale] = useState<'linear' | 'logarithmic'>('linear');

  // Secondary Step (Family Curves)
  const [enableSecondary, setEnableSecondary] = useState<boolean>(false);
  const [secondaryCompId, setSecondaryCompId] = useState<string>('');
  const [secondaryParam, setSecondaryParam] = useState<string>('current');
  const [secondaryValuesStr, setSecondaryValuesStr] = useState<string>('10e-6, 20e-6, 30e-6, 40e-6, 50e-6');

  // Axes Variables
  const [xAxisVarId, setXAxisVarId] = useState<string>('');
  const [yAxisVarId, setYAxisVarId] = useState<string>('');

  // Derived Expression
  const [useFormula, setUseFormula] = useState<boolean>(false);
  const [formulaStr, setFormulaStr] = useState<string>('rawY / (x || 1)');

  // Sweep Execution State
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [pointsDone, setPointsDone] = useState<number>(0);
  const [resultSeries, setResultSeries] = useState<CurveSeries[]>([]);

  // Auto-select sensible defaults when available variables change
  useEffect(() => {
    if (availableVars.length === 0) return;

    if (!sweepCompId) {
      const sourceComp = Object.values(components).find((c) =>
        c.kind === 'dc_voltage' || c.kind === 'ac_voltage' || c.kind === 'current_source'
      );
      if (sourceComp) {
        setSweepCompId(sourceComp.id);
        if (sourceComp.kind === 'current_source') setSweepParam('current');
        else setSweepParam('voltage');
      }
    }

    if (!xAxisVarId) {
      const xVar = availableVars.find((v) => v.category === 'source' || v.id.includes('vce') || v.id.includes('v_drop'));
      if (xVar) setXAxisVarId(xVar.id);
      else if (availableVars[0]) setXAxisVarId(availableVars[0].id);
    }

    if (!yAxisVarId) {
      const yVar = availableVars.find((v) => v.category === 'current' || v.id.includes('ic') || v.id.includes('vout'));
      if (yVar) setYAxisVarId(yVar.id);
      else if (availableVars[1]) setYAxisVarId(availableVars[1].id);
    }
  }, [availableVars, components, sweepCompId, xAxisVarId, yAxisVarId]);

  // Apply Common Presets
  const applyPreset = (presetKey: string) => {
    switch (presetKey) {
      case 'diode_iv': {
        const diode = Object.values(components).find((c) => c.kind === 'diode' || c.kind === 'zener');
        const source = Object.values(components).find((c) => c.kind === 'dc_voltage');
        if (source && diode) {
          setSweepCompId(source.id);
          setSweepParam('voltage');
          setSweepStart(0);
          setSweepStop(1.5);
          setSweepSteps(150);
          setXAxisVarId(diode.id + ':v_drop');
          setYAxisVarId(diode.id + ':current');
          setEnableSecondary(false);
          setUseFormula(false);
        }
        break;
      }
      case 'bjt_output': {
        const bjt = Object.values(components).find((c) => c.kind === 'bjt_npn' || c.kind === 'bjt_pnp');
        const vceSource = Object.values(components).find((c) => c.kind === 'dc_voltage');
        const ibSource = Object.values(components).find((c) => c.kind === 'current_source');
        if (bjt && vceSource) {
          setSweepCompId(vceSource.id);
          setSweepParam('voltage');
          setSweepStart(0);
          setSweepStop(10);
          setSweepSteps(100);
          setXAxisVarId(bjt.id + ':vce');
          setYAxisVarId(bjt.id + ':ic');
          if (ibSource) {
            setEnableSecondary(true);
            setSecondaryCompId(ibSource.id);
            setSecondaryParam('current');
            setSecondaryValuesStr('10e-6, 20e-6, 30e-6, 40e-6, 50e-6');
          }
          setUseFormula(false);
        }
        break;
      }
      case 'bjt_transfer': {
        const bjt = Object.values(components).find((c) => c.kind === 'bjt_npn' || c.kind === 'bjt_pnp');
        const vbeSource = Object.values(components).find((c) => c.kind === 'dc_voltage');
        if (bjt && vbeSource) {
          setSweepCompId(vbeSource.id);
          setSweepParam('voltage');
          setSweepStart(0.4);
          setSweepStop(0.85);
          setSweepSteps(120);
          setXAxisVarId(bjt.id + ':vbe');
          setYAxisVarId(bjt.id + ':ic');
          setEnableSecondary(false);
          setUseFormula(false);
        }
        break;
      }
      case 'voltage_gain': {
        setUseFormula(true);
        setFormulaStr('rawY / (x || 1e-6)');
        break;
      }
      case 'gain_db': {
        setUseFormula(true);
        setFormulaStr('20 * log10(abs(rawY / (x || 1e-6)))');
        break;
      }
      default:
        break;
    }
  };

  // Run Parameter Sweep
  const handleRunSweep = useCallback(() => {
    if (!sweepCompId || !xAxisVarId || !yAxisVarId) return;

    if (simulationState.status === 'running') {
      pauseSimulation();
      logger.info('engine', 'Paused background simulation for Characteristic Curve sweep.');
    }

    setIsSweeping(true);
    setProgress(0);
    setPointsDone(0);

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    let secondaryVals: number[] | undefined;
    if (enableSecondary && secondaryValuesStr) {
      secondaryVals = secondaryValuesStr
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
    }

    const options: SweepOptions = {
      sweepComponentId: sweepCompId,
      sweepParam,
      sweepStart,
      sweepStop,
      sweepSteps,
      sweepScale,
      secondaryComponentId: enableSecondary ? secondaryCompId : undefined,
      secondaryParam: enableSecondary ? secondaryParam : undefined,
      secondaryValues: secondaryVals,
      xVariableId: xAxisVarId,
      yVariableId: yAxisVarId,
      customFormula: useFormula ? formulaStr : undefined,
    };

    runParameterSweepAsync(
      netlist,
      options,
      (pct, pts) => {
        setProgress(pct);
        setPointsDone(pts);
      },
      (series) => {
        setResultSeries(series);
        setIsSweeping(false);
        logger.success('engine', 'Characteristic Curve sweep complete!');
      },
      abortCtrl.signal
    );
  }, [
    sweepCompId, sweepParam, sweepStart, sweepStop, sweepSteps, sweepScale,
    enableSecondary, secondaryCompId, secondaryParam, secondaryValuesStr,
    xAxisVarId, yAxisVarId, useFormula, formulaStr, netlist, simulationState.status, pauseSimulation
  ]);

  const handleStopSweep = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setIsSweeping(false);
  };

  // uPlot rendering effect
  useEffect(() => {
    if (!chartRef.current || resultSeries.length === 0) return;

    if (uplotInstance.current) {
      uplotInstance.current.destroy();
      uplotInstance.current = null;
    }

    const base = resultSeries[0];
    if (!base || base.points.length === 0) return;

    const xData = base.points.map((p) => p.x);
    const dataArrays: number[][] = [xData];

    resultSeries.forEach((s) => {
      dataArrays.push(s.points.map((p) => p.y));
    });

    const seriesConfig: uPlot.Series[] = [
      {
        label: availableVars.find((v) => v.id === xAxisVarId)?.label || 'X Axis',
      },
      ...resultSeries.map((s) => ({
        label: s.name,
        stroke: s.color,
        width: 2.5,
      })),
    ];

    const width = chartRef.current.clientWidth || 700;
    const height = chartRef.current.clientHeight || 420;

    const opts: uPlot.Options = {
      width,
      height,
      cursor: {
        drag: { setScale: true },
        points: { size: 6, fill: '#22d3ee' },
      },
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      axes: [
        {
          stroke: isDark ? '#94a3b8' : '#475569',
          grid: { stroke: isDark ? '#1e293b' : '#e2e8f0', width: 1 },
          ticks: { stroke: isDark ? '#334155' : '#cbd5e1', width: 1 },
        },
        {
          stroke: isDark ? '#94a3b8' : '#475569',
          grid: { stroke: isDark ? '#1e293b' : '#e2e8f0', width: 1 },
          ticks: { stroke: isDark ? '#334155' : '#cbd5e1', width: 1 },
        },
      ],
      series: seriesConfig,
    };

    uplotInstance.current = new uPlot(opts, dataArrays as any, chartRef.current);

    const handleResize = () => {
      if (uplotInstance.current && chartRef.current) {
        uplotInstance.current.setSize({
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (uplotInstance.current) {
        uplotInstance.current.destroy();
        uplotInstance.current = null;
      }
    };
  }, [resultSeries, isDark, xAxisVarId, availableVars]);

  const handleExportCSV = () => {
    if (resultSeries.length === 0) return;
    const base = resultSeries[0];
    let csv = 'X,' + resultSeries.map((s) => '"' + s.name + '"').join(',') + '\n';
    base.points.forEach((p, idx) => {
      const row = [p.x, ...resultSeries.map((s) => s.points[idx]?.y ?? 0)];
      csv += row.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'characteristic_curve_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-700 text-cyan-400">
              <LineChart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Characteristic Curve Analyzer
                </h2>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  X-Y Sweeper
                </span>
                {isSweeping && (
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
                    SWEEPING {progress}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                Non-Blocking Parameter Sweeper & Multi-Variable Plotter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              onChange={(e) => applyPreset(e.target.value)}
              defaultValue=""
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-300 border border-slate-700 text-xs font-medium outline-none cursor-pointer hover:border-cyan-600 transition"
            >
              <option value="" disabled>Load Preset Curve...</option>
              <option value="diode_iv">Diode Forward I-V Curve (Id vs Vd)</option>
              <option value="bjt_output">Transistor Output Curves (Ic vs Vce)</option>
              <option value="bjt_transfer">Transistor Transfer Curve (Ic vs Vbe)</option>
              <option value="voltage_gain">Voltage Gain (Vo / Vi)</option>
              <option value="gain_db">Bode Gain Magnitude (20*log10(Gv))</option>
            </select>

            {isSweeping ? (
              <button
                onClick={handleStopSweep}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg transition"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>STOP</span>
              </button>
            ) : (
              <button
                onClick={handleRunSweep}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 shadow-md hover:scale-105 active:scale-95 transition"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                <span>PLOT CURVE</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              disabled={resultSeries.length === 0}
              className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800 disabled:opacity-40 transition"
              title="Export CSV Data"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShow(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Work Area */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
          {/* Controls Sidebar */}
          <div className="w-full lg:w-80 bg-slate-950/90 border-r border-slate-800 p-3 sm:p-4 flex flex-col gap-3 overflow-y-auto text-xs shrink-0">
            {/* 1. Primary Swept Source */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <span className="font-bold text-cyan-400 font-mono block text-[11px]">
                1. Swept Independent Variable
              </span>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Target Component</label>
                <select
                  value={sweepCompId}
                  onChange={(e) => setSweepCompId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                >
                  <option value="" disabled>Select Source Component...</option>
                  {Object.values(components).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.id} ({c.kind})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Start Value</label>
                  <input
                    type="number"
                    step="any"
                    value={sweepStart}
                    onChange={(e) => setSweepStart(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Stop Value</label>
                  <input
                    type="number"
                    step="any"
                    value={sweepStop}
                    onChange={(e) => setSweepStop(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-white text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Steps (10-500)</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={sweepSteps}
                    onChange={(e) => setSweepSteps(parseInt(e.target.value) || 100)}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Scale</label>
                  <select
                    value={sweepScale}
                    onChange={(e) => setSweepScale(e.target.value as any)}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                  >
                    <option value="linear">Linear</option>
                    <option value="logarithmic">Logarithmic</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Secondary Stepped Variable (Family Curves) */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-400 font-mono text-[11px]">
                  2. Family Curves (Step 2nd Var)
                </span>
                <input
                  type="checkbox"
                  checked={enableSecondary}
                  onChange={(e) => setEnableSecondary(e.target.checked)}
                  className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                />
              </div>

              {enableSecondary && (
                <div className="space-y-2 pt-1 animate-in fade-in">
                  <select
                    value={secondaryCompId}
                    onChange={(e) => setSecondaryCompId(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                  >
                    <option value="" disabled>Select Stepped Component...</option>
                    {Object.values(components).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label || c.id} ({c.kind})
                      </option>
                    ))}
                  </select>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Step Values (Comma-Separated)</label>
                    <input
                      type="text"
                      value={secondaryValuesStr}
                      onChange={(e) => setSecondaryValuesStr(e.target.value)}
                      placeholder="10e-6, 20e-6, 30e-6"
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-white text-xs outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Axis Variables & Custom Formula */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <span className="font-bold text-purple-400 font-mono block text-[11px]">
                3. Plotted Variables (X vs Y)
              </span>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">X-Axis Variable</label>
                <select
                  value={xAxisVarId}
                  onChange={(e) => setXAxisVarId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                >
                  {availableVars.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.category.toUpperCase()}] {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Y-Axis Variable</label>
                <select
                  value={yAxisVarId}
                  onChange={(e) => setYAxisVarId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                >
                  {availableVars.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.category.toUpperCase()}] {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-1 border-t border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300 font-medium">Custom Formula (e.g. Gain)</span>
                  <input
                    type="checkbox"
                    checked={useFormula}
                    onChange={(e) => setUseFormula(e.target.checked)}
                    className="accent-purple-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </div>

                {useFormula && (
                  <div className="space-y-1.5 animate-in fade-in">
                    <input
                      type="text"
                      value={formulaStr}
                      onChange={(e) => setFormulaStr(e.target.value)}
                      placeholder="rawY / (x || 1e-6)"
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-cyan-300 text-xs outline-none"
                    />
                    <div className="flex gap-1 flex-wrap font-mono text-[9px]">
                      <button
                        onClick={() => setFormulaStr('rawY / (x || 1e-6)')}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        Vo/Vi
                      </button>
                      <button
                        onClick={() => setFormulaStr('20 * log10(abs(rawY / (x || 1e-6)))')}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        Gain (dB)
                      </button>
                      <button
                        onClick={() => setFormulaStr('x * rawY')}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        Power (P=V*I)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Graph Display */}
          <div className="flex-1 bg-black p-3 sm:p-4 flex flex-col items-center justify-center relative min-h-[350px]">
            {isSweeping && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
                <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="font-mono text-sm font-bold text-white tracking-wider">
                  SOLVING SWEEP: {progress}% ({pointsDone} pts)
                </span>
                <div className="w-64 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100"
                    style={{ width: progress + '%' }}
                  />
                </div>
              </div>
            )}

            {resultSeries.length > 0 ? (
              <div ref={chartRef} className="w-full h-full min-h-[350px] rounded-xl overflow-hidden" />
            ) : (
              <div className="text-center text-slate-500 space-y-2">
                <LineChart className="w-12 h-12 mx-auto text-slate-700" />
                <p className="font-mono text-xs">No curve generated yet.</p>
                <p className="text-[11px] text-slate-600 max-w-sm">
                  Select your swept variable and target axes on the left, or load a preset, then click <b>PLOT CURVE</b>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
