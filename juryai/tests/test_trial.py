"""End-to-end tests for the JuryAI sovereign trial pipeline.

Run with:  python -m pytest juryai/tests/test_trial.py -v   (from /app)

These tests exercise the pipeline entirely offline (no local LLM server is
required) and assert the sovereign guarantees:
    * PII is stripped and pseudonymized.
    * The counterfactual engine is deterministic.
    * The final status is always the mandatory human handoff.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from juryai.agents import DecisionWitnessAgent, FactCheckerAgent
from juryai.clerk import AWAITING_HUMAN, CourtClerk
from juryai.main import app
from juryai.middleware import (
    apply_identity_firewall,
    evaluate_counterfactual_sensitivity,
)

SAMPLE_CASE: dict = {
    "case_id": "LOAN-TEST-001",
    "applicant": {
        "name": "Jane A. Doe",
        "national_id": "AB-1234567",
        "email": "jane.doe@example.com",
        "postal_code": "10118",
    },
    "financials": {
        "annual_income": 52000,
        "existing_debt": 24000,
        "requested_amount": 21000,
        "credit_score": 631,
    },
    "evidence": [
        {"id": "EV-001", "category": "financial_record", "text": "Statements for Jane A. Doe show steady deposits."},
        {"id": "EV-002", "category": "source_document", "text": "Employer confirms stable employment for 5 years."},
    ],
    "claims": [
        {"id": "CL-1", "category": "application_claim", "text": "Applicant reports stable employment for 5 years."}
    ],
}

client = TestClient(app)


def test_identity_firewall_strips_and_tokenizes() -> None:
    safe_case, audit = apply_identity_firewall(SAMPLE_CASE)
    blob = json.dumps(safe_case)

    # Direct identifiers must be gone from every field.
    assert "Jane A. Doe" not in blob
    assert "AB-1234567" not in blob
    assert "jane.doe@example.com" not in blob

    # Pseudonymous token present and substituted into evidence text.
    assert safe_case["subject_token"].startswith("SUBJECT-")
    assert safe_case["subject_token"] in safe_case["evidence"][0]["text"]

    # Purpose-limited signal retained for bias evaluation.
    assert safe_case["applicant"]["postal_code"] == "10118"

    # Audit reflects the operation.
    assert "name" in audit.removed_fields
    assert "national_id" in audit.removed_fields
    assert audit.substitution_count >= 1


def test_counterfactual_is_deterministic() -> None:
    safe_case, _ = apply_identity_firewall(SAMPLE_CASE)
    r1 = evaluate_counterfactual_sensitivity(safe_case)
    r2 = evaluate_counterfactual_sensitivity(safe_case)
    assert r1.model_dump() == r2.model_dump()
    assert r1.sensitive_attribute == "postal_geography"
    # High-risk postal prefix (101) applies a negative adjustment.
    assert r1.baseline_score <= r1.counterfactual_score


def test_clerk_enforces_human_handoff() -> None:
    import asyncio

    safe_case, audit = apply_identity_firewall(SAMPLE_CASE)

    async def _gather():
        return await asyncio.gather(
            DecisionWitnessAgent().run(safe_case), FactCheckerAgent().run(safe_case)
        )

    findings = asyncio.run(_gather())
    cf = evaluate_counterfactual_sensitivity(safe_case)
    packet = CourtClerk().assemble(
        case_id="LOAN-TEST-001",
        subject_token=safe_case["subject_token"],
        identity_audit=audit,
        findings=list(findings),
        counterfactual=cf,
    )
    assert packet.status == AWAITING_HUMAN
    assert packet.requires_human is True
    assert packet.residual_risk_level in {"standard", "elevated", "high", "indeterminate"}


def test_health_endpoint() -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["human_final_authority"] is True


def test_stream_endpoint_full_trial() -> None:
    resp = client.post("/api/v1/trials/run", json=SAMPLE_CASE)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/x-ndjson")

    lines = [json.loads(l) for l in resp.text.splitlines() if l.strip()]
    types = [e["type"] for e in lines]

    assert "trial.started" in types
    assert "firewall.applied" in types
    assert "counterfactual.evaluated" in types
    assert types[-1] == "trial.awaiting_human"

    final = lines[-1]["data"]
    assert final["status"] == AWAITING_HUMAN
    assert final["case_packet"]["requires_human"] is True


def test_sync_endpoint_returns_case_packet() -> None:
    resp = client.post("/api/v1/trials/run-sync", json=SAMPLE_CASE)
    assert resp.status_code == 200
    packet = resp.json()
    assert packet["status"] == AWAITING_HUMAN
    assert packet["subject_token"].startswith("SUBJECT-")
    assert len(packet["findings"]) == 3


def test_persistence_replay_and_human_decision() -> None:
    packet = client.post("/api/v1/trials/run-sync", json=SAMPLE_CASE).json()
    trial_id = packet["trial_id"]

    assert client.get(f"/api/v1/trials/{trial_id}").json()["status"] == AWAITING_HUMAN
    events = client.get(f"/api/v1/trials/{trial_id}/events").json()
    assert [e["type"] for e in events][-1] == "trial.awaiting_human"
    assert any(t["trial_id"] == trial_id for t in client.get("/api/v1/trials").json())

    bad = client.post(f"/api/v1/trials/{trial_id}/decision", json={"decision": "approve", "reviewer": ""})
    assert bad.status_code == 422

    ok = client.post(
        f"/api/v1/trials/{trial_id}/decision",
        json={"decision": "decline", "reviewer": "auditor-01", "notes": "Proxy flip."},
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "human_decided"
    assert ok.json()["human_decision"]["decision"] == "decline"

    again = client.post(f"/api/v1/trials/{trial_id}/decision", json={"decision": "approve", "reviewer": "x"})
    assert again.status_code == 409

    replay = client.get(f"/api/v1/trials/{trial_id}/events").json()
    assert replay[-1]["type"] == "human.decided"
    assert client.get("/api/v1/trials/does-not-exist").status_code == 404


def test_llm_status_probe_never_raises() -> None:
    body = client.get("/api/v1/llm/status").json()
    assert body["mode"] in {"live", "offline_fallback"}
    assert "endpoint" in body
