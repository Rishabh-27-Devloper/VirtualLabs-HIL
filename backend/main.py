"""
VirtualLab-HIL — FastAPI Backend Gateway
"""

import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional

from backend.database import init_db, save_session, get_session, get_telemetry_history
from backend.bridge import bridge


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database
    await init_db()
    yield
    # Shutdown


app = FastAPI(
    title="VirtualLab-HIL Gateway",
    version="1.0.0",
    description="Mixed-Signal & Hardware-in-the-Loop Gateway Server",
    lifespan=lifespan,
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def api_root():
    return {
        "status": "online",
        "service": "VirtualLab-HIL Gateway",
        "version": "2.0.0",
        "health": "/api/health",
        "docs": "/docs",
        "ws_ui": "/ws/ui",
        "ws_esp32": "/ws/esp32",
    }


# ─── WebSocket Endpoints ─────────────────────────────────────

@app.websocket("/ws/ui")
async def websocket_ui_endpoint(websocket: WebSocket):
    """
    WebSocket channel for the Frontend Canvas client.
    Receives subscriptions and egress commands; streams live ingress sensor data.
    """
    await websocket.accept()
    current_device_id: Optional[str] = None

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                message = json.loads(raw_data)
            except Exception:
                continue

            msg_type = message.get("type")

            if msg_type == "subscribe":
                current_device_id = message.get("device_id", "esp32_lab_01")
                await bridge.register_ui_client(websocket, current_device_id)
                hw_connected = (current_device_id in bridge.esp32_devices) or (len(bridge.active_esp32_sockets) > 0)
                await websocket.send_text(json.dumps({
                    "status": "subscribed",
                    "device_id": current_device_id,
                    "hardware_connected": hw_connected,
                    "active_devices": list(bridge.esp32_devices.keys()),
                }))

            elif msg_type == "egress":
                payload = message.get("payload", {})
                await bridge.route_egress_to_esp32(payload)

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[HIL Gateway] UI WebSocket connection closed: {e}")
    finally:
        bridge.unregister_ui_client(websocket)


@app.websocket("/ws/esp32")
async def websocket_esp32_endpoint(websocket: WebSocket):
    """
    WebSocket channel for the ESP32 Microcontroller (or ESP32 Hardware Simulator).
    Receives ADC/GPIO ingress telemetry; streams DAC/PWM egress commands.
    """
    await websocket.accept()
    device_id = "esp32_lab_01"
    await bridge.register_esp32_device(websocket, device_id)
    print(f"[HIL Gateway] ESP32 hardware connected on /ws/esp32 (device_id: '{device_id}')")

    try:
        while True:
            raw_packet = await websocket.receive_text()
            try:
                packet = json.loads(raw_packet)
            except Exception:
                continue
            if not isinstance(packet, dict):
                continue
            
            dev_id = packet.get("device_id", device_id)
            if dev_id != device_id:
                device_id = dev_id
                await bridge.register_esp32_device(websocket, device_id)

            if "inputs" in packet:
                await bridge.route_ingress_to_ui(packet, websocket)

    except WebSocketDisconnect:
        print(f"[HIL Gateway] ESP32 device '{device_id}' disconnected cleanly.")
    except Exception as e:
        print(f"[HIL Gateway] ESP32 device '{device_id}' error: {e}")
    finally:
        await bridge.unregister_esp32_device(websocket=websocket, device_id=device_id)


# ─── REST APIs ────────────────────────────────────────────────

class SessionSaveRequest(BaseModel):
    name: str
    netlist: Dict[str, Any]


@app.post("/api/sessions/{session_id}")
async def api_save_session(session_id: str, body: SessionSaveRequest):
    await save_session(session_id, body.name, body.netlist)
    return {"status": "saved", "session_id": session_id}


@app.get("/api/sessions/{session_id}")
async def api_get_session(session_id: str):
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get("/api/telemetry/{session_id}")
async def api_get_telemetry(session_id: str, limit: int = 200):
    history = await get_telemetry_history(session_id, limit)
    return {"session_id": session_id, "logs": history}


@app.get("/api/health")
async def api_health():
    return {
        "status": "healthy",
        "service": "VirtualLab-HIL Gateway",
        "active_devices": list(bridge.esp32_devices.keys()),
    }


# ─── AI Circuit Generation Endpoints ─────────────────────────

from backend.ai_generator import generate_circuit_with_failover, key_manager


class AICircuitRequest(BaseModel):
    prompt: str
    model: Optional[str] = "gemini-3.6-flash"
    client_keys: Optional[list] = None


class SaveKeysRequest(BaseModel):
    keys: list


@app.post("/api/ai/generate-circuit")
async def api_generate_circuit(body: AICircuitRequest):
    """
    Generate a complete circuit specification using Gemini AI models with automatic key failover.
    """
    try:
        result = generate_circuit_with_failover(
            prompt=body.prompt,
            model=body.model or "gemini-3.6-flash",
            client_keys=body.client_keys,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/keys-status")
async def api_get_keys_status():
    """
    Get status of configured Gemini API keys (total count, active index, cooldowns).
    """
    return key_manager.get_status()


@app.post("/api/ai/save-keys")
async def api_save_keys(body: SaveKeysRequest):
    """
    Save or update API keys into backend storage (keys.json).
    """
    key_manager.save_keys(body.keys)
    return {"status": "saved", "total_keys": len(key_manager.keys)}

