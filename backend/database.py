"""
VirtualLab-HIL — SQLite WAL Storage & Telemetry Logging
"""

import aiosqlite
import json
import os
from typing import Dict, Any, List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "virtuallab.db")


async def init_db():
    """Initializes the SQLite database with WAL mode and schema."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Enable Write-Ahead Logging (WAL) mode for low-latency concurrent writes
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA synchronous=NORMAL;")

        # Sessions Table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                name TEXT,
                netlist_json TEXT
            );
        """)

        # Telemetry Time-Series Log Table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                device_id TEXT,
                timestamp_ms INTEGER,
                direction TEXT, -- 'ingress' or 'egress'
                data_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Create Index on timestamp and session
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_telemetry_time 
            ON telemetry_logs (session_id, timestamp_ms);
        """)

        await db.commit()


async def save_session(session_id: str, name: str, netlist: Dict[str, Any]):
    """Saves or updates a simulation session netlist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO sessions (session_id, name, netlist_json)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                name=excluded.name,
                netlist_json=excluded.netlist_json;
            """,
            (session_id, name, json.dumps(netlist)),
        )
        await db.commit()


async def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a simulation session by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT session_id, name, netlist_json, created_at FROM sessions WHERE session_id = ?",
            (session_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return {
                    "session_id": row[0],
                    "name": row[1],
                    "netlist": json.loads(row[2]) if row[2] else {},
                    "created_at": row[3],
                }
    return None


async def log_telemetry(session_id: str, device_id: str, timestamp_ms: int, direction: str, data: Dict[str, Any]):
    """Appends an ingress or egress packet into the time-series log."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO telemetry_logs (session_id, device_id, timestamp_ms, direction, data_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, device_id, timestamp_ms, direction, json.dumps(data)),
        )
        await db.commit()


async def get_telemetry_history(session_id: str, limit: int = 500) -> List[Dict[str, Any]]:
    """Retrieves recent downsampled telemetry logs."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT device_id, timestamp_ms, direction, data_json, created_at
            FROM telemetry_logs
            WHERE session_id = ?
            ORDER BY timestamp_ms DESC
            LIMIT ?
            """,
            (session_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                {
                    "device_id": r[0],
                    "timestamp_ms": r[1],
                    "direction": r[2],
                    "data": json.loads(r[3]),
                    "created_at": r[4],
                }
                for r in rows
            ]
