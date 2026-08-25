// ============================================================
// VirtualLab-HIL — Gemini AI Circuit Generator Modal
// (Multi-Key Failover Pool, Prompt Synthesis, Auto-Layout)
// ============================================================

import React, { useState, useEffect } from 'react';
import { useCircuitStore } from '@/store/circuitStore';
import {
  Sparkles, X, Key, Server, Cpu, Check, AlertCircle,
  RefreshCw, Plus, Trash2, ShieldCheck, ChevronDown, ChevronUp,
  Sliders, Layers, ExternalLink, Zap,
} from 'lucide-react';
import {
  requestAICircuitGeneration,
  fetchBackendKeyStatus,
  saveKeysToBackend,
  getLocalStoredKeys,
  saveLocalStoredKeys,
  type KeyStatusInfo,
} from '@/services/geminiCircuitService';

const EXAMPLE_PROMPTS = [
  {
    title: '8-Bit Ring Counter',
    desc: '10Hz Clock with D Flip-Flops & Logic Probes',
    prompt: 'Create an 8-bit Ring Counter using D flip-flops (ff_d) driven by a 10Hz clock source. Connect logic probe outputs (digital_output) to all 8 Q output bits.',
  },
  {
    title: '4-Bit Full Adder',
    desc: 'XOR, AND, OR gates with Logic Inputs & Probes',
    prompt: 'Design a 1-bit Full Adder circuit using basic logic gates (XOR, AND, OR) with digital_input switches for inputs A, B, Cin and digital_output probes for Sum and Cout.',
  },
  {
    title: 'BJT Common Emitter Amplifier',
    desc: 'Voltage divider bias with 10x gain & AC source',
    prompt: 'Design a BJT Common Emitter Amplifier using a bjt_npn transistor with voltage divider biasing, input capacitor, emitter resistor with bypass capacitor, collector resistor, 10V DC rail, and a 1kHz AC input signal.',
  },
  {
    title: 'Op-Amp Inverting Amplifier',
    desc: 'Gain = -10 with 10k/100k resistors & rails',
    prompt: 'Design an inverting amplifier using an opamp with an input resistor of 10k, a feedback resistor of 100k (Gain -10), +/-15V supply rails (rail_vcc, rail_vee), and a ground reference.',
  },
  {
    title: '555 Astable Multivibrator',
    desc: 'Square wave oscillator with resistors & cap',
    prompt: 'Create an astable multivibrator square wave oscillator with resistors, capacitor, and output LED or probe.',
  },
  {
    title: 'JK Flip-Flop Modulo-8 Counter',
    desc: '3-Bit Ripple Counter with clock and probes',
    prompt: 'Design a 3-bit binary asynchronous up-counter using 3 JK flip-flops (ff_jk) with J and K tied HIGH, clocked by a 5Hz clock source, with logic output probes on Q0, Q1, Q2.',
  },
];

export const AICircuitModal: React.FC = () => {
  const show = useCircuitStore((s) => s.showAICircuitModal);
  const setShow = useCircuitStore((s) => s.setShowAICircuitModal);
  const loadGeneratedCircuit = useCircuitStore((s) => s.loadGeneratedCircuit);
  const components = useCircuitStore((s) => s.components);
  const edges = useCircuitStore((s) => s.edges);
  const compCount = Object.keys(components).length;
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gemini-3.6-flash');
  const [placementMode, setPlacementMode] = useState<'replace' | 'modify' | 'append'>('replace');

  // Set default mode based on whether canvas has components
  useEffect(() => {
    if (compCount > 1) {
      setPlacementMode('modify');
    }
  }, [compCount]);

  // Key Pool State
  const [keysList, setKeysList] = useState<string[]>([]);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [backendStatus, setBackendStatus] = useState<KeyStatusInfo | null>(null);

  // Execution State
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSuccessInfo, setLastSuccessInfo] = useState<string | null>(null);

  // Load initial keys on open
  useEffect(() => {
    if (!show) return;
    const local = getLocalStoredKeys();
    setKeysList(local);

    // Query backend key status
    fetchBackendKeyStatus().then((info) => {
      setBackendStatus(info);
      if (info && info.keys.length > 0 && local.length === 0) {
        // Backend already has keys configured!
      }
    });
  }, [show]);

  const handleAddKey = () => {
    const trimmed = newKeyInput.trim();
    if (!trimmed) return;
    const split = trimmed.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean);
    const updated = Array.from(new Set([...keysList, ...split]));
    setKeysList(updated);
    saveLocalStoredKeys(updated);
    saveKeysToBackend(updated);
    setNewKeyInput('');
  };

  const handleRemoveKey = (indexToRemove: number) => {
    const updated = keysList.filter((_, idx) => idx !== indexToRemove);
    setKeysList(updated);
    saveLocalStoredKeys(updated);
    saveKeysToBackend(updated);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorMessage('Please describe the circuit you would like to create.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setLastSuccessInfo(null);
    setStatusMessage('Querying Gemini AI with Failover Key Pool...');

    try {
      setStatusMessage('Synthesizing circuit topology and pin mappings...');

      const isModifying = placementMode === 'modify' && compCount > 0;
      const currentCircuitContext = isModifying ? {
        components: Object.values(components).map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          params: c.params,
        })),
        connections: edges.map((e) => ({
          from: `${e.source}:${e.sourceHandle || 'p'}`,
          to: `${e.target}:${e.targetHandle || 'p'}`,
        })),
      } : undefined;

      const response = await requestAICircuitGeneration(
        prompt.trim(),
        model,
        keysList,
        currentCircuitContext,
      );

      if (response.success && response.circuit) {
        setStatusMessage('Compiling topological layout and auto-routing wires...');
        
        loadGeneratedCircuit(response.circuit, placementMode === 'append');

        const failoverNote = response.failover_occurred
          ? ` (Switched to Key #${(response.key_index_used ?? 0) + 1} after rate limit)`
          : '';
        const successMsg = `Built "${response.circuit.title}" successfully via ${response.model_used}${failoverNote}!`;
        setLastSuccessInfo(successMsg);

        // Auto close on success after a short delay
        setTimeout(() => {
          setIsGenerating(false);
          setShow(false);
        }, 1200);
      } else {
        throw new Error('AI returned an invalid or empty circuit specification.');
      }
    } catch (err: any) {
      setIsGenerating(false);
      setErrorMessage(err.message || 'Circuit generation failed.');
      setStatusMessage('');
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-950 via-purple-950/40 to-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/40 shadow-inner">
              <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  Gemini AI Circuit Generator
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-900/50 text-purple-300 border border-purple-700/50 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Multi-Key Failover
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 ${
                    backendStatus ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <Server className="w-2.5 h-2.5" />
                  {backendStatus ? 'Backend Connected' : 'Browser Direct'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Describe any electronic or digital circuit in plain English — AI synthesizes and lays out the schematic.
              </p>
            </div>
          </div>

          <button
            onClick={() => !isGenerating && setShow(false)}
            disabled={isGenerating}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh] bg-slate-950">
          {/* Prompt Textarea */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-200 tracking-wide">
              Circuit Description / Prompt
            </label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
                placeholder="Describe your circuit in detail... (e.g. '8-Bit Ring Counter with 10Hz Clock and Output Probes on all bits')"
                rows={3}
                className="w-full bg-slate-900 border-2 border-slate-700/90 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition resize-none disabled:opacity-50"
              />
            </div>
          </div>

          {/* Preset Example Chips */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Quick Prompt Templates:</span>
              <span className="text-[10px] text-slate-500">Click to load prompt</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.title}
                  type="button"
                  onClick={() => setPrompt(ex.prompt)}
                  disabled={isGenerating}
                  className="p-2 text-left rounded-lg bg-slate-900/90 hover:bg-purple-950/40 border border-slate-800 hover:border-purple-600/60 transition group flex flex-col justify-between"
                >
                  <span className="text-[11px] font-bold text-purple-300 group-hover:text-purple-200">
                    {ex.title}
                  </span>
                  <span className="text-[9px] text-slate-400 group-hover:text-slate-300 line-clamp-1">
                    {ex.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Model & Placement Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
            {/* Model Selection */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Gemini Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-purple-500"
              >
                <option value="gemini-3.6-flash">Gemini 3.6 Flash (Recommended & Active)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep Reasoning)</option>
              </select>
            </div>

            {/* Canvas Target Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Canvas Action</span>
                {compCount > 0 && <span className="text-[10px] text-purple-400 font-mono">({compCount} parts on canvas)</span>}
              </label>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setPlacementMode('replace')}
                  disabled={isGenerating}
                  className={`py-1.5 rounded-lg border font-bold transition text-center truncate px-1 ${
                    placementMode === 'replace'
                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Wipe canvas and generate fresh circuit"
                >
                  New / Replace
                </button>
                <button
                  type="button"
                  onClick={() => setPlacementMode('modify')}
                  disabled={isGenerating || compCount === 0}
                  className={`py-1.5 rounded-lg border font-bold transition text-center truncate px-1 ${
                    placementMode === 'modify'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-sm ring-1 ring-purple-400/50'
                      : compCount === 0
                      ? 'bg-slate-900/50 text-slate-600 border-slate-800/50 cursor-not-allowed'
                      : 'bg-slate-900 text-purple-400 border-slate-800 hover:text-purple-300'
                  }`}
                  title={compCount === 0 ? 'Canvas is empty — nothing to modify' : 'Modify, add to, or delete parts from the active circuit'}
                >
                  ✨ Modify Active
                </button>
                <button
                  type="button"
                  onClick={() => setPlacementMode('append')}
                  disabled={isGenerating}
                  className={`py-1.5 rounded-lg border font-bold transition text-center truncate px-1 ${
                    placementMode === 'append'
                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Keep existing circuit and place new circuit beside it"
                >
                  + Append
                </button>
              </div>
            </div>
          </div>

          {/* ── Collapsible API Key & Failover Pool Manager ── */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 space-y-2.5">
            <button
              type="button"
              onClick={() => setShowKeyManager(!showKeyManager)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-200 hover:text-purple-300 transition"
            >
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>API Keys & Failover Pool</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {keysList.length > 0 ? `${keysList.length} Keys Configured` : 'No Keys Configured'}
                </span>
              </div>
              {showKeyManager ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showKeyManager && (
              <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-in fade-in duration-100">
                <p className="text-[10px] text-slate-400">
                  Add one or more Gemini API keys. The system automatically rotates to the next available key if one hits a rate limit or exhausts its free quota. Keys are stored locally on your device.
                </p>

                {/* Add Key Input */}
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={newKeyInput}
                    onChange={(e) => setNewKeyInput(e.target.value)}
                    placeholder="Paste Gemini API Key (e.g. AIzaSy...)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-amber-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddKey}
                    disabled={!newKeyInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1 disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Key
                  </button>
                </div>

                {/* Keys List */}
                {keysList.length > 0 && (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {keysList.map((k, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">#{idx + 1}</span>
                          <span className="text-slate-300">{k.slice(0, 8)}...{k.slice(-4)}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                            Ready
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveKey(idx)}
                          className="text-slate-500 hover:text-red-400 p-0.5 rounded transition"
                          title="Remove key"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Keys are stored in <code>backend/.env</code> or <code>localStorage</code></span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-400 hover:underline flex items-center gap-1"
                  >
                    Get Free Gemini API Key <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Status / Error Alerts */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <div>
                <span className="font-bold">Generation Failed: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {lastSuccessInfo && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="font-semibold">{lastSuccessInfo}</span>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            {isGenerating && (
              <div className="flex items-center gap-2 text-purple-400 animate-pulse font-mono text-[11px]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShow(false)}
              disabled={isGenerating}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/30 border border-purple-400/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              <span>{isGenerating ? 'Generating Schematic...' : 'Generate & Build Circuit'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
