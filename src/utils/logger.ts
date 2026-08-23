// ============================================================
// VirtualLab-HIL — Central Diagnostic Logger
// ============================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'solver';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: 'engine' | 'canvas' | 'hil' | 'netlist' | 'solver';
  message: string;
  details?: any;
}

type LogListener = (entry: LogEntry) => void;

class DiagnosticLogger {
  private listeners: Set<LogListener> = new Set();
  private history: LogEntry[] = [];
  private maxHistory = 500;

  subscribe(listener: LogListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHistory(): LogEntry[] {
    return this.history;
  }

  clearHistory() {
    this.history = [];
    this.emit({
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      category: 'engine',
      message: 'Diagnostic log cleared.',
    });
  }

  private emit(entry: LogEntry) {
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.listeners.forEach((fn) => {
      try {
        fn(entry);
      } catch (err) {
        console.error('Logger listener error', err);
      }
    });
  }

  info(category: LogEntry['category'], message: string, details?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      category,
      message,
      details,
    };
    console.info(`%c[VirtualLab:${category.toUpperCase()}]%c ${message}`, 'color: #38bdf8; font-weight: bold;', 'color: #e2e8f0;', details ?? '');
    this.emit(entry);
  }

  success(category: LogEntry['category'], message: string, details?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'success',
      category,
      message,
      details,
    };
    console.log(`%c[VirtualLab:${category.toUpperCase()}]%c ✅ ${message}`, 'color: #4ade80; font-weight: bold;', 'color: #e2e8f0;', details ?? '');
    this.emit(entry);
  }

  warn(category: LogEntry['category'], message: string, details?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'warn',
      category,
      message,
      details,
    };
    console.warn(`[VirtualLab:${category.toUpperCase()}] ⚠️ ${message}`, details ?? '');
    this.emit(entry);
  }

  error(category: LogEntry['category'], message: string, details?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'error',
      category,
      message,
      details,
    };
    console.error(`[VirtualLab:${category.toUpperCase()}] ❌ ${message}`, details ?? '');
    this.emit(entry);
  }

  solver(message: string, details?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'solver',
      category: 'solver',
      message,
      details,
    };
    console.log(`%c[VirtualLab:SOLVER]%c ⚙️ ${message}`, 'color: #c084fc; font-weight: bold;', 'color: #cbd5e1;', details ?? '');
    this.emit(entry);
  }
}

export const logger = new DiagnosticLogger();
