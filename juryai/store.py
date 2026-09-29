"""store.py - Audit-Trail Persistence.

Persists CasePackets and the full NDJSON event trail so any trial can be
retrieved and replayed. Uses MongoDB (``MONGO_URL`` + ``DB_NAME``) when
configured; otherwise falls back to an in-memory store so the package remains
runnable with zero infrastructure. No LLM or opinion logic lives here.
"""

from __future__ import annotations

import os
from typing import Any

SUMMARY_FIELDS: tuple[str, ...] = (
    "trial_id",
    "case_id",
    "subject_token",
    "status",
    "residual_risk_level",
    "aggregated_risk_flags",
    "compiled_at",
    "human_decision",
)


def _summarize(packet: dict[str, Any]) -> dict[str, Any]:
    return {k: packet.get(k) for k in SUMMARY_FIELDS}


class InMemoryCaseStore:
    """Process-local store (default when MONGO_URL is not set)."""

    def __init__(self) -> None:
        self._packets: dict[str, dict[str, Any]] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}

    async def save_event(self, trial_id: str, event: dict[str, Any]) -> None:
        self._events.setdefault(trial_id, []).append(dict(event))

    async def save_packet(self, packet: dict[str, Any]) -> None:
        self._packets[packet["trial_id"]] = dict(packet)

    async def get_packet(self, trial_id: str) -> dict[str, Any] | None:
        packet = self._packets.get(trial_id)
        return dict(packet) if packet else None

    async def list_packets(self, limit: int = 50) -> list[dict[str, Any]]:
        ordered = sorted(self._packets.values(), key=lambda p: p.get("compiled_at", ""), reverse=True)
        return [_summarize(p) for p in ordered[:limit]]

    async def get_events(self, trial_id: str) -> list[dict[str, Any]]:
        return sorted(self._events.get(trial_id, []), key=lambda e: e.get("seq", 0))


class MongoCaseStore:
    """MongoDB-backed store keyed by ``trial_id`` (never exposes ObjectId)."""

    def __init__(self, mongo_url: str, db_name: str) -> None:
        from motor.motor_asyncio import AsyncIOMotorClient

        self._client = AsyncIOMotorClient(mongo_url)
        database = self._client[db_name]
        self._packets = database["juryai_case_packets"]
        self._events = database["juryai_audit_events"]

    async def save_event(self, trial_id: str, event: dict[str, Any]) -> None:
        await self._events.insert_one({**event, "trial_id": trial_id})

    async def save_packet(self, packet: dict[str, Any]) -> None:
        await self._packets.replace_one({"trial_id": packet["trial_id"]}, dict(packet), upsert=True)

    async def get_packet(self, trial_id: str) -> dict[str, Any] | None:
        return await self._packets.find_one({"trial_id": trial_id}, {"_id": 0})

    async def list_packets(self, limit: int = 50) -> list[dict[str, Any]]:
        projection = {"_id": 0, **{k: 1 for k in SUMMARY_FIELDS}}
        cursor = self._packets.find({}, projection).sort("compiled_at", -1).limit(limit)
        return [_summarize(p) async for p in cursor]

    async def get_events(self, trial_id: str) -> list[dict[str, Any]]:
        cursor = self._events.find({"trial_id": trial_id}, {"_id": 0, "trial_id": 0}).sort("seq", 1)
        return await cursor.to_list(length=10_000)


_store: InMemoryCaseStore | MongoCaseStore | None = None


def get_store() -> InMemoryCaseStore | MongoCaseStore:
    """Lazily build the configured store (Mongo if MONGO_URL is set, else memory)."""
    global _store
    if _store is None:
        mongo_url = os.getenv("MONGO_URL")
        _store = MongoCaseStore(mongo_url, os.environ["DB_NAME"]) if mongo_url else InMemoryCaseStore()
    return _store
