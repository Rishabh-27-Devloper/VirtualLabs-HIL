# VirtualLab-HIL
### Hardware-in-the-Loop & Pure Virtual Mixed-Signal Simulator

VirtualLab-HIL is a browser-based, node-driven mixed-signal electronics simulator designed for interactive learning and hardware prototyping.

---

## ⚡ Key Features

1. **Dual Simulation Modes:**
   - **Standalone Virtual Mode:** High-precision in-browser transient simulation (60 FPS loop) supporting linear passives, semiconductors (Newton-Raphson non-linear models), and discrete digital logic families.
   - **Hardware-in-the-Loop (HIL) Mode:** Synchronizes simulation execution with live ESP32 telemetry streamed bidirectionally over WebSockets (< 35ms end-to-end latency).
2. **Interactive Node Canvas:**
   - Drag & drop component palette (Passives, Semiconductors, Digital Logic, Instruments, Controls, HIL I/O pins).
   - Orthogonal wire routing with animated current particle flows and voltage color coding.
   - Interactive on-canvas switches, pushbuttons, potentiometers, and glow-reactive LEDs.
3. **Virtual Instruments:**
   - **2-Channel Oscilloscope:** High-performance HTML5 Canvas waveform rendering with voltage/div and timebase dials.
   - **4-Channel Digital Logic Analyzer:** Step waveform timing diagrams and zoom controls.
   - **Arbitrary Function Generator:** Synthesizes Sine, Cosine, Square, Triangle, Sawtooth, and Pulse waveforms with live preview.
4. **Backend Gateway & Telemetry:**
   - Python FastAPI WebSocket bridge router.
   - SQLite Write-Ahead Logging (WAL) for persistent session netlists and downsampled time-series logging.
5. **ESP32 Firmware & Mock Hardware Simulator:**
   - Ready-to-flash FreeRTOS dual-core Arduino sketch (`firmware/VirtualLab_ESP32/VirtualLab_ESP32.ino`).
   - Mock ESP32 device script (`backend/esp32_simulator.py`) for instant testing without physical hardware.

---

## 🚀 Quick Start

### 1. Run Frontend
```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. Run Backend Gateway
```bash
# Install Python dependencies
pip install -r backend/requirements.txt

# Start FastAPI server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Run Mock ESP32 Hardware Simulator (for HIL Mode)
```bash
# Run simulator
python backend/esp32_simulator.py
```

### 4. Flash Physical ESP32
Open `firmware/VirtualLab_ESP32/VirtualLab_ESP32.ino` in Arduino IDE or PlatformIO, update your Wi-Fi credentials and gateway IP, and upload to your ESP32 board.
