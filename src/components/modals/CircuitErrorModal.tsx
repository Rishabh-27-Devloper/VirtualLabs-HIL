// ============================================================
// VirtualLab-HIL — Circuit Logic Error Diagnostic Modal
// ============================================================

import React from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import { AlertCircle, AlertTriangle, X, Wrench, ArrowRight } from 'lucide-react';

export const CircuitErrorModal: React.FC = () => {
  const circuitError = useCircuitStore((s) => s.circuitError);
  const setCircuitError = useCircuitStore((s) => s.setCircuitError);
  const selectComponent = useCircuitStore((s) => s.selectComponent);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  if (!circuitError) return null;

  const isWarning = circuitError.severity === 'warning';

  const handleFixTarget = () => {
    if (circuitError.affectedComponentId) {
      selectComponent(circuitError.affectedComponentId);
    }
    setCircuitError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-colors ${
          isDark
            ? 'bg-slate-900 border-red-900/60 text-slate-100 shadow-red-950/40'
            : 'bg-white border-red-300 text-slate-900 shadow-xl'
        }`}
      >
        {/* ── Modal Header ── */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isWarning
              ? isDark ? 'bg-amber-950/40 border-amber-900/50' : 'bg-amber-50 border-amber-200'
              : isDark ? 'bg-red-950/50 border-red-900/50' : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl border ${
                isWarning
                  ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                  : 'bg-red-500/20 text-red-500 border-red-500/30'
              }`}
            >
              {isWarning ? <AlertTriangle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                {circuitError.title}
              </h2>
              <p className="text-[11px] text-slate-500 font-mono">
                Circuit Electrical Rules Diagnostic (ERC)
              </p>
            </div>
          </div>
          <button
            onClick={() => setCircuitError(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-500/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="p-5 space-y-4 text-xs">
          {/* Main error message */}
          <div
            className={`p-3.5 rounded-xl border font-medium leading-relaxed ${
              isDark
                ? 'bg-slate-950/80 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            {circuitError.message}
          </div>

          {/* Detailed Diagnosis & Troubleshooting Steps */}
          {circuitError.details && circuitError.details.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-cyan-500" /> Troubleshooting Guidance:
              </span>
              <ul className="space-y-1.5 pl-1">
                {circuitError.details.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-slate-400">
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div
          className={`px-5 py-3.5 border-t flex items-center justify-end gap-2.5 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          {circuitError.affectedComponentId && (
            <button
              onClick={handleFixTarget}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition shadow-sm"
            >
              Select & Inspect Component
            </button>
          )}
          <button
            onClick={() => setCircuitError(null)}
            className={`px-4 py-1.5 rounded-lg border font-semibold transition ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
            }`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
