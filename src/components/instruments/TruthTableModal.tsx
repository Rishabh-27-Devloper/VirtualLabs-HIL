// ============================================================
// VirtualLab-HIL — Combinational Logic Truth Table Analyzer
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import { Table2, X, Play, Download, Copy, Check, AlertTriangle } from 'lucide-react';
import type { LogicLevel, ComponentInstance, SimulationConfig } from '@/types/circuit';
import { solveDigitalComponent, voltageToLogic, logicToVoltage } from '@/engine/digitalSolver';
import { DEFAULT_CONFIG } from '@/engine/simulationDispatcher';

// ── Quine-McCluskey helpers for SOP minimization ──

function mintermToString(minterm: number, varNames: string[], numVars: number): string {
  return varNames
    .map((name, i) => {
      const bit = (minterm >> (numVars - 1 - i)) & 1;
      return bit ? name : `${name}'`;
    })
    .join('');
}

function generateSOPExpression(
  truthTable: number[][],
  inputLabels: string[],
  outputIndex: number,
  numInputs: number
): string {
  const minterms: string[] = [];
  for (const row of truthTable) {
    if (row[numInputs + outputIndex] === 1) {
      const mintermBits = row.slice(0, numInputs);
      const mintermStr = inputLabels
        .map((name, i) => (mintermBits[i] ? name : `${name}'`))
        .join('·');
      minterms.push(mintermStr);
    }
  }
  if (minterms.length === 0) return '0';
  if (minterms.length === Math.pow(2, numInputs)) return '1';
  return minterms.join(' + ');
}

// ── Main Component ──

export const TruthTableModal: React.FC = () => {
  const show = useCircuitStore((s) => s.showTruthTable);
  const setShow = useCircuitStore((s) => s.setShowTruthTable);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  const [truthTable, setTruthTable] = useState<number[][] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find all digital_input components marked as truth table inputs
  const ttInputs = useMemo(() => {
    return Object.values(components)
      .filter((c) => c.kind === 'digital_input' && c.params.isTruthTableInput)
      .sort((a, b) => (a.params.truthTableLabel ?? a.id).localeCompare(b.params.truthTableLabel ?? b.id));
  }, [components]);

  // Find all digital_output components marked as truth table outputs
  const ttOutputs = useMemo(() => {
    return Object.values(components)
      .filter((c) => c.kind === 'digital_output' && c.params.isTruthTableOutput)
      .sort((a, b) => (a.params.truthTableLabel ?? a.id).localeCompare(b.params.truthTableLabel ?? b.id));
  }, [components]);

  const inputLabels = useMemo(
    () => ttInputs.map((c) => c.params.truthTableLabel || c.label || c.id.slice(0, 6)),
    [ttInputs]
  );

  const outputLabels = useMemo(
    () => ttOutputs.map((c) => c.params.truthTableLabel || c.label || c.id.slice(0, 6)),
    [ttOutputs]
  );

  const numInputs = ttInputs.length;
  const numOutputs = ttOutputs.length;
  const numRows = Math.pow(2, numInputs);

  // ── Build wire connectivity map ──
  const buildWireMap = useCallback(() => {
    // Simple net connectivity: map pin endpoints to net IDs using Union-Find
    const parent: Record<string, string> = {};
    const find = (x: string): string => {
      if (!parent[x]) parent[x] = x;
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    for (const edge of edges) {
      const srcKey = `${edge.source}::${edge.sourceHandle}`;
      const tgtKey = `${edge.target}::${edge.targetHandle}`;
      union(srcKey, tgtKey);
    }

    // Build net groups
    const nets: Record<string, string[]> = {};
    const allKeys = new Set<string>();
    for (const edge of edges) {
      allKeys.add(`${edge.source}::${edge.sourceHandle}`);
      allKeys.add(`${edge.target}::${edge.targetHandle}`);
    }
    for (const key of allKeys) {
      const root = find(key);
      if (!nets[root]) nets[root] = [];
      nets[root].push(key);
    }

    return { nets, find };
  }, [edges]);

  // ── Generate Truth Table ──
  const generateTruthTable = useCallback(() => {
    if (numInputs === 0 || numOutputs === 0) {
      setError('Mark at least one Digital Input as "Truth Table Input" and one Digital Output as "Truth Table Output" in the Inspector.');
      return;
    }
    if (numInputs > 8) {
      setError(`Too many inputs (${numInputs}). Maximum 8 inputs supported (256 rows).`);
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const { nets, find } = buildWireMap();

      // For each combination of inputs...
      const table: number[][] = [];

      for (let combo = 0; combo < numRows; combo++) {
        // Set input states
        const inputBits: number[] = [];
        for (let i = 0; i < numInputs; i++) {
          const bit = (combo >> (numInputs - 1 - i)) & 1;
          inputBits.push(bit);
        }

        // Create a snapshot of component states with the current input combination
        const compSnapshot: Record<string, ComponentInstance> = {};
        for (const [id, comp] of Object.entries(components)) {
          compSnapshot[id] = {
            ...comp,
            params: { ...comp.params },
            simState: comp.simState
              ? { ...comp.simState, logicState: { ...(comp.simState.logicState ?? {}) } }
              : { nodeVoltages: {}, branchCurrents: {}, logicState: {} },
          };
        }

        // Apply input bits to digital_input components
        for (let i = 0; i < numInputs; i++) {
          const inputComp = ttInputs[i];
          compSnapshot[inputComp.id].params.logicState = inputBits[i];
        }

        // Build net logic levels from wire connectivity
        const netLogic: Record<string, LogicLevel> = {};

        // Initialize net logic from digital inputs
        for (const [id, comp] of Object.entries(compSnapshot)) {
          if (comp.kind === 'digital_input') {
            const pinKey = `${id}::out`;
            const netRoot = find(pinKey);
            netLogic[netRoot] = (comp.params.logicState ?? 0) as LogicLevel;
          }
        }

        // Multi-pass digital propagation (up to 16 passes for convergence)
        for (let pass = 0; pass < 16; pass++) {
          let changed = false;

          for (const [id, comp] of Object.entries(compSnapshot)) {
            // Skip non-digital or input-only components
            if (comp.kind === 'digital_input' || comp.kind === 'digital_output' || comp.kind === 'clock_source') {
              if (comp.kind === 'digital_input') {
                // Re-assert input value
                const pinKey = `${id}::out`;
                const netRoot = find(pinKey);
                netLogic[netRoot] = (comp.params.logicState ?? 0) as LogicLevel;
              }
              continue;
            }

            // Check if this is a digital gate/component
            const isGate = comp.kind.startsWith('gate_') ||
              ['latch_sr', 'latch_d', 'latch_jk', 'ff_d', 'ff_t', 'ff_jk', 'ff_sr', 'counter_4bit', 'decoder_2to4'].includes(comp.kind);

            if (!isGate) continue;

            // Gather input values from connected nets
            const inputs: Record<string, LogicLevel> = {};
            const compDef = compSnapshot[id];

            // Standard input pin names for gates
            const inputPinNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
              'in0', 'in1', 'in2', 'in3', 'in4', 'in5', 'in6', 'in7',
              'S', 'R', 'D', 'T', 'J', 'K', 'CLK', 'CLR', 'SET', 'PRE', 'EN',
              'A0', 'A1'];

            for (const pinName of inputPinNames) {
              const pinKey = `${id}::${pinName}`;
              const netRoot = find(pinKey);
              if (netLogic[netRoot] !== undefined) {
                inputs[pinName] = netLogic[netRoot];
              }
            }

            // Solve this gate
            const result = solveDigitalComponent(compDef, inputs, DEFAULT_CONFIG);

            if (result) {
              // Write outputs to nets
              for (const [pinId, value] of Object.entries(result)) {
                const pinKey = `${id}::${pinId}`;
                const netRoot = find(pinKey);
                if (netLogic[netRoot] !== value) {
                  netLogic[netRoot] = value;
                  changed = true;
                }
              }
            }
          }

          if (!changed) break;
        }

        // Read output values
        const outputBits: number[] = [];
        for (const outputComp of ttOutputs) {
          const pinKey = `${outputComp.id}::in`;
          const netRoot = find(pinKey);
          const logicVal = netLogic[netRoot];
          outputBits.push(logicVal === 1 ? 1 : logicVal === 0 ? 0 : -1);
        }

        table.push([...inputBits, ...outputBits]);
      }

      setTruthTable(table);
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  }, [numInputs, numOutputs, numRows, buildWireMap, components, ttInputs, ttOutputs]);

  // ── Export as CSV ──
  const exportCSV = useCallback(() => {
    if (!truthTable) return;
    const headers = [...inputLabels, ...outputLabels];
    const rows = truthTable.map((row) => row.map((v) => (v === -1 ? 'X' : String(v))).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'truth_table.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [truthTable, inputLabels, outputLabels]);

  // ── Copy to clipboard ──
  const copyToClipboard = useCallback(() => {
    if (!truthTable) return;
    const headers = [...inputLabels, ...outputLabels];
    const rows = truthTable.map((row) => row.map((v) => (v === -1 ? 'X' : String(v))).join('\t'));
    const text = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [truthTable, inputLabels, outputLabels]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`relative w-[800px] max-h-[85vh] flex flex-col rounded-2xl border-2 shadow-2xl overflow-hidden ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* ── Header ── */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-b ${
            isDark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Table2 className="w-5 h-5 text-violet-500" />
            <h2 className="text-base font-bold tracking-tight">Truth Table Analyzer</h2>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                isDark ? 'bg-violet-900/40 text-violet-300' : 'bg-violet-100 text-violet-700'
              }`}
            >
              Combinational Logic
            </span>
          </div>
          <button
            onClick={() => setShow(false)}
            className={`p-1.5 rounded-lg border transition ${
              isDark
                ? 'border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-white'
                : 'border-slate-300 hover:bg-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Summary & Controls ── */}
        <div
          className={`flex items-center justify-between px-5 py-2.5 border-b ${
            isDark ? 'border-slate-800 bg-slate-850' : 'border-slate-100 bg-slate-25'
          }`}
        >
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                Inputs: <strong className={isDark ? 'text-blue-300' : 'text-blue-700'}>{numInputs}</strong>
                {numInputs > 0 && (
                  <span className="ml-1 font-mono text-[10px]">({inputLabels.join(', ')})</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                Outputs: <strong className={isDark ? 'text-emerald-300' : 'text-emerald-700'}>{numOutputs}</strong>
                {numOutputs > 0 && (
                  <span className="ml-1 font-mono text-[10px]">({outputLabels.join(', ')})</span>
                )}
              </span>
            </div>
            {numInputs > 0 && (
              <span className={`font-mono text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                2<sup>{numInputs}</sup> = {numRows} rows
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={generateTruthTable}
              disabled={isGenerating || numInputs === 0 || numOutputs === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-sm transition ${
                isGenerating || numInputs === 0 || numOutputs === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : isDark
                  ? 'bg-violet-600 text-white border-violet-500 hover:bg-violet-500'
                  : 'bg-violet-600 text-white border-violet-700 hover:bg-violet-700'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>

            {truthTable && (
              <>
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                    isDark
                      ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={exportCSV}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                    isDark
                      ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div
            className={`flex items-center gap-2 px-5 py-2.5 border-b text-xs ${
              isDark
                ? 'bg-red-950/50 border-red-900/50 text-red-300'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Truth Table Display ── */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {!truthTable && !error && (
            <div className={`flex flex-col items-center justify-center h-full gap-3 text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <Table2 className="w-12 h-12 opacity-30" />
              <div className="text-sm font-medium">No truth table generated yet</div>
              <div className="text-xs max-w-sm">
                Place <strong>Logic Input</strong> and <strong>Logic Probe</strong> components on the canvas, mark them as 
                truth table variables in the Inspector, then click <strong>Generate</strong>.
              </div>
            </div>
          )}

          {truthTable && (
            <div className="space-y-4">
              {/* Table */}
              <div className="overflow-auto rounded-xl border max-h-[45vh]">
                <table className={`w-full text-xs font-mono border-collapse ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th
                        className={`px-2 py-1.5 text-center text-[10px] font-bold tracking-wider border-b ${
                          isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-500'
                        }`}
                      >
                        #
                      </th>
                      {inputLabels.map((label, i) => (
                        <th
                          key={`in-${i}`}
                          className={`px-3 py-1.5 text-center font-bold border-b ${
                            isDark
                              ? 'bg-blue-950/60 border-slate-700 text-blue-300'
                              : 'bg-blue-50 border-slate-300 text-blue-700'
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                      <th
                        className={`px-1 py-1.5 border-b ${
                          isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
                        }`}
                      >
                        <div className={`w-px h-4 mx-auto ${isDark ? 'bg-slate-600' : 'bg-slate-400'}`} />
                      </th>
                      {outputLabels.map((label, i) => (
                        <th
                          key={`out-${i}`}
                          className={`px-3 py-1.5 text-center font-bold border-b ${
                            isDark
                              ? 'bg-emerald-950/60 border-slate-700 text-emerald-300'
                              : 'bg-emerald-50 border-slate-300 text-emerald-700'
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {truthTable.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={`transition-colors ${
                          isDark
                            ? rowIdx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-850'
                            : rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                        } hover:${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}
                      >
                        <td
                          className={`px-2 py-1 text-center border-b ${
                            isDark ? 'border-slate-800 text-slate-600' : 'border-slate-200 text-slate-400'
                          }`}
                        >
                          {rowIdx}
                        </td>
                        {row.slice(0, numInputs).map((val, colIdx) => (
                          <td
                            key={`in-${colIdx}`}
                            className={`px-3 py-1 text-center font-bold border-b ${
                              isDark ? 'border-slate-800' : 'border-slate-200'
                            } ${val === 1 ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-slate-500' : 'text-slate-400')}`}
                          >
                            {val}
                          </td>
                        ))}
                        <td className={`px-1 py-1 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                          <div className={`w-px h-3 mx-auto ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                        </td>
                        {row.slice(numInputs).map((val, colIdx) => (
                          <td
                            key={`out-${colIdx}`}
                            className={`px-3 py-1 text-center font-bold border-b ${
                              isDark ? 'border-slate-800' : 'border-slate-200'
                            } ${
                              val === 1
                                ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                                : val === -1
                                ? isDark ? 'text-yellow-400' : 'text-yellow-600'
                                : isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {val === -1 ? 'X' : val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Boolean Expressions (SOP) */}
              <div
                className={`rounded-xl border p-4 ${
                  isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>
                  Boolean Expressions (Sum of Products)
                </h3>
                <div className="space-y-1.5">
                  {outputLabels.map((label, outIdx) => {
                    const expr = generateSOPExpression(truthTable, inputLabels, outIdx, numInputs);
                    return (
                      <div key={outIdx} className="flex items-start gap-2 text-xs">
                        <span className={`font-bold shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          {label} =
                        </span>
                        <span className={`font-mono break-all ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {expr}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
