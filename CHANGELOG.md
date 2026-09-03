# Changelog

All notable changes to **VirtualLab-HIL** are documented in this file.
The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-09-04

### Added
- **Characteristic Curve Analyzer & X-Y Plotter**:
  - Interactive parameter sweeper powered by high-performance hardware-accelerated \uPlot\.
  - Primary variable selector: auto-extracts component currents (, I_B, I_D, I_R$), branch voltages (, V_D, V_{CE}, V_{BE}, V_{DS}$), source signals, and node potentials.
  - Secondary/derived expression builder ( = V_o/V_i$, \log_{10}(G_v)$,  = V \times I$, $\beta = I_C/I_B$).
  - One-click presets: Diode I-V Curve, Transistor Output Family ($ vs {CE}$ for multiple $), Transfer Characteristics ($ vs {BE}$), Frequency Response (Bode magnitude), and Resistive Dividers.
  - Safety & performance protections: automatic real-time simulation pause during sweeps, asynchronous chunked time-slicing via \equestAnimationFrame\, and asymptote/singularity clamping to prevent browser freezes.
  - Export plotted curves to high-resolution PNG or CSV data.
- **OhmMeter Virtual Equipment**:
  - Benchtop digital meter with automatic loop testing to measure equivalent network resistance.
  - Autoranging high-contrast LCD readout (.00\,\Omega \to \text{k}\Omega \to \text{M}\Omega \to \text{O.L.}$ for open loop).
- **Web Audio Speaker Equipment**:
  - Audio transducer with configurable voice-coil resistance (4Ω, 8Ω, 16Ω, 32Ω).
  - Real-time Web Audio API sound synthesis playing the incoming electrical waveform frequencies.
  - Interactive volume control, mute switch, soft limiting, and canvas cone pulse animation.
- **Wire-to-Wire Junctions**:
  - Dedicated \junction\ solder-dot component in the palette.
  - Automatic wire splicing when dropping or connecting a wire onto an existing wire.
- **Current-Direction-Aware Wire Flow**:
  - Real-time comparison of pin potentials ({source} - V_{target}$) to animate flow dashes in the physical direction of conventional current ({high} \to V_{low}$).
  - Solid wire rendering when branch current is zero.
- **Version Tracking & Documentation**:
  - Centralized application version constant in \src/version.ts\.
  - Comprehensive changelog tracking in \CHANGELOG.md\.

---

## [1.0.0] - 2026-08-26

### Added
- **Hardware-in-the-Loop (HIL) Integration**:
  - Real-time bidirectional WebSocket bridge connecting ESP32 microcontroller pins directly to simulated analog/digital circuits.
  - Zero-Order Sample-and-Hold (ZOH) interpolation in simulation dispatcher to prevent waveform drops across internet jitter.
  - Firmware with robust TLS handshake, buffer-pooling, and FreeRTOS task isolation.
- **Circuit Simulation Engine**:
  - Modified Nodal Analysis (MNA) solver for analog devices (BJTs, MOSFETs, OpAmps, Diodes, Zener, Passives).
  - Digital logic gate solver with propagation delay modeling.
- **Virtual Instruments**:
  - 4-Channel Oscilloscope with auto-scaling, split views, and PNG export.
  - 4-Channel Logic Analyzer Pod.
  - Function / Signal Generator.
  - Digital Multimeter.
  - Combinational Logic Truth Table Analyzer with Quine-McCluskey SOP minimization.
- **Gemini AI Circuit Synthesis**:
  - Natural-language circuit generator with automatic key rotation and netlist compiler.
  - Active circuit modification mode allowing AI to iteratively update existing circuits.
- **Mobile & Multi-Screen Responsiveness**:
  - Responsive header with slide-down action drawer.
  - Floating mobile quick-action dock (\MobileBottomBar\).
  - Slide-over component palette and inspector drawers.
  - Adaptive modal sizing for smartphones and tablets.
