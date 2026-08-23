"""
VirtualLab-HIL — Mock ESP32 Microcontroller Simulator
Allows end-to-end HIL testing without physical hardware.
"""

import asyncio
import json
import math
import time
import websockets

DEVICE_ID = "esp32_lab_01"
GATEWAY_URL = "ws://localhost:8000/ws/esp32"
PACKET_RATE_HZ = 30  # 30 packets per second (~33ms interval)


async def run_esp32_simulator():
    print(f"Connecting ESP32 Simulator to {GATEWAY_URL} as device '{DEVICE_ID}'...")
    
    while True:
        try:
            async with websockets.connect(GATEWAY_URL) as ws:
                print("CONNECTED to VirtualLab-HIL Gateway! Streaming hardware sensor signals...")
                
                t0 = time.time()
                step = 0

                async def receiver_task():
                    """Listen for egress control packets coming from UI (DAC/PWM)."""
                    try:
                        async for msg in ws:
                            packet = json.loads(msg)
                            outputs = packet.get("outputs", {})
                            print(f"[ESP32 ACTUATOR RECEIVE] DAC/PWM Egress: {outputs}")
                    except Exception as e:
                        pass

                rx_coro = asyncio.create_task(receiver_task())

                try:
                    while True:
                        elapsed = time.time() - t0
                        now_ms = int(time.time() * 1000)

                        # Synthesize analog sensor inputs
                        # A0: 0-3.3V smooth potentiometer sweep (0.5 Hz)
                        a0_val = round(1.65 + 1.65 * math.sin(2 * math.pi * 0.5 * elapsed), 3)
                        # A1: 0-3.3V triangle wave (1 Hz)
                        a1_val = round(3.3 * abs((elapsed % 1.0) - 0.5) * 2, 3)
                        # D0: 1 Hz digital square wave
                        d0_val = 1 if (elapsed % 1.0) > 0.5 else 0
                        # D1: 2 Hz digital square wave
                        d1_val = 1 if (elapsed % 0.5) > 0.25 else 0

                        ingress_packet = {
                            "device_id": DEVICE_ID,
                            "timestamp_ms": now_ms,
                            "inputs": {
                                "A0": a0_val,
                                "A1": a1_val,
                                "D0": d0_val,
                                "D1": d1_val,
                            },
                        }

                        await ws.send(json.dumps(ingress_packet))
                        step += 1
                        if step % 30 == 0:
                            print(f"[ESP32 SENSOR STREAM] Sent pkt #{step}: A0={a0_val}V, A1={a1_val}V, D0={d0_val}")

                        await asyncio.sleep(1.0 / PACKET_RATE_HZ)

                finally:
                    rx_coro.cancel()

        except Exception as e:
            print(f"Connection lost ({e}). Retrying in 2 seconds...")
            await asyncio.sleep(2.0)


if __name__ == "__main__":
    asyncio.run(run_esp32_simulator())
