// ============================================================
// VirtualLab-HIL — Gemini AI Circuit Service
// Handles communication with Python backend failover pool + browser fallback
// ============================================================

import type { AICircuitSpec } from './circuitLayoutCompiler';

export interface KeyStatusInfo {
  total_keys: number;
  keys: Array<{
    index: number;
    masked: string;
    status: 'ready' | 'cooling_down';
    cooldown_remaining_sec: number;
  }>;
  has_keys: boolean;
}

export interface AIGenerationResponse {
  success: boolean;
  circuit: AICircuitSpec;
  model_used: string;
  key_index_used?: number;
  total_attempts?: number;
  failover_occurred?: boolean;
  source: 'backend' | 'browser_direct';
}

const LOCAL_STORAGE_KEY_POOL = 'virtuallab_gemini_key_pool';
const BACKEND_URL = 'http://localhost:8000';

export function getLocalStoredKeys(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_POOL);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return [];
  }
}

export function saveLocalStoredKeys(keys: string[]) {
  try {
    const clean = keys.map((k) => k.trim()).filter((k) => k.length > 0);
    localStorage.setItem(LOCAL_STORAGE_KEY_POOL, JSON.stringify(clean));
  } catch (e) {
    console.error('Failed to save keys to localStorage:', e);
  }
}

export async function fetchBackendKeyStatus(): Promise<KeyStatusInfo | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ai/keys-status`, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null; // Backend not running
  }
}

export async function saveKeysToBackend(keys: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ai/save-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Generate circuit using Python backend failover pool.
 * If backend is unavailable, gracefully falls back to browser direct call.
 */
export async function requestAICircuitGeneration(
  prompt: string,
  model: string = 'gemini-3.6-flash',
  clientKeys: string[] = [],
): Promise<AIGenerationResponse> {
  const localKeys = clientKeys.length > 0 ? clientKeys : getLocalStoredKeys();

  // 1. Try Python Backend First (Secure on device + automatic failover)
  try {
    const res = await fetch(`${BACKEND_URL}/api/ai/generate-circuit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model,
        client_keys: localKeys.length > 0 ? localKeys : undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        ...data,
        source: 'backend',
      };
    } else {
      const errJson = await res.json().catch(() => null);
      const detail = errJson?.detail || res.statusText;
      console.warn(`[GeminiService] Backend error: ${detail}. Trying direct browser fallback...`);
    }
  } catch (e) {
    console.info('[GeminiService] Backend unreachable on port 8000. Using direct browser Gemini API...');
  }

  // 2. Browser Direct Fallback (Rotating local keys and fallback models)
  if (localKeys.length === 0) {
    throw new Error(
      'No Gemini API key provided. Please configure an API key in the AI Circuit dialog or start the Python backend with GEMINI_API_KEYS.'
    );
  }

  const fallbackModels = [model, 'gemini-3.6-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  let lastErr: Error | null = null;
  let attempts = 0;

  for (const currModel of fallbackModels) {
    for (let idx = 0; idx < localKeys.length; idx++) {
      const apiKey = localKeys[idx];
      attempts++;
      try {
        const circuit = await callGeminiBrowserDirect(apiKey, prompt, currModel);
        return {
          success: true,
          circuit,
          model_used: currModel,
          key_index_used: idx,
          total_attempts: attempts,
          failover_occurred: attempts > 1,
          source: 'browser_direct',
        };
      } catch (err: any) {
        lastErr = err;
        console.warn(`[GeminiService] Key #${idx} on ${currModel} failed: ${err.message}.`);
        if (err.message?.includes('404')) {
          break; // Try next fallback model
        }
      }
    }
  }

  throw new Error(`All ${attempts} Gemini API keys failed. ${lastErr?.message || ''}`);
}

/**
 * Direct browser call to Gemini REST API
 */
async function callGeminiBrowserDirect(
  apiKey: string,
  prompt: string,
  model: string = 'gemini-3.6-flash',
): Promise<AICircuitSpec> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = `You are an expert Electronic Circuit Synthesis Engine for VirtualLab-HIL.
Generate a 100% complete, fully wired, closed-loop circuit JSON.

COMPONENTS & PIN IDENTIFIERS:
- "bjt_npn", "bjt_pnp": pins are "base", "collector", "emitter" (params: {"beta": 100})
- "mosfet_n_enh", "mosfet_p_enh": pins are "gate", "drain", "source"
- "resistor", "capacitor", "inductor", "diode", "zener", "led": pins are "p" (pin 1 / anode), "n" (pin 2 / cathode)
- "opamp": pins are "inp" (non-inverting), "inn" (inverting), "out", "vcc", "vee"
- "dc_voltage": pins are "p" (V+), "n" (GND)
- "ac_voltage": pins are "p" (SIG), "n" (GND)
- "signal_generator": pins are "out", "gnd"
- "ground": pins are "p" (GND potential)
- "oscilloscope": pins are "p" (PROBE), "n" (GND)
- "gate_and", "gate_or", "gate_nand", "gate_nor", "gate_xor", "gate_xnor": pins are "A", "B", "out"
- "gate_not": pins are "A", "out"
- "clock_source": pins are "out" (CLK)
- "digital_input": pins are "out"
- "digital_output": pins are "in"
- "ff_d": pins are "D", "CLK", "CLR", "Q", "Qbar"
- "ff_jk": pins are "J", "K", "CLK", "CLR", "SET", "Q", "Qbar"

RULES:
1. ALWAYS provide a complete, working closed loop. Every component pin involved in the circuit must have explicit connections.
2. For analog circuits, ALWAYS connect reference points (power supply negative, AC source ground, oscilloscope ground, bias pull-downs, emitter/source resistors) to "ground:p".
3. Return ONLY pure JSON matching:
{
  "title": "Circuit Title",
  "description": "Short explanation",
  "components": [
    { "id": "id", "kind": "kind", "label": "Label", "params": { ... } }
  ],
  "connections": [
    { "from": "comp_id:pin_id", "to": "comp_id:pin_id" }
  ]
}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\nUSER REQUEST: ${prompt}\n\nPlease generate the JSON now:` }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errBody}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini API.');

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

  return JSON.parse(cleaned.trim());
}
