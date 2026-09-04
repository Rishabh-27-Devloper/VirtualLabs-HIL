# Changelog

All notable changes to **VirtualLab-HIL** are documented in this file.
The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-09-05

### Added
- **Textbook-Feel Live Component Readouts & Operating Modes**:
  - Live, physical engineering readouts rendered directly on all canvas component cards during simulation execution.
  - **BJTs (NPN & PNP)**:
    - Real-time voltage displays: $V_{be}, V_{ce}$ (or $V_{eb}, V_{ec}$ for PNP) with auto-scaling (mV / V).
    - Branch currents: $I_b, I_c, I_e$ with auto-scaling ($\text{nA} / \mu\text{A} / \text{mA} / \text{A}$).
    - Operating Mode pill indicators: `● FORWARD ACTIVE` (linear amplification), `● SATURATION (ON)` (fully turned on switch), `● CUTOFF (OFF)`, and `● REVERSE ACTIVE`.
  - **MOSFETs (N-Channel & P-Channel, Enhancement & Depletion)**:
    - Terminal voltages & overdrive: $V_{gs}, V_{ds}, V_{ov} = (V_{gs} - V_{th})$ (or $V_{sg}, V_{sd}, V_{ov}$ for P-MOS).
    - Conduction current $I_d$ and channel power dissipation $P_{diss}$.
    - Operating Mode pill indicators: `● CUTOFF (OFF)`, `● TRIODE (Linear / Ohmic)`, and `● SATURATION (Pinch-off / Active)`.
  - **Diodes & LEDs**:
    - Forward drop $V_D$, branch current $I_D$, and power dissipation $P_D$.
    - Operating Mode pill indicators: `● FORWARD (ON)`, `● REVERSE BIASED`, and `● BREAKDOWN`.
  - **Zener Diodes**:
    - Differential voltage $V_D$, reverse regulating current $I_Z$, and clamp power $P_Z$.
    - Operating Mode pill indicators: `● ZENER REGULATING` (active reverse breakdown clamping with cyan glow), `● FORWARD (ON)`, and `● REVERSE BLOCKED`.
  - **Operational Amplifiers (Op-Amps)**:
    - Differential input offset $\Delta V_{in} = (V_+ - V_-)$, output voltage $V_{out}$, output current $I_{out}$, and supply rail limits ($\pm V_{cc}/V_{ee}$).
    - Operating Mode pill indicators: `● LINEAR (V-Short)` (virtual short under negative feedback), `● +SAT (+Vcc)` (positive saturation), `● -SAT (-Vee)` (negative saturation), and `● OPEN-LOOP`.
  - **Passive Components**:
    - Resistors: $\Delta V_R, I_R, P_{diss}$.
    - Capacitors: $V_C, I_C, E_{stored}$ ($\frac{1}{2} C V^2$).
    - Inductors: $V_L, I_L, E_{stored}$ ($\frac{1}{2} L I^2$).
    - Sources: Output terminal voltage $V_{out}$ and delivered load current $I_{load}$.
- **Physically Accurate Active Device Branch Currents**:
  - Refined branch current dispatcher equations for Zener breakdown reverse conduction ($I_Z = (V_K - V_A - V_Z) / R_Z$), MOSFET triode & saturation with channel-length modulation $\lambda$, and BJT Early voltage effect ($V_A$).

---

## [1.2.0] - 2026-09-05

### Added
- **Physical Wire Current Direction with RMS Potential Gradient**:
  - Accurate wire flow animation for both AC and DC circuits evaluated using terminal RMS energy gradients ($V_{rms}$) and conventional source-to-ground physics.
  - Automatic detection of active sources, grounds, and passive device drops ($|V_{rms}(p) - V_{rms}(n)|$), ensuring current never animates backwards into power sources.
- **Primary Analog Variable Markers (Truth Table Logic)**:
  - Component variable markers (`Vi`, `Vo`, `Vcc`, `Vce`, `Ic`, `f`) displaying canvas badges `📈 [Label]`.
  - 1-click "Auto-Tag" tool that intelligently labels input sources, output loads, and transistor terminals.
- **Formulas & Derived Variables Engine**:
  - Section to manage secondary/tertiary variables ($G_v = V_o / V_i$, $A_v\text{ (dB)} = 20\log_{10}(|V_o/V_i|)$, $P = V_o \times I_o$, $P_{bjt} = V_{ce} \times I_c$).
  - Full variable scope mapping allowing marked labels to be evaluated directly in custom math formulas with `log10`, `abs`, and `sqrt`.
- **High-Frequency Parasitic Capacitance Modeling**:
  - MNA solver companion stamping for $C_{be}, C_{bc}$ (BJTs - base-emitter and base-collector Miller junctions), $C_{gs}, C_{gd}, C_{ds}$ (MOSFETs), $C_j$ (Diodes/LEDs), and $C_p$ (Resistors).
  - Configurable high-frequency parasitics in Component Inspector with picofarad (pF) inputs.
- **Bode Frequency Sweeper & uPlot Resilience**:
  - Small-signal reactive companion impedance scaling ($h = \frac{1}{2\pi f}$) and sinusoidal peak excitation for AC frequency response sweeps.
  - Guaranteed monotonically ascending X-axis sanitization preventing blank charts or uPlot crashes.

### Fixed
- **Oscilloscope Background Execution**:
  - Fixed background probe recording so sampling and circular buffer updates only run when instrument modals are open.
  - Fully halted background calculation and animation loops when paused or tripped by circuit auto-cut / error.
- **Inductor Pin Identification in MNA Solver**:
  - Fixed pin matching for inductors supporting both `p`/`n` and `1`/`2` identifiers.

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
