// ============================================================
// VirtualLab-HIL — Save & Load Circuit Modal
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  Save, FolderOpen, Download, Upload, Trash2, CheckCircle2,
  AlertCircle, FileJson, Clock, HardDrive, Database, X,
} from 'lucide-react';

interface LocalSavedCircuit {
  id: string;
  name: string;
  savedAt: string;
  componentCount: number;
  wireCount: number;
  data: string; // JSON string
}

const LOCAL_STORAGE_KEY = 'virtuallab_saved_circuits';

export const SaveLoadCircuitModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'save' | 'load' | 'local'>('save');
  const [circuitName, setCircuitName] = useState('My Custom Circuit');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [localSavedList, setLocalSavedList] = useState<LocalSavedCircuit[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const exportNetlist = useCircuitStore((s) => s.exportNetlist);
  const importNetlist = useCircuitStore((s) => s.importNetlist);
  const hasAutosavedSession = useCircuitStore((s) => s.hasAutosavedSession);
  const lastAutosavedTime = useCircuitStore((s) => s.lastAutosavedTime);
  const clearSessionCache = useCircuitStore((s) => s.clearSessionCache);

  const componentCount = Object.keys(components).length;
  const wireCount = edges.length;

  // Load local saved circuits on open
  useEffect(() => {
    if (isOpen) {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
          setLocalSavedList(JSON.parse(raw));
        }
      } catch (err) {
        console.error('Failed to parse local storage circuits', err);
      }
    }
  }, [isOpen]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // 1. Save to File (.json)
  const handleSaveToFile = () => {
    if (componentCount === 0) {
      showToast('error', 'Cannot save an empty circuit canvas.');
      return;
    }
    const jsonStr = exportNetlist();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = circuitName.trim().replace(/[^a-z0-9_-]/gi, '_') || 'circuit';
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', `Circuit downloaded as "${safeName}.json" successfully!`);
  };

  // 2. Save to Browser Local Storage
  const handleSaveToLocalStorage = () => {
    if (componentCount === 0) {
      showToast('error', 'Cannot save an empty circuit canvas.');
      return;
    }
    const jsonStr = exportNetlist();
    const newEntry: LocalSavedCircuit = {
      id: `circuit_${Date.now()}`,
      name: circuitName.trim() || 'Untitled Circuit',
      savedAt: new Date().toLocaleString(),
      componentCount,
      wireCount,
      data: jsonStr,
    };
    const updated = [newEntry, ...localSavedList];
    setLocalSavedList(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    showToast('success', `Saved "${newEntry.name}" to browser storage!`);
  };

  // 3. Load from File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.components || !parsed.nodes) {
          showToast('error', 'Invalid circuit file format (missing components/nodes).');
          return;
        }
        importNetlist(text);
        showToast('success', `Loaded "${file.name}" successfully! (${Object.keys(parsed.components).length} parts)`);
        setTimeout(() => onClose(), 800);
      } catch (err) {
        showToast('error', 'Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  // 4. Load from Local Storage item
  const handleLoadFromLocal = (entry: LocalSavedCircuit) => {
    try {
      importNetlist(entry.data);
      showToast('success', `Loaded "${entry.name}" successfully!`);
      setTimeout(() => onClose(), 800);
    } catch (err) {
      showToast('error', 'Failed to load saved circuit.');
    }
  };

  // 5. Delete from Local Storage
  const handleDeleteLocal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = localSavedList.filter((item) => item.id !== id);
    setLocalSavedList(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    showToast('success', 'Removed saved circuit from browser storage.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-700 text-cyan-400">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Circuit File Manager
              </h2>
              <p className="text-[11px] text-slate-400">
                Save & load circuit netlists, layouts, and presets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Toast Notification Banner ── */}
        {notification && (
          <div
            className={`px-4 py-2 text-xs flex items-center gap-2 transition-all ${
              notification.type === 'success'
                ? 'bg-green-950/80 text-green-300 border-b border-green-800'
                : 'bg-red-950/80 text-red-300 border-b border-red-800'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* ── Navigation Tabs ── */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('save')}
            className={`px-3 py-2 font-medium rounded-t-lg transition flex items-center gap-1.5 ${
              activeTab === 'save'
                ? 'bg-slate-900 text-cyan-300 border-t border-x border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Save className="w-3.5 h-3.5" /> Save Circuit
          </button>
          <button
            onClick={() => setActiveTab('load')}
            className={`px-3 py-2 font-medium rounded-t-lg transition flex items-center gap-1.5 ${
              activeTab === 'load'
                ? 'bg-slate-900 text-cyan-300 border-t border-x border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Load from File
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`px-3 py-2 font-medium rounded-t-lg transition flex items-center gap-1.5 ${
              activeTab === 'local'
                ? 'bg-slate-900 text-cyan-300 border-t border-x border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" /> Saved in Browser ({localSavedList.length})
          </button>
        </div>

        {/* ── Tab Contents ── */}
        <div className="p-5 bg-slate-900 flex-1">
          {/* TAB 1: SAVE */}
          {activeTab === 'save' && (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center font-mono">
                <span className="text-slate-400">Current Canvas State:</span>
                <div className="flex gap-3">
                  <span className="text-cyan-400 font-bold">{componentCount} Components</span>
                  <span className="text-amber-400 font-bold">{wireCount} Wires</span>
                </div>
              </div>

              {/* Session Auto-Save status banner */}
              {hasAutosavedSession && (
                <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/80 flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-slate-300">Browser Auto-Save:</span>
                    <span className="text-cyan-300 font-bold">{lastAutosavedTime || 'Active'}</span>
                  </div>
                  <button
                    onClick={() => {
                      clearSessionCache();
                      showToast('success', 'Autosaved session cache deleted.');
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-red-950 hover:text-red-300 text-slate-400 border border-slate-700 transition"
                  >
                    Clear Cache
                  </button>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Circuit Name</label>
                <input
                  type="text"
                  value={circuitName}
                  onChange={(e) => setCircuitName(e.target.value)}
                  placeholder="e.g. 555_Astable_Multivibrator"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-lg px-3 py-2 text-slate-100 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleSaveToFile}
                  className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl bg-cyan-950/40 hover:bg-cyan-950/70 border border-cyan-700/60 hover:border-cyan-500 text-cyan-300 transition group"
                >
                  <Download className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition" />
                  <span className="font-bold">Download JSON File</span>
                  <span className="text-[10px] text-slate-400">Save to your local computer</span>
                </button>

                <button
                  onClick={handleSaveToLocalStorage}
                  className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl bg-purple-950/40 hover:bg-purple-950/70 border border-purple-700/60 hover:border-purple-500 text-purple-300 transition group"
                >
                  <HardDrive className="w-5 h-5 text-purple-400 group-hover:scale-110 transition" />
                  <span className="font-bold">Save to Browser</span>
                  <span className="text-[10px] text-slate-400">Stored in browser cache</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: LOAD FROM FILE */}
          {activeTab === 'load' && (
            <div className="space-y-4 text-xs">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-cyan-400 rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-slate-950/50 hover:bg-slate-950 cursor-pointer transition text-center"
              >
                <div className="p-3 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  <FileJson className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    Click to browse or drop your circuit <span className="text-cyan-400 font-mono">.json</span> file
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Supports all VirtualLab-HIL schematic & netlist exports
                  </p>
                </div>
                <button className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow transition mt-1">
                  Select File
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* TAB 3: SAVED IN BROWSER */}
          {activeTab === 'local' && (
            <div className="space-y-2 text-xs max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {localSavedList.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p>No saved circuits in browser storage yet.</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Use the "Save Circuit" tab to quickly store circuits here.
                  </p>
                </div>
              ) : (
                localSavedList.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => handleLoadFromLocal(entry)}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500 cursor-pointer transition group"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-slate-200 group-hover:text-cyan-300 text-xs">
                        {entry.name}
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {entry.savedAt}
                        </span>
                        <span>{entry.componentCount} parts</span>
                        <span>{entry.wireCount} wires</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadFromLocal(entry);
                        }}
                        className="px-2.5 py-1 rounded bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white text-[11px] font-medium transition"
                      >
                        Load
                      </button>
                      <button
                        onClick={(e) => handleDeleteLocal(entry.id, e)}
                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition"
                        title="Delete saved circuit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
