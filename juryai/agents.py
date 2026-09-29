"""agents.py - Compartmentalized, Context-Capped Agent Pipeline.

Each agent carries an explicit manifest declaring exactly which evidence IDs and
data categories it may observe. Agents run in isolated async sessions and NEVER
receive other agents' findings (``receives_other_agent_findings = False``) to
prevent cross-contamination and anchoring bias.

LLM routing is fully decoupled: every client is constructed against
``LOCAL_LLM_URL`` with ``AsyncOpenAI``. If the local model endpoint is
unreachable, each agent degrades gracefully to a deterministic stubbed finding
so the pipeline remains fully auditable offline.

CRITICAL ISOLATION RULE
-----------------------
Agents must NEVER perform PII tokenization or deterministic math scoring. Those
responsibilities live exclusively in middleware.py. Agents reason over already
sanitized evidence and, for the bias challenger, over a precomputed
CounterfactualResult.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Decoupled LLM endpoint configuration (standard local env vars).
# ---------------------------------------------------------------------------

LOCAL_LLM_URL: str = os.getenv("LOCAL_LLM_URL", "http://localhost:8000/v1")
LOCAL_LLM_API_KEY: str = os.getenv("LOCAL_LLM_API_KEY", "mock-key")
LOCAL_LLM_MODEL: str = os.getenv("LOCAL_LLM_MODEL", "vllm-local-model")
LLM_TIMEOUT_SECONDS: float = float(os.getenv("LOCAL_LLM_TIMEOUT", "8.0"))


# ---------------------------------------------------------------------------
# Contracts.
# ---------------------------------------------------------------------------


class AgentManifest(BaseModel):
    """Explicit context contract governing what an agent may observe."""

    agent_name: str
    role: str
    allowed_evidence_ids: list[str] = Field(default_factory=list)
    allowed_data_categories: list[str] = Field(default_factory=list)
    receives_other_agent_findings: bool = False
    max_context_chars: int = 4000


class AgentFinding(BaseModel):
    """Structured output emitted by every agent."""

    agent: str
    role: str
    verdict: str
    confidence: float
    rationale: str
    evidence_ids: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    used_llm: bool = False
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ---------------------------------------------------------------------------
# Base agent.
# ---------------------------------------------------------------------------


class BaseWitnessAgent:
    """Base class for context-capped witness/reasoner agents."""

    manifest: AgentManifest

    def __init__(self, manifest: AgentManifest) -> None:
        self.manifest = manifest

    # -- Evidence compartmentalization -------------------------------------

    def _select_allowed_evidence(self, safe_case: dict[str, Any]) -> list[dict[str, Any]]:
        """Return only the evidence this agent's manifest permits."""
        evidence = safe_case.get("evidence", []) or []
        allowed: list[dict[str, Any]] = []
        for item in evidence:
            if not isinstance(item, dict):
                continue
            ev_id = str(item.get("id", ""))
            category = str(item.get("category", ""))
            id_ok = (not self.manifest.allowed_evidence_ids) or ev_id in self.manifest.allowed_evidence_ids
            cat_ok = (not self.manifest.allowed_data_categories) or category in self.manifest.allowed_data_categories
            if id_ok and cat_ok:
                allowed.append(item)
        return allowed

    def _cap_context(self, text: str) -> str:
        """Enforce the manifest context cap deterministically."""
        cap = self.manifest.max_context_chars
        if len(text) <= cap:
            return text
        return text[:cap] + "\n...[context truncated by manifest cap]..."

    # -- Prompt construction (subclasses extend the task instruction) ------

    def _system_prompt(self) -> str:
        return (
            "You are a compartmentalized decision-assurance witness in a sovereign "
            "multi-agent audit system. You may ONLY reason over the evidence provided. "
            "You have NOT seen any other agent's opinion. Never infer or reconstruct "
            "personal identity. Respond ONLY with a compact JSON object with keys: "
            '"verdict" (one of "supported","not_supported","insufficient"), '
            '"confidence" (0.0-1.0), "rationale" (string), "flags" (array of strings).'
        )

    def _task_instruction(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> str:
        raise NotImplementedError

    def _build_user_prompt(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> str:
        allowed_evidence = self._select_allowed_evidence(safe_case)
        payload = {
            "subject_token": safe_case.get("subject_token"),
            "role": self.manifest.role,
            "allowed_evidence": allowed_evidence,
            "task": self._task_instruction(safe_case, extra_context),
        }
        if extra_context:
            payload["reference"] = extra_context
        return self._cap_context(json.dumps(payload, ensure_ascii=False, indent=2))

    # -- Deterministic fallback (subclass-specific) ------------------------

    def _fallback_finding(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> AgentFinding:
        raise NotImplementedError

    # -- Execution ---------------------------------------------------------

    async def run(
        self,
        safe_case: dict[str, Any],
        extra_context: dict[str, Any] | None = None,
    ) -> AgentFinding:
        """Execute the agent in an isolated async LLM session with graceful fallback."""
        allowed_ids = [str(e.get("id", "")) for e in self._select_allowed_evidence(safe_case)]
        user_prompt = self._build_user_prompt(safe_case, extra_context)

        try:
            client = AsyncOpenAI(
                base_url=LOCAL_LLM_URL,
                api_key=LOCAL_LLM_API_KEY,
                timeout=LLM_TIMEOUT_SECONDS,
                max_retries=0,
            )
            response = await client.chat.completions.create(
                model=LOCAL_LLM_MODEL,
                messages=[
                    {"role": "system", "content": self._system_prompt()},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
                max_tokens=400,
            )
            content = (response.choices[0].message.content or "").strip()
            finding = self._parse_llm_finding(content, allowed_ids)
            finding.used_llm = True
            return finding
        except Exception:
            # Sovereign offline mode: deterministic, fully auditable fallback.
            fallback = self._fallback_finding(safe_case, extra_context)
            fallback.used_llm = False
            return fallback

    def _parse_llm_finding(self, content: str, allowed_ids: list[str]) -> AgentFinding:
        """Parse a JSON LLM response into an AgentFinding, tolerating fenced code."""
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if "\n" in cleaned:
                cleaned = cleaned.split("\n", 1)[1]
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start : end + 1]
        data = json.loads(cleaned)
        return AgentFinding(
            agent=self.manifest.agent_name,
            role=self.manifest.role,
            verdict=str(data.get("verdict", "insufficient")),
            confidence=float(data.get("confidence", 0.5)),
            rationale=str(data.get("rationale", "")),
            evidence_ids=allowed_ids,
            flags=[str(f) for f in (data.get("flags") or [])],
        )


# ---------------------------------------------------------------------------
# Concrete agents.
# ---------------------------------------------------------------------------


class DecisionWitnessAgent(BaseWitnessAgent):
    """Evaluates financial and operational records."""

    def __init__(self) -> None:
        super().__init__(
            AgentManifest(
                agent_name="DecisionWitnessAgent",
                role="financial_operational_witness",
                allowed_evidence_ids=[],
                allowed_data_categories=["financial_record", "operational_record"],
                receives_other_agent_findings=False,
                max_context_chars=4000,
            )
        )

    def _task_instruction(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> str:
        return (
            "Assess whether the financial and operational records support the requested "
            "decision. Focus on affordability, debt load and consistency of the records."
        )

    def _fallback_finding(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> AgentFinding:
        allowed = self._select_allowed_evidence(safe_case)
        financials = safe_case.get("financials", {}) or {}
        income = float(financials.get("annual_income", 0) or 0)
        debt = float(financials.get("existing_debt", 0) or 0)
        dti = (debt / income) if income > 0 else 1.0
        flags: list[str] = []
        if dti >= 0.5:
            flags.append("high_debt_to_income")
        if not allowed:
            verdict, confidence = "insufficient", 0.3
            rationale = "No financial or operational records were within this agent's manifest."
        elif dti < 0.4:
            verdict, confidence = "supported", 0.72
            rationale = f"Debt-to-income ratio {dti:.2f} indicates affordable exposure."
        else:
            verdict, confidence = "not_supported", 0.6
            rationale = f"Debt-to-income ratio {dti:.2f} indicates elevated repayment risk."
        return AgentFinding(
            agent=self.manifest.agent_name,
            role=self.manifest.role,
            verdict=verdict,
            confidence=confidence,
            rationale=rationale + " [deterministic offline witness]",
            evidence_ids=[str(e.get("id", "")) for e in allowed],
            flags=flags,
        )


class FactCheckerAgent(BaseWitnessAgent):
    """Verifies claims against source documents."""

    def __init__(self) -> None:
        super().__init__(
            AgentManifest(
                agent_name="FactCheckerAgent",
                role="claim_verification",
                allowed_evidence_ids=[],
                allowed_data_categories=["source_document", "application_claim"],
                receives_other_agent_findings=False,
                max_context_chars=4000,
            )
        )

    def _task_instruction(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> str:
        return (
            "Verify each application claim strictly against the provided source documents. "
            "Flag any claim that is unsupported or contradicted by the sources."
        )

    def _fallback_finding(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> AgentFinding:
        allowed = self._select_allowed_evidence(safe_case)
        sources = [e for e in allowed if e.get("category") == "source_document"]
        claims = [e for e in allowed if e.get("category") == "application_claim"]
        claims += [c for c in (safe_case.get("claims", []) or []) if isinstance(c, dict)]

        flags: list[str] = []
        source_text = " ".join(str(s.get("text", "")).lower() for s in sources)
        unverified = 0
        for claim in claims:
            claim_words = [w for w in str(claim.get("text", "")).lower().split() if len(w) > 4]
            overlap = sum(1 for w in claim_words if w in source_text)
            if not claim_words or overlap == 0:
                unverified += 1

        if not sources:
            verdict, confidence = "insufficient", 0.3
            rationale = "No source documents available within this agent's manifest to verify claims."
        elif unverified == 0:
            verdict, confidence = "supported", 0.7
            rationale = "All in-scope claims have corroborating tokens in the source documents."
        else:
            verdict, confidence = "not_supported", 0.62
            rationale = f"{unverified} claim(s) lacked corroboration in the provided source documents."
            flags.append("unverified_claims")

        return AgentFinding(
            agent=self.manifest.agent_name,
            role=self.manifest.role,
            verdict=verdict,
            confidence=confidence,
            rationale=rationale + " [deterministic offline verification]",
            evidence_ids=[str(e.get("id", "")) for e in allowed],
            flags=flags,
        )


class BiasPrivacyChallengerAgent(BaseWitnessAgent):
    """Evaluates residual privacy risk and inspects the counterfactual result."""

    def __init__(self) -> None:
        super().__init__(
            AgentManifest(
                agent_name="BiasPrivacyChallengerAgent",
                role="bias_privacy_challenger",
                allowed_evidence_ids=[],
                allowed_data_categories=["privacy_signal", "counterfactual"],
                receives_other_agent_findings=False,
                max_context_chars=3000,
            )
        )

    def _task_instruction(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> str:
        return (
            "Inspect the deterministic counterfactual result and the sanitized case for "
            "residual privacy leakage or evidence that the decision is sensitive to a "
            "protected proxy. Do not recompute scores; reason over the provided result."
        )

    def _detect_residual_pii(self, safe_case: dict[str, Any]) -> list[str]:
        """Heuristic scan for identifiers that should have been stripped."""
        leaks: list[str] = []
        blob = json.dumps(safe_case, ensure_ascii=False)
        for key in ("national_id", "ssn", "\"name\"", "\"email\"", "\"phone\""):
            if key in blob:
                leaks.append(key.strip('"'))
        return leaks

    def _fallback_finding(self, safe_case: dict[str, Any], extra_context: dict[str, Any] | None) -> AgentFinding:
        cf = (extra_context or {}).get("counterfactual", {}) if extra_context else {}
        flags: list[str] = []
        leaks = self._detect_residual_pii(safe_case)
        if leaks:
            flags.append("residual_pii_leak")

        flipped = bool(cf.get("outcome_flipped"))
        if flipped:
            flags.append("proxy_sensitive_outcome")
            verdict, confidence = "not_supported", 0.8
            rationale = (
                "Counterfactual removal of postal geography flipped the decision - the "
                "outcome is sensitive to a protected proxy and must not be automated."
            )
        elif leaks:
            verdict, confidence = "not_supported", 0.7
            rationale = "Residual direct identifiers detected in the sanitized case; privacy gate incomplete."
        else:
            verdict, confidence = "supported", 0.66
            rationale = (
                "No residual identifiers detected and the decision is stable under "
                "counterfactual geography removal."
            )

        return AgentFinding(
            agent=self.manifest.agent_name,
            role=self.manifest.role,
            verdict=verdict,
            confidence=confidence,
            rationale=rationale + " [deterministic offline challenge]",
            evidence_ids=[],
            flags=flags,
        )


def build_isolated_witness_agents() -> list[BaseWitnessAgent]:
    """Factory returning fresh, isolated instances of the primary witness agents."""
    return [DecisionWitnessAgent(), FactCheckerAgent()]
