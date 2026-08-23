// ============================================================
// VirtualLab-HIL — Live Diagnostic Debug Console
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { logger, type LogEntry, type LogLevel } from '@/utils/logger';
import { useCircuitStore } from '@/store/circuitStore';
import {
  Terminal, ChevronUp, ChevronDown, Trash2, Copy,
  CheckCircle2, AlertTriangle, AlertCircle, Info, Cpu, Check,
} from 'lucide-react';

export const DebugConsole: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'solver'>('all');
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const simulationState = useCircuitStore((s) => s.simulationState);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  useEffect(() => {
    // Initial logs
    setLogs([...logger.getHistory()]);

    // Subscribe to new logs
    const unsubscribe = logger.subscribe((entry) => {
      setLogs((prev) => [...prev, entry]);
      // If error occurs, auto-open console so user immediately sees why
      if (entry.level === 'error') {
        setIsOpen(true);
      }
    });

    return unsubscribe;
  }, []);

  // Auto-scroll to bottom when open
  useEffect(() => {
    if (isOpen) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearLogs = () => {
    logger.clearHistory();
    setLogs([]);
  };

  const filteredLogs = logs.filter((l) => {
    if (filter === 'all') return true;
    if (filter === 'error') return l.level === 'error';
    if (filter === 'warn') return l.level === 'warn';
    if (filter === 'solver') return l.level === 'solver' || l.category === 'solver' || l.category === 'netlist';
    return true;
  });

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
      case 'warn':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />;
      case 'solver':
        return <Cpu className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
      case 'info':
      default:
        return <Info className="w-3.5 h-3.5 text-cyan-500 shrink-0" />;
    }
  };

  const getLevelColor = (level: LogLevel) => {
    if (isDark) {
      switch (level) {
        case 'error':
          return 'text-red-400 bg-red-950/40 border-red-900/60';
        case 'warn':
          return 'text-amber-300 bg-amber-950/40 border-amber-900/60';
        case 'success':
          return 'text-green-300 bg-green-950/40 border-green-900/60';
        case 'solver':
          return 'text-purple-300 bg-purple-950/40 border-purple-900/60';
        case 'info':
        default:
          return 'text-slate-300 bg-slate-900/40 border-slate-800';
      }
    } else {
      switch (level) {
        case 'error':
          return 'text-red-800 bg-red-50 border-red-200';
        case 'warn':
          return 'text-amber-800 bg-amber-50 border-amber-200';
        case 'success':
          return 'text-green-800 bg-green-50 border-green-200';
        case 'solver':
          return 'text-purple-800 bg-purple-50 border-purple-200';
        case 'info':
        default:
          return 'text-slate-800 bg-slate-100/80 border-slate-200';
      }
    }
  };

  return (
    <div
      className={`fixed bottom-0 left-72 right-0 z-40 border-t transition-all duration-300 flex flex-col shadow-2xl backdrop-blur-md ${
        isDark ? 'bg-slate-950/95 border-slate-800' : 'bg-white/95 border-slate-200'
      } ${isOpen ? 'h-64' : 'h-8'}`}
    >
      {/* ── Console Header Bar ── */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`h-8 px-4 border-b flex items-center justify-between cursor-pointer select-none text-xs transition ${
          isDark
            ? 'bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-200'
            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Terminal className="w-3.5 h-3.5 text-cyan-500" />
          <span className="font-semibold tracking-wide">
            Diagnostic Console & Solver Logs
          </span>

          {/* Error & Warning Badges */}
          {errorCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-red-600 text-white font-mono text-[10px] font-bold border border-red-700 animate-pulse">
              {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-mono text-[10px] font-bold border border-amber-600">
              {warnCount} {warnCount === 1 ? 'Warning' : 'Warnings'}
            </span>
          )}

          {/* Status Indicator */}
          <span className="text-[10px] text-slate-400 font-mono">
            [Status: {simulationState.status.toUpperCase()} | {Object.keys(components).length} parts, {edges.length} wires]
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* ── Console Body & Toolbar ── */}
      {isOpen && (
        <div className={`flex-1 flex flex-col overflow-hidden ${isDark ? 'bg-[#07090e]' : 'bg-slate-50'}`}>
          {/* Sub-toolbar */}
          <div
            className={`px-3 py-1.5 border-b flex items-center justify-between text-[11px] ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1">
              {(['all', 'error', 'warn', 'solver'] as const).map((f) => (
                <button
                  key={f}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilter(f);
                  }}
                  className={`px-2 py-0.5 rounded capitalize font-medium transition ${
                    filter === f
                      ? isDark
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                        : 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyLogs();
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded border transition ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                }`}
              >
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearLogs();
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded border transition ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 border-slate-700'
                    : 'bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 border-slate-300 shadow-sm'
                }`}
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>

          {/* Log Stream */}
          <div className="flex-1 p-2 overflow-y-auto font-mono text-[11px] space-y-1 custom-scrollbar select-text">
            {filteredLogs.length === 0 ? (
              <div className="text-slate-400 text-center py-6">
                No diagnostic log entries recorded.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 p-1.5 rounded border ${getLevelColor(log.level)}`}
                >
                  {getLevelIcon(log.level)}
                  <span className="text-slate-400 shrink-0 text-[10px]">[{log.timestamp}]</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold shrink-0">[{log.category.toUpperCase()}]</span>
                  <span className="flex-1 break-words">{log.message}</span>
                  {log.details && (
                    <span className="text-slate-400 text-[10px]">
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                    </span>
                  )}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};
