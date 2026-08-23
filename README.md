# ⚡ VirtualLab-HIL — Next-Gen Mixed-Signal & Hardware-in-the-Loop Circuit Simulator

[![Frontend Deployment](https://img.shields.io/badge/Frontend-Vercel-black?style=flat&logo=vercel)](https://virtual-labs-hil.vercel.app/)
[![Backend Gateway](https://img.shields.io/badge/Backend-Render-46E3B7?style=flat&logo=render)](https://virtuallabs-hil.onrender.com/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-VirtualLabs--HIL-blue?style=flat&logo=github)](https://github.com/Rishabh-27-Devloper/VirtualLabs-HIL)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**VirtualLab-HIL** is an interactive, browser-based mixed-signal circuit simulation platform with real-time **Hardware-in-the-Loop (HIL)** capabilities. It combines physical device physics (Modified Nodal Analysis + Newton-Raphson non-linear solver) with physical ESP32 microcontrollers over high-speed WebSockets.

---

## 🌐 Live Production Deployments

| Component | Platform | Live URL / Endpoint |
|---|---|---|
| **Web Canvas App** | **Vercel** | [https://virtual-labs-hil.vercel.app/](https://virtual-labs-hil.vercel.app/) |
| **FastAPI Backend Gateway** | **Render** | [https://virtuallabs-hil.onrender.com/](https://virtuallabs-hil.onrender.com/) |
| **Backend Health Check** | **Render** | [https://virtuallabs-hil.onrender.com/api/health](https://virtuallabs-hil.onrender.com/api/health) |
| **API Documentation (Swagger)**| **Render** | [https://virtuallabs-hil.onrender.com/docs](https://virtuallabs-hil.onrender.com/docs) |
| **UI Telemetry Channel** | **WebSockets** | `wss://virtuallabs-hil.onrender.com/ws/ui` |
| **ESP32 Telemetry Channel** | **WebSockets (TLS)** | `wss://virtuallabs-hil.onrender.com/ws/esp32` *(Port 443)* |

---

## 🚀 Key Feature Highlights

### 1. 🎛️ High-Precision Dual-Domain Simulation Engine
- **Analog Domain (MNA Solver)**: Modified Nodal Analysis with Trapezoidal integration companion models for capacitors and inductors, Newton-Raphson linearization for non-linear components (Shockley diodes, Zener diodes, Early-effect BJTs, sub-threshold & saturation MOSFETs, transconductance OpAmps).
- **Digital Domain (Logic Engine)**: 3-state logic solver (`0`, `1`, `X`, `Z`) with configurable propagation delays, CMOS thresholds ($V_{IL}, V_{IH}, V_{OL}, V_{OH}$), discrete logic gates, D-Latches, and SR flip-flops.
- **Mixed-Signal Interfacing**: Integrated configurable ADC (Analog-to-Digital) and DAC (Digital-to-Analog) converter components with customizable bit resolution ($1\text{--}16\text{ bits}$) and dynamic voltage rails.

### 2. 🔌 True Hardware-in-the-Loop (HIL) Streaming
- **Zero-Order Sample-and-Hold (ZOH)**: Latching continuous voltage hold across all 16 sub-steps at 60 FPS ($960\text{ solver evaluations/sec}$), eliminating jitter gaps, broken steps, and network packet drop artifacts.
- **Strict Hardware Connection Protocol**: Real-time verification of active physical ESP32 devices; automatically falls back to Virtual mode with diagnostics if hardware disconnects.
- **Bi-directional Bridge**: Streams physical ADC/GPIO sensor readings into canvas Ingress pins and transmits canvas circuit outputs back to ESP32 DAC/PWM pins with $<35\text{ ms}$ latency.

### 3. 📡 Web-Configurable ESP32 Firmware (No Re-flashing Required)
- **Captive Portal & Web Dashboard**: Onboard Non-Volatile Storage (`Preferences.h`) + HTTP Web Server (`WebServer.h`) + DNSServer.
- **Auto AP Mode**: Automatically launches Access Point `VirtualLab-ESP32-Setup` at `192.168.4.1` if Wi-Fi credentials fail.
- **STA Dashboard**: Modify Wi-Fi SSID/password, gateway host, port, device ID, and stream rate on the fly at `http://<esp32-ip>/`.
- **FreeRTOS Dual-Core Layout**:
  - `Core 0 (TaskNetwork)`: Wi-Fi, NTP time sync, WebServer port 80, TLS/WSS WebSocket streaming.
  - `Core 1 (TaskHardware)`: High-frequency $100\text{ Hz}$ concurrent ADC sampling and DAC/PWM actuation.

### 4. 📊 Virtual Instrumentation Suite
- **Digital Oscilloscope (2 Channels)**: High-resolution canvas rendering with dual-trace overlay, $X/Y$ mode, Time/Div dials, Volts/Div attenuators, AC/DC coupling, and auto-triggering.
- **4-Channel Logic Analyzer**: Multi-channel timing diagrams with digital logic transitions and zoom controls.
- **Arbitrary Signal Generator**: Synthesizes Sine, Cosine, Square, Triangle, Sawtooth, and Pulse waveforms.
- **Interactive Truth Table Analyzer**: Live combinational logic discovery with auto-test vector stepping.

### 5. 🤖 Gemini AI Circuit Generation Engine
- **Prompt-to-Circuit**: Generates complete interactive circuit layouts directly from natural language prompts.
- **Multi-Key Pool & Failover**: Automatic rotation across API keys with exponential backoff and rate-limit cooldown recovery.

### 6. ⚡ Performance Mode & Thermal Auto-Cut
- **⚡ Performance Mode Toggle**: Cuts sub-steps by >60% and disables expensive visual glow passes for low-CPU client execution.
- **Overload Auto-Cut**: Dynamically halts simulation and alerts the user if frame times exceed browser budget ($<15\text{ FPS}$).

---

## 🛠️ ESP32 Hardware Pinout Reference

| Port Name | ESP32 GPIO | Direction | Description |
|---|---|---|---|
| **A0** | GPIO 36 (VP) | Ingress (Input) | 12-bit ADC Input (0–3.3V) |
| **A1** | GPIO 39 (VN) | Ingress (Input) | 12-bit ADC Input (0–3.3V) |
| **A2** | GPIO 34 | Ingress (Input) | 12-bit ADC Input (0–3.3V) |
| **A3** | GPIO 35 | Ingress (Input) | 12-bit ADC Input (0–3.3V) |
| **A4** | GPIO 32 | Ingress (Input) | 12-bit ADC Input (0–3.3V) |
| **A5** | GPIO 33 | Ingress (Input) | 12-bit ADC Input (0–3.3V) |
| **D0** | GPIO 13 | Ingress (Input) | Digital GPIO (Pulldown) |
| **D1** | GPIO 14 | Ingress (Input) | Digital GPIO (Pulldown) |
| **D4** | GPIO 16 | Ingress (Input) | Digital GPIO (Pulldown) |
| **D5** | GPIO 17 | Ingress (Input) | Digital GPIO (Pulldown) |
| **D6** | GPIO 4 | Ingress (Input) | Digital GPIO (Pulldown) |
| **DAC0** | GPIO 25 | Egress (Output) | 8-bit Hardware DAC1 (0–3.3V) |
| **DAC1** | GPIO 26 | Egress (Output) | 8-bit Hardware DAC2 (0–3.3V) |
| **PWM0** | GPIO 18 | Egress (Output) | High-speed PWM Output |
| **PWM1** | GPIO 19 | Egress (Output) | High-speed PWM Output |
| **PWM2** | GPIO 21 | Egress (Output) | High-speed PWM Output |
| **PWM3** | GPIO 22 | Egress (Output) | High-speed PWM Output |
| **D2** | GPIO 2 | Egress (Output) | Built-in LED / GPIO Output |
| **D3** | GPIO 23 | Egress (Output) | GPIO Output |
| **D7** | GPIO 27 | Egress (Output) | GPIO Output |

---

## 💻 Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.0 or later
- **Python**: 3.10 or later
- **Arduino IDE**: 2.x (with ESP32 board package installed)

### 2. Frontend Setup
```bash
# Clone the repository
git clone https://github.com/Rishabh-27-Devloper/VirtualLabs-HIL.git
cd VirtualLabs-HIL

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Navigate to [http://localhost:5173](http://localhost:5173).

### 3. Backend Gateway Setup
```bash
# Install Python packages
pip install -r requirements.txt

# Run FastAPI server locally
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Flashing the ESP32
1. Open `firmware/VirtualLab_ESP32/VirtualLab_ESP32.ino` in Arduino IDE.
2. Select **ESP32 Dev Module**.
3. Upload to your board.
4. Open the web configuration portal at `http://<esp32-ip>/` or `192.168.4.1` to configure settings without editing code.

---

## 📜 Architecture Overview

```
 ┌─────────────────────────────────────────────────────────┐
 │                   Vercel Web Client                     │
 │  ┌─────────────────┐ ┌───────────────┐ ┌─────────────┐  │
 │  │ React Flow Node │ │ MNA + Digital │ │ Virtual     │  │
 │  │ Canvas & Wires  │ │ Solver (ZOH)  │ │ Instruments │  │
 │  └────────┬────────┘ └───────▲───────┘ └──────▲──────┘  │
 └───────────┼──────────────────┼────────────────┼─────────┘
             │                  │                │
             │ wss://virtuallabs-hil.onrender.com/ws/ui
             ▼                  │                │
 ┌──────────────────────────────┴────────────────┴─────────┐
 │              Render Python FastAPI Gateway              │
 │  ┌─────────────────────────┐  ┌──────────────────────┐  │
 │  │ Bi-directional Bridge   │  │ Gemini AI Generator  │  │
 │  │ WebSocket Router        │  │ with Key Pool        │  │
 │  └────────────▲────────────┘  └──────────────────────┘  │
 └───────────────┼─────────────────────────────────────────┘
                 │
                 │ wss://virtuallabs-hil.onrender.com/ws/esp32
                 ▼
 ┌─────────────────────────────────────────────────────────┐
 │                Physical ESP32 Microcontroller           │
 │  ┌─────────────────────────┐  ┌──────────────────────┐  │
 │  │ Core 0: TaskNetwork     │  │ Core 1: TaskHardware │  │
 │  │ Web Portal & TLS Stream │  │ 100Hz ADC/DAC Engine │  │
 │  └─────────────────────────┘  └──────────────────────┘  │
 └─────────────────────────────────────────────────────────┘
```

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).

