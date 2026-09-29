"""clerk.py - Deterministic Case Assembly.

The CourtClerk compiles findings from agents.py together with the middleware
outputs (identity firewall audit + counterfactual result) into a single,
structured CasePacket.

CRITICAL RULE
-------------
The clerk contains NO LLM generation and NO opinion logic. It is a strictly
deterministic data compiler: it de-duplicates findings, aggregates risk flags,
and assembles the packet. It never decides the case - that authority is reserved
for a human (enforced by main.py via ``status = "awaiting_human"``).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from .agents import AgentFinding
from .middleware import CounterfactualResult, IdentityFirewallAudit

AWAITING_HUMAN: str = "awaiting_human"
HUMAN_DECIDED: str = "human_decided"


class HumanDecision(BaseModel):
    """The final, human-issued decision recorded against a CasePacket."""

    decision: Literal["approve", "decline", "refer_back"]
    reviewer: str = Field(..., min_length=1)
    notes: str = ""
    decided_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class CasePacket(BaseModel):
    """Structured, human-review-ready compilation of an audit trial."""

    trial_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    case_id: str
    subject_token: str
    status: str = AWAITING_HUMAN
    requires_human: bool = True
    human_decision: HumanDecision | None = None

    identity_firewall_audit: IdentityFirewallAudit
    counterfactual: CounterfactualResult
    findings: list[AgentFinding] = Field(default_factory=list)

    aggregated_risk_flags: list[str] = Field(default_factory=list)
    verdict_tally: dict[str, int] = Field(default_factory=dict)
    residual_risk_level: str = "unknown"

    handoff_reason: str = ""
    compiled_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class CourtClerk:
    """Deterministic compiler of trial artifacts into a CasePacket."""

    @staticmethod
    def _dedupe_findings(findings: list[AgentFinding]) -> list[AgentFinding]:
        """Remove exact duplicate findings while preserving order."""
        seen: set[tuple[str, str, str]] = set()
        unique: list[AgentFinding] = []
        for finding in findings:
            key = (finding.agent, finding.verdict, finding.rationale)
            if key in seen:
                continue
            seen.add(key)
            unique.append(finding)
        return unique

    @staticmethod
    def _aggregate_flags(
        findings: list[AgentFinding],
        counterfactual: CounterfactualResult,
        audit: IdentityFirewallAudit,
    ) -> list[str]:
        flags: set[str] = set()
        for finding in findings:
            flags.update(finding.flags)
        if counterfactual.outcome_flipped:
            flags.add("counterfactual_outcome_flip")
        if audit.substitution_count == 0 and not audit.removed_fields:
            flags.add("no_pii_detected")
        return sorted(flags)

    @staticmethod
    def _tally_verdicts(findings: list[AgentFinding]) -> dict[str, int]:
        tally: dict[str, int] = {}
        for finding in findings:
            tally[finding.verdict] = tally.get(finding.verdict, 0) + 1
        return tally

    @staticmethod
    def _derive_risk_level(flags: list[str], tally: dict[str, int]) -> str:
        """Deterministic risk banding (aggregation only - not a decision)."""
        high_signals = {
            "counterfactual_outcome_flip",
            "proxy_sensitive_outcome",
            "residual_pii_leak",
        }
        if any(f in high_signals for f in flags):
            return "high"
        if tally.get("not_supported", 0) > 0 or "unverified_claims" in flags:
            return "elevated"
        if tally.get("insufficient", 0) > 0:
            return "indeterminate"
        return "standard"

    def assemble(
        self,
        case_id: str,
        subject_token: str,
        identity_audit: IdentityFirewallAudit,
        findings: list[AgentFinding],
        counterfactual: CounterfactualResult,
        trial_id: str | None = None,
    ) -> CasePacket:
        """Compile all trial artifacts into a single CasePacket (deterministic)."""
        unique_findings = self._dedupe_findings(findings)
        flags = self._aggregate_flags(unique_findings, counterfactual, identity_audit)
        tally = self._tally_verdicts(unique_findings)
        risk_level = self._derive_risk_level(flags, tally)

        reasons: list[str] = ["High-risk AI decision requires mandatory human final authority."]
        if counterfactual.outcome_flipped:
            reasons.append("Counterfactual sensitivity to a protected proxy was detected.")
        if "residual_pii_leak" in flags:
            reasons.append("Residual identifiers require privacy sign-off.")

        return CasePacket(
            **({"trial_id": trial_id} if trial_id else {}),
            case_id=case_id,
            subject_token=subject_token,
            status=AWAITING_HUMAN,
            requires_human=True,
            identity_firewall_audit=identity_audit,
            counterfactual=counterfactual,
            findings=unique_findings,
            aggregated_risk_flags=flags,
            verdict_tally=tally,
            residual_risk_level=risk_level,
            handoff_reason=" ".join(reasons),
        )
