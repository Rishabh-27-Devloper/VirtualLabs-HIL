// ============================================================
// VirtualLab-HIL — Characteristic Curve Analyzer & X-Y Plotter Modal
// ============================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useCircuitStore, computeNetlist } from '@/store/circuitStore';
import {
  LineChart, X, Play, Square, Sparkles, FileSpreadsheet,
  Tag, Calculator, Sliders, Plus, Trash2, Zap
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

function formatAxisSplits(splits: number[]): string[] {
  if (!splits || splits.length === 0) return [];
  let minDiff = Infinity;
  for (let i = 1; i < splits.length; i++) {
    const diff = Math.abs(splits[i] - splits[i - 1]);
    if (diff > 1e-15 && diff < minDiff) minDiff = diff;
  }
  if (!isFinite(minDiff)) minDiff = Math.abs(splits[0]) || 1;

  const maxAbs = Math.max(...splits.map((s) => (isNaN(s) ? 0 : Math.abs(s))));
  if (maxAbs === 0) return splits.map(() => '0');

  let unitPrefix = '';
  let scale = 1;

  if (maxAbs >= 1e6) {
    unitPrefix = 'M';
    scale = 1e-6;
  } else if (maxAbs >= 1e3) {
    unitPrefix = 'k';
    scale = 1e-3;
  } else if (maxAbs >= 1) {
    unitPrefix = '';
    scale = 1;
  } else if (maxAbs >= 1e-3) {
    unitPrefix = 'm';
    scale = 1e3;
  } else if (maxAbs >= 1e-6) {
    unitPrefix = 'µ';
    scale = 1e6;
  } else if (maxAbs >= 1e-9) {
    unitPrefix = 'n';
    scale = 1e9;
  } else if (maxAbs >= 1e-12) {
    unitPrefix = 'p';
    scale = 1e12;
  }

  const scaledStep = minDiff * scale;
  let decimals = 0;
  if (scaledStep < 0.001) decimals = 4;
  else if (scaledStep < 0.01) decimals = 3;
  else if (scaledStep < 0.1) decimals = 2;
  else if (scaledStep < 1) decimals = 1;
  else decimals = 0;

  return splits.map((v) => {
    if (isNaN(v)) return '--';
    const scaledVal = v * scale;
    const cleanVal = Math.abs(scaledVal) < 1e-12 ? 0 : scaledVal;
    return `${cleanVal.toFixed(decimals)}${unitPrefix}`;
  });
}

function formatHoverValue(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return '--';
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs >= 1e6) return `${(v / 1e6).toFixed(3)} M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(3)} k`;
  if (abs >= 1) return `${v.toFixed(3)}`;
  if (abs >= 1e-3) return `${(v * 1e3).toFixed(3)} m`;
  if (abs >= 1e-6) return `${(v * 1e6).toFixed(3)} µ`;
  if (abs >= 1e-9) return `${(v * 1e9).toFixed(3)} n`;
  if (abs >= 1e-12) return `${(v * 1e12).toFixed(3)} p`;
  return v.toExponential(3);
}

export const CharacteristicCurveModal: React.FC = () => {
  const show = useCircuitStore((s) => s.showCharacteristicCurve);
  const setShow = useCircuitStore((s) => s.setShowCharacteristicCurve);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const pauseSimulation = useCircuitStore((s) => s.pauseSimulation);
  const simulationState = useCircuitStore((s) => s.simulationState);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  // Store actions for Derived Variables and Primary Markers
  const derivedVariables = useCircuitStore((s) => s.derivedVariables);
  const addDerivedVariable = useCircuitStore((s) => s.addDerivedVariable);
  const removeDerivedVariable = useCircuitStore((s) => s.removeDerivedVariable);
  const setAnalogMarker = useCircuitStore((s) => s.setAnalogMarker);

  // Active Tab: 'plotter' | 'markers' | 'formulas'
  const [activeTab, setActiveTab] = useState<'plotter' | 'markers' | 'formulas'>('plotter');

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

  // Selected Derived Variable or Custom Expression
  const [selectedDerivedId, setSelectedDerivedId] = useState<string>('');
  const [useFormula, setUseFormula] = useState<boolean>(false);
  const [formulaStr, setFormulaStr] = useState<string>('Vo / (Vi || 1e-6)');

  // Sweep Execution State
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [pointsDone, setPointsDone] = useState<number>(0);
  const [resultSeries, setResultSeries] = useState<CurveSeries[]>([]);

  // Feedback notifications
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Form State for Adding New Derived Variable
  const [newVarName, setNewVarName] = useState<string>('Gv_custom');
  const [newVarFormula, setNewVarFormula] = useState<string>('Vo / Vi');
  const [newVarUnit, setNewVarUnit] = useState<string>('V/V');
  const [newVarDesc, setNewVarDesc] = useState<string>('Voltage Gain');

  // Form State for Adding/Editing Primary Marker
  const [markerTargetCompId, setMarkerTargetCompId] = useState<string>('');
  const [markerKey, setMarkerKey] = useState<string>('v_drop');
  const [markerLabelText, setMarkerLabelText] = useState<string>('Vo');

  // List of marked components
  const markedComponents = useMemo(() => {
    return Object.values(components).filter((c) => Boolean(c.params?.analogMarker?.label));
  }, [components]);

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
        else if (sourceComp.kind === 'ac_voltage') setSweepParam('frequency');
        else setSweepParam('voltage');
      }
    }

    if (!xAxisVarId) {
      const markedX = availableVars.find((v) => v.isMarked && (v.markerLabel === 'Vi' || v.markerLabel === 'f' || v.markerLabel === 'Vcc'));
      if (markedX) setXAxisVarId(markedX.id);
      else {
        const xVar = availableVars.find((v) => v.category === 'source' || v.id.includes('vce') || v.id.includes('v_drop'));
        if (xVar) setXAxisVarId(xVar.id);
        else if (availableVars[0]) setXAxisVarId(availableVars[0].id);
      }
    }

    if (!yAxisVarId) {
      const markedY = availableVars.find((v) => v.isMarked && (v.markerLabel === 'Vo' || v.markerLabel === 'Ic' || v.markerLabel === 'Vce'));
      if (markedY) setYAxisVarId(markedY.id);
      else {
        const yVar = availableVars.find((v) => v.category === 'current' || v.id.includes('ic') || v.id.includes('vout') || v.id.includes('v_drop'));
        if (yVar) setYAxisVarId(yVar.id);
        else if (availableVars[1]) setYAxisVarId(availableVars[1].id);
      }
    }
  }, [availableVars, components, sweepCompId, xAxisVarId, yAxisVarId]);

  // Auto-Tag Circuit Markers (Like Digital Truth Table)
  const handleAutoTagMarkers = () => {
    const comps = Object.values(components);
    let count = 0;

    // 1. Tag Vi: Input source (AC voltage or DC supply)
    const inputComp = comps.find((c) => c.kind === 'ac_voltage' || c.kind === 'signal_generator' || (c.kind === 'dc_voltage' && !c.label.toLowerCase().includes('cc')));
    if (inputComp) {
      setAnalogMarker(inputComp.id, {
        label: 'Vi',
        variableKey: inputComp.kind === 'ac_voltage' || inputComp.kind === 'signal_generator' ? 'amplitude' : 'voltage',
      });
      count++;
    }

    // 2. Tag Vcc: DC power rail
    const vccComp = comps.find((c) => c.kind === 'dc_voltage' && (c.label.toLowerCase().includes('cc') || c.id !== inputComp?.id));
    if (vccComp) {
      setAnalogMarker(vccComp.id, { label: 'Vcc', variableKey: 'voltage' });
      count++;
    }

    // 3. Tag Vo: Output load / resistor / opamp
    const outputComp = comps.find((c) => (c.kind === 'resistor' && c.id !== inputComp?.id) || c.kind === 'opamp');
    if (outputComp) {
      setAnalogMarker(outputComp.id, {
        label: 'Vo',
        variableKey: outputComp.kind === 'opamp' ? 'vout' : 'v_drop',
      });
      count++;
    }

    // 4. Tag Transistor: Vce & Ic
    const bjtComp = comps.find((c) => c.kind === 'bjt_npn' || c.kind === 'bjt_pnp');
    if (bjtComp) {
      setAnalogMarker(bjtComp.id, { label: 'Vce', variableKey: 'vce' });
      count++;
    }

    showToast(`Tagged ${count} circuit primary variable markers!`);
    logger.success('engine', `Auto-tagged ${count} circuit analog variable markers.`);
  };

  // Quick Apply Presets
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
          setSweepScale('linear');
          setXAxisVarId(diode.id + ':v_drop');
          setYAxisVarId(diode.id + ':current');
          setEnableSecondary(false);
          setUseFormula(false);
          setActiveTab('plotter');
          showToast('Loaded Diode Forward I-V Preset');
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
          setSweepScale('linear');
          setXAxisVarId(bjt.id + ':vce');
          setYAxisVarId(bjt.id + ':ic');
          if (ibSource) {
            setEnableSecondary(true);
            setSecondaryCompId(ibSource.id);
            setSecondaryParam('current');
            setSecondaryValuesStr('10e-6, 20e-6, 30e-6, 40e-6, 50e-6');
          }
          setUseFormula(false);
          setActiveTab('plotter');
          showToast('Loaded Transistor Output Curves Preset');
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
          setSweepScale('linear');
          setXAxisVarId(bjt.id + ':vbe');
          setYAxisVarId(bjt.id + ':ic');
          setEnableSecondary(false);
          setUseFormula(false);
          setActiveTab('plotter');
          showToast('Loaded Transistor Transfer Curve Preset');
        }
        break;
      }
      case 'bjt_vcc_vce': {
        const bjt = Object.values(components).find((c) => c.kind === 'bjt_npn' || c.kind === 'bjt_pnp');
        const vccSource = Object.values(components).find((c) => c.kind === 'dc_voltage');
        if (bjt && vccSource) {
          setSweepCompId(vccSource.id);
          setSweepParam('voltage');
          setSweepStart(0);
          setSweepStop(Math.max(12, vccSource.params.voltage ?? 12));
          setSweepSteps(100);
          setSweepScale('linear');
          setXAxisVarId(vccSource.id + ':voltage');
          setYAxisVarId(bjt.id + ':vce');
          setEnableSecondary(false);
          setUseFormula(false);
          setActiveTab('plotter');
          showToast('Loaded BJT DC Bias (Vcc vs Vce) Preset');
        }
        break;
      }
      case 'gain_frequency': {
        const acSource = Object.values(components).find((c) => c.kind === 'ac_voltage' || c.kind === 'signal_generator');
        if (acSource) {
          setSweepCompId(acSource.id);
          setSweepParam('frequency');
          setSweepStart(10);
          setSweepStop(100000);
          setSweepSteps(100);
          setSweepScale('logarithmic');
          setXAxisVarId(acSource.id + ':frequency');
          setEnableSecondary(false);
          setUseFormula(true);
          setFormulaStr('20 * log10(abs(Vo / (Vi || 1e-6)))');
          setActiveTab('plotter');
          showToast('Loaded Bode Frequency Gain Preset (10Hz–100kHz)');
        }
        break;
      }
      case 'gain_amplitude': {
        const acSource = Object.values(components).find((c) => c.kind === 'ac_voltage' || c.kind === 'signal_generator');
        if (acSource) {
          setSweepCompId(acSource.id);
          setSweepParam('amplitude');
          setSweepStart(0.1);
          setSweepStop(5.0);
          setSweepSteps(100);
          setSweepScale('linear');
          setXAxisVarId(acSource.id + ':amplitude');
          setEnableSecondary(false);
          setUseFormula(true);
          setFormulaStr('Vo / (Vi || 1e-6)');
          setActiveTab('plotter');
          showToast('Loaded Gain vs Input Amplitude Preset');
        }
        break;
      }
      default:
        break;
    }
  };

  // Run Parameter Sweep
  const handleRunSweep = useCallback(() => {
    if (!sweepCompId || !xAxisVarId || !yAxisVarId) {
      showToast('Please select a swept source, X-axis, and Y-axis variable.');
      return;
    }

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

  // Select a derived variable to plot on Y-axis
  const handleSelectDerivedVariable = (derivedVarId: string) => {
    setSelectedDerivedId(derivedVarId);
    if (!derivedVarId) {
      setUseFormula(false);
      return;
    }
    const derived = derivedVariables.find((v) => v.id === derivedVarId);
    if (derived) {
      setUseFormula(true);
      setFormulaStr(derived.formula);
      showToast(`Selected derived variable [${derived.name}] = ${derived.formula}`);
    }
  };

  // Handle adding new custom derived variable
  const handleCreateDerivedVariable = () => {
    if (!newVarName.trim() || !newVarFormula.trim()) {
      showToast('Please provide both name and formula.');
      return;
    }
    addDerivedVariable({
      name: newVarName.trim(),
      formula: newVarFormula.trim(),
      unit: newVarUnit.trim() || 'V/V',
      description: newVarDesc.trim(),
    });
    showToast(`Added derived variable ${newVarName}!`);
    setNewVarName('');
    setNewVarFormula('');
  };

  // Handle setting primary marker from modal
  const handleSaveMarker = () => {
    if (!markerTargetCompId || !markerLabelText.trim()) {
      showToast('Select a component and label.');
      return;
    }
    setAnalogMarker(markerTargetCompId, {
      label: markerLabelText.trim(),
      variableKey: markerKey,
    });
    showToast(`Marked [${markerLabelText.trim()}] on ${markerTargetCompId}`);
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

    const xVarObj = availableVars.find((v) => v.id === xAxisVarId);
    const xLabel = xAxisVarId === '__swept__'
      ? `Swept ${components[sweepCompId]?.label || 'Source'} (${sweepParam})`
      : (xVarObj ? xVarObj.label : 'X Axis');
    const yLabel = useFormula ? formulaStr : (availableVars.find((v) => v.id === yAxisVarId)?.label || 'Y Axis');

    const seriesConfig: uPlot.Series[] = [
      {
        label: xLabel,
        value: (_self, raw) => formatHoverValue(raw),
      },
      ...resultSeries.map((s) => ({
        label: s.name,
        stroke: s.color,
        width: 2.5,
        points: { show: s.points.length <= 60, size: 4 },
        value: (_self: any, raw: number) => formatHoverValue(raw),
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
        x: {
          time: false,
          auto: true,
          range: (_self, initMin, initMax) => {
            if (initMin === initMax) {
              return initMin === 0 ? [-1, 1] : [initMin * 0.9, initMax * 1.1];
            }
            return [initMin, initMax];
          },
        },
        y: {
          auto: true,
          range: (_self, initMin, initMax) => {
            if (initMin === initMax) {
              return initMin === 0 ? [-1, 1] : [initMin * 0.9, initMax * 1.1];
            }
            return [initMin, initMax];
          },
        },
      },
      axes: [
        {
          label: xLabel,
          stroke: isDark ? '#94a3b8' : '#475569',
          grid: { stroke: isDark ? '#1e293b' : '#e2e8f0', width: 1 },
          ticks: { stroke: isDark ? '#334155' : '#cbd5e1', width: 1 },
          values: (_self, splits) => formatAxisSplits(splits),
        },
        {
          label: yLabel,
          stroke: isDark ? '#94a3b8' : '#475569',
          grid: { stroke: isDark ? '#1e293b' : '#e2e8f0', width: 1 },
          ticks: { stroke: isDark ? '#334155' : '#cbd5e1', width: 1 },
          values: (_self, splits) => formatAxisSplits(splits),
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
  }, [resultSeries, isDark, xAxisVarId, yAxisVarId, availableVars, useFormula, formulaStr]);

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
                Analog Variable Markers • Mathematical Formulas • Parameter Sweeper
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('plotter')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                activeTab === 'plotter'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Sweep & Plotter</span>
            </button>
            <button
              onClick={() => setActiveTab('markers')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                activeTab === 'markers'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Primary Markers ({markedComponents.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('formulas')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                activeTab === 'formulas'
                  ? 'bg-purple-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Formulas ({derivedVariables.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              onChange={(e) => applyPreset(e.target.value)}
              defaultValue=""
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-300 border border-slate-700 text-xs font-medium outline-none cursor-pointer hover:border-cyan-600 transition hidden md:block"
            >
              <option value="" disabled>Load Preset Curve...</option>
              <option value="diode_iv">Diode Forward I-V Curve (Id vs Vd)</option>
              <option value="bjt_output">Transistor Output Curves (Ic vs Vce)</option>
              <option value="bjt_transfer">Transistor Transfer Curve (Ic vs Vbe)</option>
              <option value="bjt_vcc_vce">BJT DC Bias (Vcc vs Vce)</option>
              <option value="gain_frequency">Bode Frequency Gain (Vo/Vi vs f)</option>
              <option value="gain_amplitude">Voltage Gain vs Amplitude (Vo/Vi vs Vi)</option>
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

        {/* Toast Alert Banner */}
        {toastMsg && (
          <div className="bg-cyan-950/90 border-b border-cyan-800 px-4 py-1.5 text-xs text-cyan-300 font-mono flex items-center justify-between animate-in slide-in-from-top-2">
            <span>ℹ {toastMsg}</span>
            <button onClick={() => setToastMsg(null)} className="text-cyan-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Work Area */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
          {/* TAB 1: PLOTTER CONTROLS */}
          {activeTab === 'plotter' && (
            <div className="w-full lg:w-80 bg-slate-950/90 border-r border-slate-800 p-3 sm:p-4 flex flex-col gap-3 overflow-y-auto text-xs shrink-0 animate-in fade-in">
              {/* 1. Swept Independent Source */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                <span className="font-bold text-cyan-400 font-mono block text-[11px]">
                  1. Swept Independent Variable (X)
                </span>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Swept Component</label>
                  <select
                    value={sweepCompId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSweepCompId(newId);
                      const c = components[newId];
                      if (c) {
                        if (c.kind === 'current_source') {
                          setSweepParam('current');
                          setXAxisVarId(`${newId}:current`);
                        } else if (c.kind === 'ac_voltage' || c.kind === 'signal_generator') {
                          setSweepParam('frequency');
                          setXAxisVarId(`${newId}:frequency`);
                        } else if (c.kind === 'resistor') {
                          setSweepParam('resistance');
                          setXAxisVarId(`${newId}:resistance`);
                        } else {
                          setSweepParam('voltage');
                          setXAxisVarId(`${newId}:voltage`);
                        }
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                  >
                    <option value="" disabled>Select Swept Component...</option>
                    {Object.values(components).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.params?.analogMarker ? `📈 [${c.params.analogMarker.label}] ` : ''}{c.label || c.id} ({c.kind})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Swept Parameter</label>
                  <select
                    value={sweepParam}
                    onChange={(e) => {
                      const newParam = e.target.value as any;
                      setSweepParam(newParam);
                      if (sweepCompId) {
                        setXAxisVarId(`${sweepCompId}:${newParam}`);
                      }
                    }}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                  >
                    <option value="voltage">Voltage / DC Bias (V)</option>
                    <option value="amplitude">AC Peak Amplitude (V)</option>
                    <option value="frequency">AC Frequency (Hz)</option>
                    <option value="current">Current (A)</option>
                    <option value="resistance">Resistance (Ohms)</option>
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
                      <option value="logarithmic">Logarithmic (Bode)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Family Curves (Step 2nd Var) */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400 font-mono text-[11px]">
                    2. Family of Curves (Step 2nd Var)
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

              {/* 3. Plotted Axes & Derived Variables */}
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
                    <option value="__swept__">
                      ⚡ Swept Parameter ({components[sweepCompId]?.label || sweepCompId || 'Source'} {sweepParam})
                    </option>
                    {availableVars.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Y-Axis Variable (or Derived Formula)</label>
                  <select
                    value={selectedDerivedId || yAxisVarId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('derived:')) {
                        const dId = val.replace('derived:', '');
                        handleSelectDerivedVariable(dId);
                      } else {
                        setSelectedDerivedId('');
                        setYAxisVarId(val);
                        setUseFormula(false);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                  >
                    <optgroup label="📐 Derived Mathematical Variables">
                      {derivedVariables.map((d) => (
                        <option key={d.id} value={`derived:${d.id}`}>
                          📐 [{d.name}] {d.formula} ({d.unit})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="📈 Primary Circuit Variables">
                      {availableVars.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Custom Expression Override */}
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-300 font-medium">Formula Expression</span>
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
                        placeholder="Vo / (Vi || 1e-6)"
                        className="w-full px-2 py-1 rounded bg-slate-950 border border-purple-600/50 font-mono text-cyan-300 text-xs outline-none"
                      />
                      <div className="flex gap-1 flex-wrap font-mono text-[9px]">
                        <button
                          onClick={() => setFormulaStr('Vo / (Vi || 1e-6)')}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          Vo/Vi
                        </button>
                        <button
                          onClick={() => setFormulaStr('20 * log10(abs(Vo / (Vi || 1e-6)))')}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          Gain (dB)
                        </button>
                        <button
                          onClick={() => setFormulaStr('Vo * Io')}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          P=Vo*Io
                        </button>
                        <button
                          onClick={() => setFormulaStr('Vce * Ic')}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          P=Vce*Ic
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRIMARY VARIABLE MARKERS (TRUTH TABLE STYLE) */}
          {activeTab === 'markers' && (
            <div className="w-full lg:w-96 bg-slate-950/90 border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto text-xs shrink-0 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-emerald-400 text-xs font-mono">
                    📈 Primary Variable Markers
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Analog variables marked on components (like Digital Truth Table logic).
                  </p>
                </div>
                <button
                  onClick={handleAutoTagMarkers}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition shadow-md"
                >
                  <Zap className="w-3 h-3" />
                  <span>Auto-Tag</span>
                </button>
              </div>

              {/* Set Marker Form */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <span className="font-bold text-slate-200 block text-[11px]">
                  Mark Component Variable
                </span>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Target Component</label>
                  <select
                    value={markerTargetCompId}
                    onChange={(e) => setMarkerTargetCompId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                  >
                    <option value="" disabled>Select component to mark...</option>
                    {Object.values(components).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label || c.id} ({c.kind})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Variable Kind</label>
                    <select
                      value={markerKey}
                      onChange={(e) => setMarkerKey(e.target.value)}
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none"
                    >
                      <option value="voltage">Voltage (V)</option>
                      <option value="amplitude">AC Amplitude (V)</option>
                      <option value="frequency">Frequency (Hz)</option>
                      <option value="v_drop">Voltage Drop (V_R)</option>
                      <option value="current">Current (I)</option>
                      <option value="vce">V_CE (BJT)</option>
                      <option value="vbe">V_BE (BJT)</option>
                      <option value="ic">I_C (Collector Current)</option>
                      <option value="vds">V_DS (MOSFET)</option>
                      <option value="vgs">V_GS (MOSFET)</option>
                      <option value="id">I_D (Drain Current)</option>
                      <option value="vout">V_out (OpAmp)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Marker Label</label>
                    <input
                      type="text"
                      value={markerLabelText}
                      onChange={(e) => setMarkerLabelText(e.target.value)}
                      placeholder="e.g. Vi, Vo"
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-emerald-400 text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {['Vi', 'Vo', 'Vcc', 'Vce', 'Ic', 'f', 'Io'].map((sug) => (
                    <button
                      key={sug}
                      onClick={() => setMarkerLabelText(sug)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px]"
                    >
                      {sug}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleSaveMarker}
                  className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs transition"
                >
                  Set Primary Variable Marker
                </button>
              </div>

              {/* List of Marked Components */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  Active Circuit Markers ({markedComponents.length})
                </span>

                {markedComponents.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-center text-slate-500 space-y-1">
                    <Tag className="w-5 h-5 mx-auto text-slate-600" />
                    <p className="text-xs">No primary markers tagged yet.</p>
                    <p className="text-[10px]">Click "Auto-Tag" or select a component above to mark variables like Vi and Vo.</p>
                  </div>
                ) : (
                  markedComponents.map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          📈 [{c.params.analogMarker?.label}]
                        </span>
                        <div>
                          <span className="text-xs text-white font-medium block">
                            {c.label || c.id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Variable: {c.params.analogMarker?.variableKey}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setAnalogMarker(c.id, null)}
                        className="p-1 rounded text-slate-500 hover:text-red-400 transition"
                        title="Remove Marker"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FORMULAS & DERIVED VARIABLES */}
          {activeTab === 'formulas' && (
            <div className="w-full lg:w-96 bg-slate-950/90 border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto text-xs shrink-0 animate-in fade-in">
              <div>
                <h3 className="font-bold text-purple-400 text-xs font-mono">
                  📐 Formulas & Derived Variables
                </h3>
                <p className="text-[10px] text-slate-400">
                  Create secondary or tertiary variables (e.g. Gain Gv = Vo / Vi, Power P = Vo * Io).
                </p>
              </div>

              {/* Add Derived Variable Form */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <span className="font-bold text-slate-200 block text-[11px]">
                  Create Derived Variable
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Variable Name</label>
                    <input
                      type="text"
                      value={newVarName}
                      onChange={(e) => setNewVarName(e.target.value)}
                      placeholder="Gv"
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-purple-400 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Unit</label>
                    <input
                      type="text"
                      value={newVarUnit}
                      onChange={(e) => setNewVarUnit(e.target.value)}
                      placeholder="V/V, dB, W"
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-white text-xs outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Mathematical Formula</label>
                  <input
                    type="text"
                    value={newVarFormula}
                    onChange={(e) => setNewVarFormula(e.target.value)}
                    placeholder="Vo / Vi"
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-purple-600/50 font-mono text-cyan-300 text-xs outline-none"
                  />
                </div>

                <div className="flex gap-1 flex-wrap font-mono text-[10px]">
                  {['Vo', 'Vi', 'Vcc', 'Vce', 'Ic', 'f', '/', '*', '+', '-', 'log10', 'abs'].map((token) => (
                    <button
                      key={token}
                      onClick={() => setNewVarFormula((prev) => (prev ? prev + ' ' + token : token))}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      {token}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    value={newVarDesc}
                    onChange={(e) => setNewVarDesc(e.target.value)}
                    placeholder="e.g. Small-signal Voltage Gain"
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-white text-xs outline-none"
                  />
                </div>

                <button
                  onClick={handleCreateDerivedVariable}
                  className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 font-bold text-white text-xs transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Derived Variable</span>
                </button>
              </div>

              {/* Existing Derived Variables */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  Available Derived Formulas ({derivedVariables.length})
                </span>

                {derivedVariables.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 hover:border-purple-500/50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-purple-400">
                        📐 [{d.name}] ({d.unit})
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            handleSelectDerivedVariable(d.id);
                            setActiveTab('plotter');
                          }}
                          className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 hover:bg-purple-900 text-[10px] font-semibold transition"
                        >
                          Select in Plotter
                        </button>
                        <button
                          onClick={() => removeDerivedVariable(d.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition"
                          title="Delete Formula"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <code className="text-xs text-cyan-300 font-mono block bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      {d.formula}
                    </code>
                    {d.description && (
                      <p className="text-[10px] text-slate-400">{d.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Graph Display Area */}
          <div className="flex-1 bg-black p-3 sm:p-4 flex flex-col items-center justify-center relative min-h-[350px]">
            {isSweeping && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
                <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="font-mono text-sm font-bold text-white tracking-wider">
                  SOLVING PARAMETER SWEEP: {progress}% ({pointsDone} pts)
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
              <div className="text-center text-slate-500 space-y-2 p-4">
                <LineChart className="w-12 h-12 mx-auto text-slate-700" />
                <p className="font-mono text-xs font-semibold text-slate-400">No curve generated yet.</p>
                <p className="text-[11px] text-slate-600 max-w-sm">
                  1. Tag primary variables (<code>Vi</code>, <code>Vo</code>) in the <b>Markers</b> tab. <br/>
                  2. Define gain or power formulas in the <b>Formulas</b> tab. <br/>
                  3. Select swept source & click <b>PLOT CURVE</b>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
