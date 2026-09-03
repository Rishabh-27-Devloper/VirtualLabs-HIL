// ============================================================
// VirtualLab-HIL — High-Tech 5-Second Animated Splash Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import { Zap, Activity, Cpu, Radio, Sparkles, Heart } from 'lucide-react';
import { APP_VERSION } from '@/version';

interface SplashScreenProps {
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing SPICE/MNA Engine...');
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 5000; // 5.0 seconds

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (pct < 25) {
        setStatusText('Initializing SPICE & MNA Nodal Solver...');
      } else if (pct < 50) {
        setStatusText('Calibrating 4-CH Virtual DSO & Signal Analyzer...');
      } else if (pct < 75) {
        setStatusText('Loading Discrete & IC Macromodels...');
      } else if (pct < 92) {
        setStatusText('Establishing ESP32 HIL Gateway Bridge...');
      } else {
        setStatusText('VirtualLab-HIL Engine Ready.');
      }

      if (elapsed >= duration) {
        clearInterval(interval);
        setIsFadingOut(true);
        setTimeout(() => {
          if (onFinish) onFinish();
        }, 450); // Allow fade-out animation to complete
      }
    }, 25);

    return () => clearInterval(interval);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between py-10 bg-[#050811] text-white select-none transition-all duration-500 ${
        isFadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Animated Ambient Glows */}
      <div className="absolute top-1/3 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none animate-pulse" />
      <div className="absolute top-1/2 w-[350px] h-[350px] rounded-full bg-blue-600/10 blur-[100px] pointer-events-none" />

      {/* Cybernetic Geometric Grid Background */}
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Top Spacer for perfect vertical alignment */}
      <div className="w-full h-4" />

      {/* ── Main Branding Centerpiece ── */}
      <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6 my-auto">
        {/* Animated Glowing Logo Avatar */}
        <div className="relative mb-6 flex items-center justify-center">
          {/* Outer Pulsing Glow Rings */}
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 opacity-40 blur-xl animate-pulse" />
          
          {/* Rotating Dashed Orbit Ring */}
          <div className="absolute -inset-3.5 rounded-3xl border border-cyan-400/40 border-dashed animate-spin [animation-duration:12s]" />

          {/* Core Icon Box */}
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-tr from-cyan-950 via-slate-900 to-blue-950 border-2 border-cyan-400/80 shadow-[0_0_35px_rgba(6,182,212,0.6)] flex items-center justify-center">
            <Zap className="w-10 h-10 text-cyan-300 fill-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.9)] animate-bounce [animation-duration:2.5s]" />
            <Activity className="w-5 h-5 text-cyan-200 absolute -bottom-1.5 -right-1.5 p-0.5 bg-slate-950 rounded-md border border-cyan-500/80 shadow-md" />
          </div>
        </div>

        {/* Product Titles */}
        <div className="text-center space-y-1 mb-8">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent drop-shadow-sm font-mono">
              VirtualLab-HIL
            </h1>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 shadow-inner">
              {APP_VERSION}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 font-mono tracking-wide">
            Mixed-Signal & Hardware-in-the-Loop Simulator
          </p>
        </div>

        {/* ── High-Tech Progress Bar ── */}
        <div className="w-full space-y-2.5">
          <div className="flex justify-between items-center text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 animate-spin [animation-duration:4s]" />
              {statusText}
            </span>
            <span className="text-cyan-400 font-bold">{progress}%</span>
          </div>

          {/* Progress Track */}
          <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 p-0.5 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 transition-all duration-75 ease-out shadow-[0_0_12px_rgba(6,182,212,0.8)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Micro Subsystem Indicators */}
          <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-cyan-500" /> SPICE Engine
            </span>
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-blue-400" /> 4-CH DSO
            </span>
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-orange-400" /> ESP32 Bridge
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom Dedication Badge ── */}
      <div className="relative z-10 flex items-center justify-center">
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/80 border border-slate-800/90 shadow-xl backdrop-blur-md text-xs font-mono text-slate-300">
          <span>Made with</span>
          <span className="inline-flex items-center animate-pulse">
            💖
          </span>
          <span>for</span>
          <span className="font-bold text-cyan-300 tracking-wider">UIET</span>
        </div>
      </div>
    </div>
  );
};
