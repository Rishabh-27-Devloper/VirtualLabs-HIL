// ============================================================
// VirtualLab-HIL — Component Palette (Sidebar)
// ============================================================

import React, { useState } from 'react';
import { COMPONENT_REGISTRY, type ComponentMetadata } from '@/components/canvas/componentDefs';
import { useCircuitStore } from '@/store/circuitStore';
import type { ComponentKind } from '@/types/circuit';
import {
  Search, Gauge, Zap, Cpu, Activity, Sliders, Radio,
  ChevronDown, ChevronRight, Plus, X,
} from 'lucide-react';

export const ComponentPalette: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const addComponent = useCircuitStore((s) => s.addComponent);
  const showPalette = useCircuitStore((s) => s.showPalette);
  const setShowPalette = useCircuitStore((s) => s.setShowPalette);
  const theme = useCircuitStore((s) => s.theme);
  const isDark = theme === 'dark';

  if (!showPalette) return null;

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const onDragStart = (event: React.DragEvent, kind: ComponentKind) => {
    event.dataTransfer.setData('application/virtuallab-component', kind);
    event.dataTransfer.effectAllowed = 'move';
  };

  const categories = [
    { id: 'passives', label: 'Passives & Discrete', icon: Gauge, color: 'text-blue-500' },
    { id: 'sources', label: 'Power & Wave Sources', icon: Zap, color: 'text-yellow-500' },
    { id: 'semiconductors', label: 'Semiconductors', icon: Cpu, color: 'text-purple-500' },
    { id: 'digital', label: 'Digital Logic & Gates', icon: Cpu, color: 'text-green-500' },
    { id: 'instruments', label: 'Virtual Instruments', icon: Activity, color: 'text-cyan-500' },
    { id: 'controls', label: 'Switches & Indicators', icon: Sliders, color: 'text-pink-500' },
    { id: 'hil', label: 'Hardware-in-the-Loop (ESP32)', icon: Radio, color: 'text-orange-500' },
  ];

  const allComponents: ComponentMetadata[] = Object.values(COMPONENT_REGISTRY);

  const filteredComponents = allComponents.filter(
    (c: ComponentMetadata) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.kind.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <>
      {/* Backdrop overlay on mobile */}
      <div
        onClick={() => setShowPalette(false)}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden animate-in fade-in duration-150"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 lg:relative lg:z-10 w-76 lg:w-72 max-w-[85vw] h-full border-r flex flex-col backdrop-blur-2xl select-none shadow-2xl lg:shadow-none transition-colors duration-200 animate-in slide-in-from-left duration-200 ${
          isDark
            ? 'bg-slate-950/95 border-slate-800 text-slate-100'
            : 'bg-slate-50/95 border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        {/* ── Search Header ── */}
        <div className={`p-3 border-b flex flex-col gap-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Component Palette
            </h2>
            <button
              onClick={() => setShowPalette(false)}
              className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close Palette"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search parts, gates, sensors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 border rounded-md text-xs placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition ${
              isDark
                ? 'bg-slate-900 border-slate-750 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900 shadow-inner'
            }`}
          />
        </div>
      </div>

      {/* ── Category Tree ── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {categories.map((cat) => {
          const compsInCat = filteredComponents.filter((c) => c.category === cat.id);
          if (compsInCat.length === 0) return null;
          const isCollapsed = !!collapsedCategories[cat.id];
          const Icon = cat.icon;

          return (
            <div
              key={cat.id}
              className={`rounded-lg border overflow-hidden transition-colors ${
                isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
              }`}
            >
              <button
                onClick={() => toggleCategory(cat.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-semibold transition ${
                  isDark
                    ? 'text-slate-300 hover:bg-slate-800/60'
                    : 'text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${cat.color}`} />
                  <span>{cat.label}</span>
                  <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>({compsInCat.length})</span>
                </div>
                {isCollapsed ? (
                  <ChevronRight className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                ) : (
                  <ChevronDown className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                )}
              </button>

              {!isCollapsed && (
                <div
                  className={`p-1.5 grid grid-cols-1 gap-1.5 border-t ${
                    isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-100/60'
                  }`}
                >
                  {compsInCat.map((comp: ComponentMetadata) => (
                    <div
                      key={comp.kind}
                      draggable
                      onDragStart={(e) => onDragStart(e, comp.kind)}
                      onClick={() => addComponent(comp.kind, { x: 300 + Math.random() * 80, y: 200 + Math.random() * 80 })}
                      className={`group flex items-center justify-between p-2 rounded-md border cursor-grab active:cursor-grabbing transition shadow-sm ${
                        isDark
                          ? 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 hover:border-cyan-500/50'
                          : 'bg-white hover:bg-cyan-50/80 border-slate-300 hover:border-cyan-600'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className={`text-xs font-bold truncate ${isDark ? 'text-slate-100 group-hover:text-cyan-400' : 'text-slate-950 group-hover:text-cyan-700'}`}>
                          {comp.name}
                        </span>
                        <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                          {comp.description}
                        </span>
                      </div>
                      <button
                        className={`opacity-0 group-hover:opacity-100 p-1 rounded transition ${isDark ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-600 hover:text-cyan-700 hover:bg-cyan-100'}`}
                        title="Click to add"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </aside>
    </>
  );
};
