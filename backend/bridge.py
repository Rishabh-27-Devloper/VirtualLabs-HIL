"""
VirtualLab-HIL — WebSocket Telemetry Bridge Router
"""

import json
from typing import Dict, Set, Optional
from fastapi import WebSocket


class TelemetryBridge:
    def __init__(self):
        # Maps device_id -> set of active UI client WebSockets
        self.ui_subscribers: Dict[str, Set[WebSocket]] = {}
        # Maps device_id -> ESP32 hardware WebSocket
        self.esp32_devices: Dict[str, WebSocket] = {}
        # Set of all active ESP32 WebSockets
        self.active_esp32_sockets: Set[WebSocket] = set()

    async def register_ui_client(self, websocket: WebSocket, device_id: str):
        if device_id not in self.ui_subscribers:
            self.ui_subscribers[device_id] = set()
        self.ui_subscribers[device_id].add(websocket)

    def unregister_ui_client(self, websocket: WebSocket):
        for dev_id in list(self.ui_subscribers.keys()):
            self.ui_subscribers[dev_id].discard(websocket)
            if not self.ui_subscribers[dev_id]:
                del self.ui_subscribers[dev_id]

    async def broadcast_device_status(self, device_id: str, connected: bool):
        payload = json.dumps({
            "type": "device_status",
            "device_id": device_id,
            "connected": connected,
            "active_devices": list(self.esp32_devices.keys())
        })
        all_ui = set()
        for subs in self.ui_subscribers.values():
            all_ui.update(subs)
        for ws in list(all_ui):
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def register_esp32_device(self, websocket: WebSocket, device_id: str = "esp32_lab_01"):
        is_new = device_id not in self.esp32_devices or self.esp32_devices[device_id] != websocket
        self.esp32_devices[device_id] = websocket
        self.active_esp32_sockets.add(websocket)
        if is_new:
            await self.broadcast_device_status(device_id, True)

    async def unregister_esp32_device(self, websocket: Optional[WebSocket] = None, device_id: Optional[str] = None):
        removed_devices = []
        if websocket:
            self.active_esp32_sockets.discard(websocket)
            for dev_id, ws in list(self.esp32_devices.items()):
                if ws == websocket:
                    del self.esp32_devices[dev_id]
                    removed_devices.append(dev_id)
        if device_id and device_id in self.esp32_devices:
            ws = self.esp32_devices.pop(device_id)
            self.active_esp32_sockets.discard(ws)
            if device_id not in removed_devices:
                removed_devices.append(device_id)
        
        for dev_id in removed_devices:
            await self.broadcast_device_status(dev_id, False)

    async def route_ingress_to_ui(self, packet: dict, websocket: Optional[WebSocket] = None):
        """
        Routes an Ingress packet received from ESP32:
        {
          "device_id": "esp32_lab_01",
          "timestamp_ms": 104230,
          "inputs": { "A0": 1.652, "A1": 3.298, "D0": 1, "D1": 0 }
        }
        directly in-memory to all subscribed UI browser clients without database disk I/O.
        """
        device_id = packet.get("device_id", "esp32_lab_01")
        if websocket and (device_id not in self.esp32_devices or self.esp32_devices[device_id] != websocket):
            self.esp32_devices[device_id] = websocket
            self.active_esp32_sockets.add(websocket)
            await self.broadcast_device_status(device_id, True)

        subscribers = self.ui_subscribers.get(device_id, set())

        # If no subscribers for specific device_id, broadcast to all active UI subscribers
        if not subscribers and self.ui_subscribers:
            for subs in self.ui_subscribers.values():
                subscribers.update(subs)

        payload = json.dumps(packet)
        for ws in list(subscribers):
            try:
                await ws.send_text(payload)
            except Exception:
                subscribers.discard(ws)

    async def route_egress_to_esp32(self, packet: dict):
        """
        Routes an Egress packet received from UI Canvas:
        {
          "device_id": "esp32_lab_01",
          "timestamp_ms": 104232,
          "outputs": { "DAC0": 2.14, "PWM0": 128, "D2": 1 }
        }
        directly in-memory to the connected physical ESP32.
        """
        device_id = packet.get("device_id", "esp32_lab_01")
        esp_ws = self.esp32_devices.get(device_id)

        # Fallback to first connected ESP32 device if device_id mismatch
        if not esp_ws and self.active_esp32_sockets:
            esp_ws = next(iter(self.active_esp32_sockets))

        if esp_ws:
            try:
                payload = json.dumps(packet)
                await esp_ws.send_text(payload)
                outputs = packet.get("outputs", {})
                print(f"[HIL Bridge] Egress -> ESP32 ({device_id}): {outputs}")
            except Exception as e:
                print(f"[HIL Bridge] Failed to send Egress to ESP32: {e}")
                await self.unregister_esp32_device(websocket=esp_ws)
        else:
            outputs = packet.get("outputs", {})
            print(f"[HIL Bridge] Egress received from UI ({outputs}), but no ESP32 hardware is registered (active sockets: {len(self.active_esp32_sockets)}).")


bridge = TelemetryBridge()
