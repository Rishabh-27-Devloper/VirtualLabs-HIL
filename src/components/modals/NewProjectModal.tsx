// ============================================================
// VirtualLab-HIL — New Project Confirmation & Save Modal
// ============================================================

import React, { useState } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  FilePlus, Download, Trash2, X, AlertTriangle, Save,
  HardDrive, CheckCircle2, Sparkles,
} from 'lucide-react';
import { logger } from '@/utils/logger';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose }) => {
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const exportNetlist = useCircuitStore((s) => s.exportNetlist);
  const loadPreset = useCircuitStore((s) => s.loadPreset);
  const pauseSimulation = useCircuitStore((s) => s.pauseSimulation);
  const clearSessionCache = useCircuitStore((s) => s.clearSessionCache);

  const [projectName, setProjectName] = useState('My_Circuit_Backup');
  const [saveSuccessToast, setSaveSuccessToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const componentCount = Object.keys(components).length;
  const wireCount = edges.length;

  const handleSaveAndNew = () => {
    // 1. Export and trigger file download
    try {
      const jsonStr = exportNetlist();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = projectName.trim().replace(/[^a-z0-9_-]/gi, '_') || 'circuit_backup';
      a.href = url;
      a.download = `${safeName}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Also back up to localStorage
      try {
        const LOCAL_STORAGE_KEY = 'virtuallab_saved_circuits';
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        list.unshift({
          id: `circuit_${Date.now()}`,
          name: safeName,
          savedAt: new Date().toLocaleString(),
          componentCount,
          wireCount,
          data: jsonStr,
        });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      } catch (err) {
        console.warn('Could not cache to local storage', err);
      }

      logger.success('canvas', `Backed up current circuit as "${safeName}.json"`);
    } catch (e) {
      console.error('Failed to export circuit before new project', e);
    }

    // 2. Pause simulation and reset to fresh default canvas
    pauseSimulation();
    clearSessionCache();
    loadPreset('default_empty');
    logger.info('canvas', 'Initialized fresh blank project');
    onClose();
  };

  const handleDiscardAndNew = () => {
    pauseSimulation();
    clearSessionCache();
    loadPreset('default_empty');
    logger.info('canvas', 'Discarded previous circuit and started new project');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-all ${
          isDark
            ? 'bg-slate-900 border-slate-700/80 text-slate-100 shadow-cyan-950/20'
            : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
        }`}
      >
        {/* ── Modal Header ── */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl border ${
                isDark
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-cyan-100 text-cyan-700 border-cyan-300'
              }`}
            >
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Create New Project</h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Reset canvas to clean default state
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition ${
              isDark
                ? 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="p-5 space-y-4">
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              isDark
                ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold">
                You have active components on the canvas:
              </p>
              <div className="flex items-center gap-3 font-mono text-[11px] opacity-90">
                <span>📦 {componentCount} Components</span>
                <span>⚡ {wireCount} Connected Wires</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-1">
                Creating a new project will clear the canvas and place a fresh Ground reference. Would you like to save your work before resetting?
              </p>
            </div>
          </div>

          {/* Backup Filename Input */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
              Backup Filename (if saving):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="circuit_backup"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none focus:border-cyan-500 ${
                  isDark ? 'bg-slate-950 border-slate-750 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <span className="text-xs font-mono text-slate-400">.json</span>
            </div>
          </div>
        </div>

        {/* ── Modal Actions Footer ── */}
        <div
          className={`px-5 py-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-2.5 ${
            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <button
            onClick={onClose}
            className={`w-full sm:w-auto px-3.5 py-1.5 rounded-lg border text-xs font-medium transition ${
              isDark
                ? 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleDiscardAndNew}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                isDark
                  ? 'border-red-900/60 bg-red-950/40 text-red-400 hover:bg-red-900/60 hover:text-red-200'
                  : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
              }`}
              title="Discard current circuit and reset canvas immediately"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard & New</span>
            </button>

            <button
              onClick={handleSaveAndNew}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition ${
                isDark
                  ? 'bg-cyan-600 hover:bg-cyan-500 border border-cyan-400/40'
                  : 'bg-cyan-600 hover:bg-cyan-700 border border-cyan-700'
              }`}
              title="Save current circuit to file & localStorage, then start clean new project"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save & New</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
