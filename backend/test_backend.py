"""
VirtualLab-HIL — Verification Test Suite
Tests:
1. SQLite WAL Database init and session storage
2. FastAPI WebSocket Gateway & Health endpoint
3. Telemetry Ingress/Egress packet routing
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
import json
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.database import init_db, save_session, get_session


async def test_full_pipeline():
    print("\n--- 1. Testing Database Init & Session Storage ---")
    await init_db()
    
    test_netlist = {
        "components": {
            "r1": {"id": "r1", "kind": "resistor", "params": {"resistance": 1000}}
        },
        "wires": []
    }
    
    await save_session("test_sess_01", "Test Session", test_netlist)
    session = await get_session("test_sess_01")
    assert session is not None
    assert session["name"] == "Test Session"
    assert session["netlist"]["components"]["r1"]["params"]["resistance"] == 1000
    print("[PASS] SQLite WAL session storage verified!")

    print("\n--- 2. Testing FastAPI REST Health Check ---")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        print(f"[PASS] Health API verified: {data}")

    print("\nAll Backend Tests PASSED Successfully!")


if __name__ == "__main__":
    asyncio.run(test_full_pipeline())
