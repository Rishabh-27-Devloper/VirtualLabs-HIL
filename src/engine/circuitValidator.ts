// ============================================================
// VirtualLab-HIL — Circuit Logic & Electrical Rules Checker (ERC)
// ============================================================

import type { Netlist, ComponentInstance } from '@/types/circuit';
import { COMPONENT_REGISTRY } from '@/components/canvas/componentDefs';

export interface CircuitDiagnosticError {
  title: string;
  message: string;
  details: string[];
  severity: 'error' | 'warning' | 'info';
  affectedComponentId?: string;
}

export function validateCircuitTopology(netlist: Netlist): CircuitDiagnosticError | null {
  const compList = Object.values(netlist.components);

  // 1. Check if canvas is empty
  if (compList.length === 0) {
    return {
      title: 'Empty Circuit Canvas',
      message: 'No components have been placed on the canvas.',
      details: ['Drag parts from the left sidebar palette or load a preset circuit to begin.'],
      severity: 'warning',
    };
  }

  // 2. Check for missing wires
  if (netlist.wires.length === 0 && compList.length > 1) {
    return {
      title: 'No Wire Connections Detected',
      message: 'Components are placed on the canvas but are not connected together.',
      details: ['Click and drag between terminal pins to connect wires and form closed loops.'],
      severity: 'error',
    };
  }

  // 3. Check for Ground (0V) reference (required for analog circuits, optional for pure digital/HIL circuits)
  const isPureDigital = compList.every(
    (c) =>
      c.kind === 'ground' ||
      c.kind === 'digital_input' ||
      c.kind === 'digital_output' ||
      c.kind === 'clock_source' ||
      c.kind.startsWith('gate_') ||
      c.kind.startsWith('latch_') ||
      c.kind.startsWith('ff_') ||
      c.kind === 'counter_4bit' ||
      c.kind === 'decoder_2to4' ||
      c.kind === 'logic_analyzer' ||
      c.kind === 'oscilloscope' ||
      c.kind === 'hil_ingress' ||
      c.kind === 'hil_egress' ||
      c.kind === 'adc' ||
      c.kind === 'dac' ||
      c.kind === 'switch' ||
      c.kind === 'pushbutton' ||
      c.kind === 'led',
  );

  const hasGround = compList.some((c) => c.kind === 'ground');
  if (!hasGround && !isPureDigital) {
    return {
      title: 'Missing Ground (0V) Reference',
      message: 'The analog circuit does not contain a Ground component.',
      details: [
        'Modified Nodal Analysis (MNA) requires a 0V reference potential to solve analog node voltages.',
        'Place a Ground (0V) component from the Passives palette and connect it to your circuit.',
      ],
      severity: 'error',
    };
  }

  // 4. Check for open / floating pins on analog components
  for (const comp of compList) {
    // Digital, HIL, converter, and probe components have internal pull-downs or self-referencing
    const isDigitalOrInstrument =
      comp.kind === 'ground' ||
      comp.kind === 'digital_input' ||
      comp.kind === 'digital_output' ||
      comp.kind === 'clock_source' ||
      comp.kind.startsWith('gate_') ||
      comp.kind.startsWith('latch_') ||
      comp.kind.startsWith('ff_') ||
      comp.kind === 'counter_4bit' ||
      comp.kind === 'decoder_2to4' ||
      comp.kind === 'logic_analyzer' ||
      comp.kind === 'oscilloscope' ||
      comp.kind === 'hil_ingress' ||
      comp.kind === 'hil_egress' ||
      comp.kind === 'adc' ||
      comp.kind === 'dac' ||
      comp.kind === 'switch' ||
      comp.kind === 'pushbutton' ||
      comp.kind === 'led' ||
      comp.kind === 'voltmeter' ||
      comp.kind === 'ammeter' ||
      comp.kind === 'multimeter';

    if (isDigitalOrInstrument) continue;

    const meta = COMPONENT_REGISTRY[comp.kind];
    if (!meta) continue;

    // Check each required pin of the analog component
    for (const pin of meta.pins) {
      const isConnected = netlist.wires.some(
        (w) =>
          (w.sourceComponentId === comp.id && w.sourcePinId === pin.id) ||
          (w.targetComponentId === comp.id && w.targetPinId === pin.id),
      );

      if (!isConnected) {
        return {
          title: `Open / Floating Terminal: ${comp.label}`,
          message: `Pin "${pin.label}" on [${comp.label}] is disconnected.`,
          details: [
            `Component ID: ${comp.id}`,
            `Disconnected Terminal: ${pin.label} (${pin.id})`,
            'Electrical current cannot flow through an open circuit terminal.',
            'Connect this pin to another component or to Ground.',
          ],
          severity: 'error',
          affectedComponentId: comp.id,
        };
      }
    }
  }

  // 5. Check for shorted independent voltage sources (V+ directly tied to GND on same source)
  for (const comp of compList) {
    if (comp.kind === 'dc_voltage' || comp.kind === 'ac_voltage') {
      const pWire = netlist.wires.find((w) => (w.sourceComponentId === comp.id && w.sourcePinId === 'p') || (w.targetComponentId === comp.id && w.targetPinId === 'p'));
      const nWire = netlist.wires.find((w) => (w.sourceComponentId === comp.id && w.sourcePinId === 'n') || (w.targetComponentId === comp.id && w.targetPinId === 'n'));

      if (pWire && nWire && pWire.netNodeId === nWire.netNodeId) {
        return {
          title: `Short Circuit on Voltage Source: ${comp.label}`,
          message: `The positive (SIG/V+) and negative (GND) terminals of [${comp.label}] are directly shorted together.`,
          details: [
            'A zero-impedance voltage loop produces infinite current in SPICE simulation.',
            'Delete the shorting wire or place a load resistor between the terminals.',
          ],
          severity: 'error',
          affectedComponentId: comp.id,
        };
      }
    }
  }

  return null;
}
