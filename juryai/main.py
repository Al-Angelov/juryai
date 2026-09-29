"""main.py - FastAPI REST Service & Audit Event Stream.

Exposes the JuryAI decision-assurance trial as a standalone FastAPI service.
The primary endpoint runs the full sovereign pipeline and streams typed audit
events as NDJSON (``application/x-ndjson``) for a complete, replayable trail.
Every event and the final CasePacket are persisted (store.py) so trials can be
listed, retrieved, replayed and closed by a human reviewer.

Pipeline (POST /api/v1/trials/run):
    1. Ingest raw case input.
    2. apply_identity_firewall()            (middleware.py - zero-trust gate)
    3. Isolated async witness pipeline      (agents.py - compartmentalized)
    4. evaluate_counterfactual_sensitivity()(middleware.py - deterministic)
    5. Bias/Privacy challenger inspects the counterfactual result.
    6. CourtClerk compiles the CasePacket   (clerk.py - deterministic)
    7. Enforce mandatory human handoff:      status = "awaiting_human".
    8. Human records the final decision:     POST /trials/{trial_id}/decision.

Runs standalone via ``uvicorn juryai.main:app`` and is also mountable into a
host application by importing ``router``.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from . import agents
from .agents import (
    AgentFinding,
    BiasPrivacyChallengerAgent,
    build_isolated_witness_agents,
)
from .clerk import AWAITING_HUMAN, HUMAN_DECIDED, CasePacket, CourtClerk, HumanDecision
from .middleware import (
    apply_identity_firewall,
    evaluate_counterfactual_sensitivity,
)
from .store import get_store

# ---------------------------------------------------------------------------
# Request/response models.
# ---------------------------------------------------------------------------


class TrialRunRequest(BaseModel):
    """Raw case input ingested by the trial endpoint (contains PII)."""

    case_id: str = Field(..., description="Client-supplied case identifier.")
    applicant: dict[str, Any] = Field(default_factory=dict)
    financials: dict[str, Any] = Field(default_factory=dict)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    claims: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TrialEvent(BaseModel):
    """A single typed audit event emitted on the NDJSON stream."""

    seq: int
    type: str
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    data: dict[str, Any] = Field(default_factory=dict)


class HumanDecisionRequest(BaseModel):
    """Payload a human reviewer submits to close an awaiting_human trial."""

    decision: str = Field(..., pattern="^(approve|decline|refer_back)$")
    reviewer: str = Field(..., min_length=1, max_length=120)
    notes: str = Field(default="", max_length=4000)


# ---------------------------------------------------------------------------
# Router.
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1", tags=["trials"])
_clerk = CourtClerk()


async def _trial_events(raw_case: dict[str, Any]) -> AsyncGenerator[TrialEvent, None]:
    """Execute the full trial pipeline, yielding (and persisting) typed audit events."""
    store = get_store()
    trial_id = uuid.uuid4().hex[:12]
    case_id = str(raw_case.get("case_id", "UNKNOWN-CASE"))
    seq = 0

    async def record(event_type: str, data: dict[str, Any]) -> TrialEvent:
        nonlocal seq
        seq += 1
        event = TrialEvent(seq=seq, type=event_type, data=data)
        await store.save_event(trial_id, event.model_dump())
        return event

    yield await record("trial.started", {"case_id": case_id, "trial_id": trial_id})

    # 1) Zero-trust identity firewall.
    safe_case, audit = apply_identity_firewall(raw_case)
    yield await record("firewall.applied", audit.model_dump())

    # 2) Isolated, compartmentalized witness agents (concurrent async sessions).
    witnesses = build_isolated_witness_agents()
    for agent in witnesses:
        yield await record(
            "agent.started",
            {"agent": agent.manifest.agent_name, "manifest": agent.manifest.model_dump()},
        )

    witness_findings: list[AgentFinding] = await asyncio.gather(
        *(agent.run(safe_case) for agent in witnesses)
    )
    for finding in witness_findings:
        yield await record("agent.completed", finding.model_dump())

    # 3) Deterministic counterfactual sensitivity (no LLM).
    counterfactual = evaluate_counterfactual_sensitivity(safe_case)
    yield await record("counterfactual.evaluated", counterfactual.model_dump())

    # 4) Bias/privacy challenger inspects the counterfactual result (isolated).
    challenger = BiasPrivacyChallengerAgent()
    yield await record(
        "agent.started",
        {"agent": challenger.manifest.agent_name, "manifest": challenger.manifest.model_dump()},
    )
    challenger_finding = await challenger.run(
        safe_case, extra_context={"counterfactual": counterfactual.model_dump()}
    )
    yield await record("agent.completed", challenger_finding.model_dump())

    # 5) Deterministic clerk assembly.
    packet: CasePacket = _clerk.assemble(
        case_id=case_id,
        subject_token=safe_case.get("subject_token", audit.subject_token),
        identity_audit=audit,
        findings=list(witness_findings) + [challenger_finding],
        counterfactual=counterfactual,
        trial_id=trial_id,
    )
    yield await record(
        "clerk.compiled",
        {"risk_level": packet.residual_risk_level, "flags": packet.aggregated_risk_flags},
    )

    # 6) Mandatory human handoff stop condition (persisted for review/replay).
    await store.save_packet(packet.model_dump())
    yield await record(
        "trial.awaiting_human",
        {"status": AWAITING_HUMAN, "trial_id": trial_id, "case_packet": packet.model_dump()},
    )


async def _ndjson(raw_case: dict[str, Any]) -> AsyncGenerator[bytes, None]:
    async for event in _trial_events(raw_case):
        yield (event.model_dump_json() + "\n").encode("utf-8")


# ---------------------------------------------------------------------------
# Endpoints.
# ---------------------------------------------------------------------------


@router.get("/health")
async def health() -> dict[str, Any]:
    """Liveness probe with decoupled LLM configuration echo."""
    return {
        "status": "ok",
        "service": "juryai",
        "llm_endpoint": agents.LOCAL_LLM_URL,
        "llm_model": agents.LOCAL_LLM_MODEL,
        "human_final_authority": True,
    }


@router.get("/llm/status")
async def llm_status() -> dict[str, Any]:
    """Probe the configured OpenAI-compatible endpoint (vLLM/Ollama/LM Studio)."""
    reachable, detail = False, ""
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            response = await client.get(
                f"{agents.LOCAL_LLM_URL.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {agents.LOCAL_LLM_API_KEY}"},
            )
            reachable = response.status_code < 500
            detail = f"HTTP {response.status_code}"
    except Exception as exc:  # noqa: BLE001 - probe must never raise
        detail = type(exc).__name__
    return {
        "endpoint": agents.LOCAL_LLM_URL,
        "model": agents.LOCAL_LLM_MODEL,
        "reachable": reachable,
        "mode": "live" if reachable else "offline_fallback",
        "detail": detail,
    }


@router.post("/trials/run")
async def run_trial(request: TrialRunRequest) -> StreamingResponse:
    """Run a decision-assurance trial and stream typed NDJSON audit events."""
    return StreamingResponse(
        _ndjson(request.model_dump()),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/trials/run-sync", response_model=CasePacket)
async def run_trial_sync(request: TrialRunRequest) -> CasePacket:
    """Run a trial and return the final CasePacket in one response (non-streaming)."""
    final: TrialEvent | None = None
    async for event in _trial_events(request.model_dump()):
        final = event
    if final is None or final.type != "trial.awaiting_human":
        raise HTTPException(status_code=500, detail="Trial did not reach the human handoff stop condition.")
    return CasePacket.model_validate(final.data["case_packet"])


@router.get("/trials")
async def list_trials(limit: int = Query(default=50, ge=1, le=500)) -> list[dict[str, Any]]:
    """List persisted trials (summary view), newest first."""
    return await get_store().list_packets(limit=limit)


@router.get("/trials/{trial_id}", response_model=CasePacket)
async def get_trial(trial_id: str) -> CasePacket:
    """Retrieve a persisted CasePacket."""
    packet = await get_store().get_packet(trial_id)
    if packet is None:
        raise HTTPException(status_code=404, detail="Trial not found.")
    return CasePacket.model_validate(packet)


@router.get("/trials/{trial_id}/events", response_model=list[TrialEvent])
async def get_trial_events(trial_id: str) -> list[TrialEvent]:
    """Replay the full persisted audit event trail for a trial."""
    events = await get_store().get_events(trial_id)
    if not events:
        raise HTTPException(status_code=404, detail="Trial not found.")
    return [TrialEvent.model_validate(e) for e in events]


@router.post("/trials/{trial_id}/decision", response_model=CasePacket)
async def record_human_decision(trial_id: str, body: HumanDecisionRequest) -> CasePacket:
    """Record the mandatory human final decision on an awaiting_human trial."""
    store = get_store()
    raw = await store.get_packet(trial_id)
    if raw is None:
        raise HTTPException(status_code=404, detail="Trial not found.")
    packet = CasePacket.model_validate(raw)
    if packet.status != AWAITING_HUMAN:
        raise HTTPException(status_code=409, detail="Trial already closed by a human reviewer.")

    decision = HumanDecision(decision=body.decision, reviewer=body.reviewer, notes=body.notes)
    packet.status = HUMAN_DECIDED
    packet.human_decision = decision
    await store.save_packet(packet.model_dump())

    events = await store.get_events(trial_id)
    next_seq = (events[-1]["seq"] + 1) if events else 1
    event = TrialEvent(
        seq=next_seq,
        type="human.decided",
        data={"status": HUMAN_DECIDED, "trial_id": trial_id, **decision.model_dump()},
    )
    await store.save_event(trial_id, event.model_dump())
    return packet


# ---------------------------------------------------------------------------
# Standalone application factory.
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    """Build the standalone FastAPI application."""
    application = FastAPI(
        title="JuryAI - Sovereign Multi-Agent Decision Assurance",
        version="1.1.0",
        description="Zero-trust, human-final-authority AI decision auditing backend.",
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(router)
    return application


app = create_app()


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run(
        "juryai.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
