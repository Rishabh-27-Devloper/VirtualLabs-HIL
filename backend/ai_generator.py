"""
VirtualLab-HIL — Gemini AI Circuit Generation Engine with Multi-Key Pool & Failover
"""

import os
import json
import time
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional, Tuple


# Path to local keys config file
KEYS_FILE_PATH = os.path.join(os.path.dirname(__file__), "keys.json")
ENV_FILE_PATH = os.path.join(os.path.dirname(__file__), ".env")


class KeyManager:
    """
    Manages a pool of Gemini API keys with health tracking, rotation, and automatic failover.
    """
    def __init__(self):
        self.keys: List[str] = []
        self.active_index: int = 0
        self.key_cooldowns: Dict[str, float] = {}  # key -> timestamp until cooldown expires
        self.load_keys()

    def load_keys(self) -> List[str]:
        loaded_keys: List[str] = []

        # 1. From backend/.env
        if os.path.exists(ENV_FILE_PATH):
            try:
                with open(ENV_FILE_PATH, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEYS=") or line.startswith("GEMINI_API_KEY="):
                            val = line.split("=", 1)[1].strip(' "\'')
                            for k in val.split(","):
                                k = k.strip()
                                if k and k not in loaded_keys:
                                    loaded_keys.append(k)
            except Exception as e:
                print(f"[KeyManager] Error reading .env: {e}")

        # 2. From environment variables
        env_keys = os.environ.get("GEMINI_API_KEYS") or os.environ.get("GEMINI_API_KEY")
        if env_keys:
            for k in env_keys.split(","):
                k = k.strip()
                if k and k not in loaded_keys:
                    loaded_keys.append(k)

        # 3. From backend/keys.json
        if os.path.exists(KEYS_FILE_PATH):
            try:
                with open(KEYS_FILE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for k in data:
                            k = str(k).strip()
                            if k and k not in loaded_keys:
                                loaded_keys.append(k)
                    elif isinstance(data, dict) and "keys" in data:
                        for k in data["keys"]:
                            k = str(k).strip()
                            if k and k not in loaded_keys:
                                loaded_keys.append(k)
            except Exception as e:
                print(f"[KeyManager] Error reading keys.json: {e}")

        self.keys = loaded_keys
        return self.keys

    def save_keys(self, new_keys: List[str]):
        clean_keys = [k.strip() for k in new_keys if k and k.strip()]
        self.keys = clean_keys
        try:
            with open(KEYS_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump({"keys": clean_keys, "updated_at": time.time()}, f, indent=2)
        except Exception as e:
            print(f"[KeyManager] Error saving keys.json: {e}")

    def add_keys(self, keys_to_add: List[str]):
        updated = list(self.keys)
        for k in keys_to_add:
            k = k.strip()
            if k and k not in updated:
                updated.append(k)
        self.save_keys(updated)

    def mark_key_exhausted(self, key: str, cooldown_seconds: float = 120.0):
        self.key_cooldowns[key] = time.time() + cooldown_seconds
        print(f"[KeyManager] Key {key[:6]}...{key[-4:]} marked on cooldown for {cooldown_seconds}s")

    def get_candidate_keys(self, client_keys: Optional[List[str]] = None) -> List[Tuple[int, str]]:
        """
        Returns list of (index, key) ordered with available keys first.
        """
        all_keys = list(self.keys)
        if client_keys:
            for ck in client_keys:
                ck = ck.strip()
                if ck and ck not in all_keys:
                    all_keys.append(ck)

        now = time.time()
        # Sort available keys before cooled down ones
        available = []
        cooling = []

        for idx, k in enumerate(all_keys):
            cooldown_until = self.key_cooldowns.get(k, 0)
            if cooldown_until <= now:
                available.append((idx, k))
            else:
                cooling.append((idx, k))

        return available + cooling

    def get_status(self) -> Dict[str, Any]:
        now = time.time()
        masked_keys = []
        for idx, k in enumerate(self.keys):
            cooldown = self.key_cooldowns.get(k, 0)
            is_cooling = cooldown > now
            masked = f"{k[:6]}...{k[-4:]}" if len(k) > 10 else "***"
            masked_keys.append({
                "index": idx,
                "masked": masked,
                "status": "cooling_down" if is_cooling else "ready",
                "cooldown_remaining_sec": max(0, int(cooldown - now)) if is_cooling else 0,
            })

        return {
            "total_keys": len(self.keys),
            "keys": masked_keys,
            "has_keys": len(self.keys) > 0,
        }


# Global KeyManager instance
key_manager = KeyManager()


# ── System Prompt & Component Capability Manual ───────────────
CIRCUIT_SYSTEM_PROMPT = """
You are an expert Electronic Circuit Design Assistant & Synthesis Engine for VirtualLab-HIL.
Given a user prompt describing a circuit, output a strictly valid JSON specification matching the exact schema below.

### AVAILABLE COMPONENT KINDS AND THEIR PINS:

1. DIGITAL LOGIC GATES:
   - "gate_and", "gate_or", "gate_nand", "gate_nor", "gate_xor", "gate_xnor"
     Pins: ["in1", "in2", "out"] (for 2-input) or ["in1", "in2", ..., "inN", "out"] with params: {"numInputs": N}
   - "gate_not", "gate_buffer"
     Pins: ["in", "out"]
   - "gate_tristate"
     Pins: ["in", "en", "out"]

2. DIGITAL SOURCES & I/O (Self-powered floating digital elements):
   - "clock_source"
     Pins: ["out"]
     Params: {"pulsePeriod": 0.1, "dutyCycle": 50} (pulsePeriod in seconds: e.g. 0.1 for 10Hz, 0.001 for 1kHz)
   - "digital_input"
     Pins: ["out"]
     Params: {"logicState": 0 or 1, "isTruthTableInput": true, "truthTableLabel": "A"}
   - "digital_output"
     Pins: ["in"]
     Params: {"isTruthTableOutput": true, "truthTableLabel": "Y"}

3. SEQUENTIAL DIGITAL LOGIC & FLIP-FLOPS:
   - "ff_d" (D Flip-Flop)
     Pins: ["CLK", "D", "CLR", "Q", "Qbar"]
     Params: {"triggerType": "rising_edge" | "falling_edge"}
   - "ff_t" (T Flip-Flop)
     Pins: ["CLK", "T", "CLR", "Q", "Qbar"]
   - "ff_jk" (JK Flip-Flop)
     Pins: ["CLK", "J", "K", "CLR", "Q", "Qbar"]
   - "ff_sr" (SR Flip-Flop)
     Pins: ["CLK", "S", "R", "CLR", "Q", "Qbar"]
   - "latch_d" (D Latch)
     Pins: ["D", "EN", "Q", "Qbar"]
   - "latch_sr" (SR Latch)
     Pins: ["S", "R", "Q", "Qbar"]
   - "latch_jk" (JK Latch)
     Pins: ["J", "K", "Q", "Qbar"]
   - "counter_4bit" (4-bit binary counter)
     Pins: ["CLK", "CLR", "Q0", "Q1", "Q2", "Q3"]
   - "decoder_2to4" (2-to-4 decoder)
     Pins: ["A0", "A1", "Y0", "Y1", "Y2", "Y3"]

4. PASSIVE COMPONENTS:
   - "resistor"
     Pins: ["p", "n"]
     Params: {"resistance": 1000} (in Ohms)
   - "capacitor"
     Pins: ["p", "n"]
     Params: {"capacitance": 0.000001} (in Farads)
   - "inductor"
     Pins: ["p", "n"]
     Params: {"inductance": 0.01} (in Henries)
   - "potentiometer"
     Pins: ["1", "2", "wiper"]
     Params: {"resistance": 10000, "wiperPos": 50}
   - "switch" (SPST Toggle Switch)
     Pins: ["p", "n"]
   - "pushbutton" (Momentary Push Button)
     Pins: ["p", "n"]

5. SEMICONDUCTORS & TRANSISTORS:
   - "bjt_npn" (NPN BJT Transistor)
     Pins: ["base", "collector", "emitter"]
     Params: {"beta": 100}
   - "bjt_pnp" (PNP BJT Transistor)
     Pins: ["base", "collector", "emitter"]
     Params: {"beta": 100}
   - "mosfet_n_enh" (N-Channel Enhancement MOSFET)
     Pins: ["gate", "drain", "source"]
     Params: {"vth": 2.0, "kn": 0.002}
   - "mosfet_p_enh" (P-Channel Enhancement MOSFET)
     Pins: ["gate", "drain", "source"]
     Params: {"vth": -2.0, "kn": 0.002}
   - "diode"
     Pins: ["p", "n"] (p=Anode, n=Cathode)
   - "zener"
     Pins: ["p", "n"] (p=Anode, n=Cathode)
     Params: {"zenerVoltage": 5.1}
   - "led"
     Pins: ["p", "n"] (p=Anode, n=Cathode)
     Params: {"color": "#22c55e" | "#ef4444" | "#3b82f6" | "#eab308" | "#a855f7" | "#06b6d4" | "#f8fafc"}

6. ANALOG OP-AMPS & ICs:
   - "opamp"
     Pins: ["inp", "inn", "out", "vcc", "vee"] (inp=Non-Inv(+), inn=Inv(-), out=Output, vcc=Positive Rail, vee=Negative Rail)
     Params: {"openLoopGain": 100000, "vcc": 15, "vee": -15}
   - "ic555" (NE555 Timer IC)
     Pins: ["gnd", "trig", "out", "rst", "ctrl", "thres", "disch", "vcc"]

7. POWER SOURCES & REFERENCES:
   - "ground" (Zero Volt Reference - CRITICAL FOR ALL ANALOG CIRCUITS)
     Pins: ["p"]
   - "dc_voltage" (DC Power Supply)
     Pins: ["p", "n"] (p=Positive V+, n=GND)
     Params: {"voltage": 10}
   - "ac_voltage" (AC Signal Source)
     Pins: ["p", "n"] (p=SIG, n=GND)
     Params: {"voltage": 1.0, "frequency": 1000}
   - "signal_generator"
     Pins: ["out", "gnd"]
     Params: {"waveform": "sine" | "square" | "triangle", "frequency": 1000, "amplitude": 1.0}
   - "rail_vcc" (Positive Power Rail)
     Pins: ["vcc"]
     Params: {"voltage": 5}
   - "rail_vee" (Negative Power Rail)
     Pins: ["vee"]
     Params: {"voltage": -5}

8. INSTRUMENTS & METERS:
   - "oscilloscope"
     Pins: ["p", "n"] (p=PROBE, n=GND)
   - "voltmeter"
     Pins: ["p", "n"]
   - "ammeter"
     Pins: ["p", "n"]

### CRITICAL WIRING & TOPOLOGY RULES:
1. ALWAYS provide a 100% COMPLETE, CLOSED-LOOP, FULLY-WIRED circuit topology.
2. In electronic circuits (amplifiers, filters, rectifiers, oscillators):
   - Every passive terminal ("p" and "n") must be wired.
   - For a BJT Common Emitter Amplifier:
     - DC Supply V+ ("p") connects to top of bias resistor R1 ("p") and collector resistor RC ("p").
     - DC Supply GND ("n") connects to Ground ("p").
     - AC Source / Signal Gen ("out" or "p") connects to input capacitor Cin ("p").
     - AC Source GND connects to Ground ("p").
     - Cin ("n") connects to BJT base ("base"), R1 ("n"), and R2 ("p").
     - R2 ("n") connects to Ground ("p").
     - RC ("n") connects to BJT collector ("collector") and output capacitor Cout ("p").
     - BJT emitter ("emitter") connects to emitter resistor RE ("p") and bypass capacitor CE ("p").
     - RE ("n") and CE ("n") connect to Ground ("p").
     - Cout ("n") connects to Oscilloscope Probe ("p").
     - Oscilloscope GND ("n") connects to Ground ("p").
3. For digital circuits:
   - Clock Source ("out") connects to all Flip-Flop "CLK" inputs.
   - For an N-bit Ring Counter: FF[i].Q connects to FF[i+1].D and Probe[i].in; last FF[N-1].Q connects back to FF[0].D.
4. Connections format:
   - "connections": [{"from": "comp_id:pin_id", "to": "comp_id:pin_id"}, ...]

### FEW-SHOT REFERENCE EXAMPLES:

Example 1: BJT Common Emitter Amplifier
{
  "title": "BJT Common Emitter Small Signal Amplifier",
  "description": "Voltage divider biased NPN amplifier with AC coupling and emitter degeneration bypass.",
  "components": [
    { "id": "vcc", "kind": "dc_voltage", "label": "VCC (10V)", "params": { "voltage": 10 } },
    { "id": "gnd", "kind": "ground", "label": "GND" },
    { "id": "sig", "kind": "ac_voltage", "label": "Vin (1kHz)", "params": { "voltage": 0.05, "frequency": 1000 } },
    { "id": "cin", "kind": "capacitor", "label": "Cin (10uF)", "params": { "capacitance": 0.00001 } },
    { "id": "r1", "kind": "resistor", "label": "R1 (10k)", "params": { "resistance": 10000 } },
    { "id": "r2", "kind": "resistor", "label": "R2 (2.2k)", "params": { "resistance": 2200 } },
    { "id": "rc", "kind": "resistor", "label": "RC (1k)", "params": { "resistance": 1000 } },
    { "id": "re", "kind": "resistor", "label": "RE (470R)", "params": { "resistance": 470 } },
    { "id": "ce", "kind": "capacitor", "label": "CE (100uF)", "params": { "capacitance": 0.0001 } },
    { "id": "q1", "kind": "bjt_npn", "label": "NPN BJT", "params": { "beta": 100 } },
    { "id": "cout", "kind": "capacitor", "label": "Cout (10uF)", "params": { "capacitance": 0.00001 } },
    { "id": "scope", "kind": "oscilloscope", "label": "Vout Scope" }
  ],
  "connections": [
    { "from": "vcc:p", "to": "r1:p" },
    { "from": "vcc:p", "to": "rc:p" },
    { "from": "vcc:n", "to": "gnd:p" },
    { "from": "sig:n", "to": "gnd:p" },
    { "from": "sig:p", "to": "cin:p" },
    { "from": "cin:n", "to": "q1:base" },
    { "from": "r1:n", "to": "q1:base" },
    { "from": "r2:p", "to": "q1:base" },
    { "from": "r2:n", "to": "gnd:p" },
    { "from": "rc:n", "to": "q1:collector" },
    { "from": "q1:collector", "to": "cout:p" },
    { "from": "q1:emitter", "to": "re:p" },
    { "from": "q1:emitter", "to": "ce:p" },
    { "from": "re:n", "to": "gnd:p" },
    { "from": "ce:n", "to": "gnd:p" },
    { "from": "cout:n", "to": "scope:p" },
    { "from": "scope:n", "to": "gnd:p" }
  ]
}

### REQUIRED JSON SCHEMA:
{
  "title": "Title of Circuit",
  "description": "Short explanation",
  "components": [
    { "id": "string", "kind": "string", "label": "string", "params": { ... } }
  ],
  "connections": [
    { "from": "id:pin", "to": "id:pin" }
  ]
}
"""


def call_gemini_api(
    api_key: str,
    prompt: str,
    model: str = "gemini-2.0-flash",
) -> Dict[str, Any]:
    """
    Direct HTTP call to Gemini REST API with JSON response format.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"{CIRCUIT_SYSTEM_PROMPT}\n\nUSER REQUEST: {prompt}\n\nPlease generate the complete circuit JSON now:"
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        }
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        resp_body = response.read().decode("utf-8")
        parsed = json.loads(resp_body)
        
        # Extract candidate text
        candidates = parsed.get("candidates", [])
        if not candidates:
            raise ValueError("Gemini returned no candidates.")
        
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise ValueError("Gemini returned empty parts.")
        
        raw_text = parts[0].get("text", "")
        # Clean any accidental markdown wrap
        cleaned = raw_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        
        circuit_json = json.loads(cleaned.strip())
        return circuit_json


def generate_circuit_with_failover(
    prompt: str,
    model: str = "gemini-3.6-flash",
    client_keys: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Attempts generation across the key pool with automatic failover on rate limit/exhaustion
    and automatic model fallback if a specific model version is deprecated.
    """
    candidates = key_manager.get_candidate_keys(client_keys)
    if not candidates:
        raise ValueError(
            "No Gemini API keys found. Please configure API keys in backend/.env, "
            "backend/keys.json, or directly in the UI modal."
        )

    # Models to try in order if requested model returns 404
    fallback_models = [model]
    for alt in ["gemini-3.6-flash", "gemini-1.5-flash", "gemini-2.5-flash", "gemini-1.5-pro"]:
        if alt not in fallback_models:
            fallback_models.append(alt)

    last_error: Optional[Exception] = None
    attempts = 0

    for current_model in fallback_models:
        model_failed_with_404 = False

        for key_idx, api_key in candidates:
            attempts += 1
            masked = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "***"
            print(f"[AIGenerator] Attempt {attempts}: Trying key #{key_idx} ({masked}) with model '{current_model}'")

            try:
                circuit_data = call_gemini_api(api_key, prompt, current_model)
                print(f"[AIGenerator] Successfully generated circuit with key #{key_idx} on '{current_model}'!")
                
                return {
                    "success": True,
                    "circuit": circuit_data,
                    "model_used": current_model,
                    "key_index_used": key_idx,
                    "total_attempts": attempts,
                    "failover_occurred": attempts > 1,
                }

            except urllib.error.HTTPError as e:
                last_error = e
                status_code = e.code
                err_msg = e.read().decode("utf-8", errors="ignore")
                print(f"[AIGenerator] HTTP {status_code} on key #{key_idx} ({current_model}): {err_msg}")

                # 404: Model not found or deprecated
                if status_code == 404:
                    print(f"[AIGenerator] Model '{current_model}' not available (404). Falling back to next model...")
                    model_failed_with_404 = True
                    break

                # 429 Too Many Requests, 403 Forbidden/Quota, 503 Overloaded
                if status_code in (429, 403, 503) or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
                    key_manager.mark_key_exhausted(api_key, cooldown_seconds=180.0)
                    print(f"[AIGenerator] Key #{key_idx} quota exhausted / rate limited. Rotating to next key in pool...")
                    continue
                else:
                    continue

            except Exception as e:
                last_error = e
                print(f"[AIGenerator] Error on key #{key_idx}: {e}. Retrying next key...")
                continue

        if not model_failed_with_404:
            break

    raise RuntimeError(
        f"All {attempts} attempts across Gemini API keys and model fallbacks failed. Last error: {last_error}"
    )
