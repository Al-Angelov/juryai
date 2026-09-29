"""middleware.py - Zero-Trust Gate & Deterministic Engine.

This module is a fully isolated service layer. It performs:

    1. Identity Firewall  (PII stripping + pseudonymous tokenization).
    2. Deterministic Counterfactual Sensitivity testing (pure Python, no LLM).

CRITICAL ISOLATION RULE
-----------------------
No function in this file may ever call an LLM. LLM prompt loops (agents.py) must
NEVER perform PII tokenization or mathematical scoring themselves. All such logic
lives here and only here.
"""

from __future__ import annotations

import copy
import hashlib
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration: fields that constitute direct personal identifiers.
# ---------------------------------------------------------------------------

# Direct identifiers are stripped entirely and substring-substituted everywhere.
DIRECT_IDENTIFIER_FIELDS: tuple[str, ...] = (
    "name",
    "full_name",
    "national_id",
    "ssn",
    "email",
    "phone",
    "date_of_birth",
    "address_line",
)

# Purpose-limited, non-identifying signals retained for downstream bias
# evaluation (e.g. deterministic counterfactual geography testing).
RETAINED_SIGNAL_FIELDS: tuple[str, ...] = (
    "postal_code",
    "region",
)


# ---------------------------------------------------------------------------
# Immutable audit record for the identity firewall.
# ---------------------------------------------------------------------------


class IdentityFirewallAudit(BaseModel):
    """Immutable, tamper-evident record of the redaction operation.

    ``model_config`` freezes the instance so downstream compilers cannot mutate
    the audit trail after the firewall has been applied.
    """

    model_config = {"frozen": True}

    audit_id: str
    subject_token: str
    removed_fields: list[str] = Field(default_factory=list)
    retained_signals: list[str] = Field(default_factory=list)
    substitution_count: int = 0
    identifier_digest: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ---------------------------------------------------------------------------
# Deterministic counterfactual result payload.
# ---------------------------------------------------------------------------


class CounterfactualResult(BaseModel):
    """Result of deterministic sensitivity testing on a protected proxy."""

    sensitive_attribute: str
    baseline_decision: str
    counterfactual_decision: str
    baseline_score: float
    counterfactual_score: float
    score_delta: float
    outcome_flipped: bool
    threshold_band: dict[str, float]
    rationale: str


# ---------------------------------------------------------------------------
# Identity Firewall
# ---------------------------------------------------------------------------


def _derive_subject_token(seed_values: list[str]) -> tuple[str, str]:
    """Derive a stable pseudonymous ``SUBJECT-XXXX`` token from identifiers.

    Returns the token and the full identifier digest used to derive it. The
    derivation is deterministic so the same subject always maps to the same
    token within an audit boundary, without exposing the raw identifiers.
    """
    seed = "|".join(v.strip().lower() for v in seed_values if v)
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    token = f"SUBJECT-{digest[:4].upper()}"
    return token, digest


def _collect_identifier_values(node: Any, out: list[str]) -> None:
    """Recursively collect the literal string values of direct identifiers."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in DIRECT_IDENTIFIER_FIELDS and isinstance(value, str) and value.strip():
                out.append(value)
            else:
                _collect_identifier_values(value, out)
    elif isinstance(node, list):
        for item in node:
            _collect_identifier_values(item, out)


def _substitute_and_strip(node: Any, replacements: list[str], token: str, counter: list[int]) -> Any:
    """Return a sanitized copy of ``node``.

    Direct identifier keys are removed. Every remaining string field has literal
    substring occurrences of any known identifier value replaced with ``token``.
    """
    if isinstance(node, dict):
        result: dict[str, Any] = {}
        for key, value in node.items():
            if key in DIRECT_IDENTIFIER_FIELDS:
                # Strip the direct identifier entirely.
                continue
            result[key] = _substitute_and_strip(value, replacements, token, counter)
        return result
    if isinstance(node, list):
        return [_substitute_and_strip(item, replacements, token, counter) for item in node]
    if isinstance(node, str):
        new_value = node
        for raw in replacements:
            if raw and raw in new_value:
                new_value = new_value.replace(raw, token)
                counter[0] += 1
        return new_value
    return node


def apply_identity_firewall(raw_case: dict[str, Any]) -> tuple[dict[str, Any], IdentityFirewallAudit]:
    """Apply the zero-trust identity firewall to raw case data.

    Steps:
        1. Collect all direct identifier values (recursively).
        2. Derive a stable ``SUBJECT-XXXX`` pseudonymous token.
        3. Strip direct identifier keys and substring-substitute their literal
           values across every remaining text field.
        4. Preserve purpose-limited non-identifying signals for bias testing.

    Returns:
        A tuple of ``(safe_case, IdentityFirewallAudit)``.
    """
    working = copy.deepcopy(raw_case)

    identifier_values: list[str] = []
    _collect_identifier_values(working, identifier_values)

    subject_token, digest = _derive_subject_token(identifier_values or [str(raw_case.get("case_id", ""))])

    counter = [0]
    safe_case = _substitute_and_strip(working, identifier_values, subject_token, counter)

    # Stamp the pseudonymous token onto the sanitized case for traceability.
    safe_case["subject_token"] = subject_token

    # Determine which retained signals actually survived (for the audit).
    retained_present: list[str] = []

    def _scan_retained(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key in RETAINED_SIGNAL_FIELDS and value not in (None, ""):
                    retained_present.append(key)
                _scan_retained(value)
        elif isinstance(node, list):
            for item in node:
                _scan_retained(item)

    _scan_retained(safe_case)

    removed = _detect_removed_fields(raw_case)

    audit = IdentityFirewallAudit(
        audit_id=f"IFA-{digest[:8].upper()}",
        subject_token=subject_token,
        removed_fields=sorted(set(removed)),
        retained_signals=sorted(set(retained_present)),
        substitution_count=counter[0],
        identifier_digest=digest,
    )
    return safe_case, audit


def _detect_removed_fields(node: Any, found: set[str] | None = None) -> list[str]:
    """Recursively detect which direct identifier fields were present in input."""
    if found is None:
        found = set()
    if isinstance(node, dict):
        for key, value in node.items():
            if key in DIRECT_IDENTIFIER_FIELDS and value not in (None, ""):
                found.add(key)
            _detect_removed_fields(value, found)
    elif isinstance(node, list):
        for item in node:
            _detect_removed_fields(item, found)
    return sorted(found)


# ---------------------------------------------------------------------------
# Deterministic Counterfactual Engine
# ---------------------------------------------------------------------------

# Decision thresholds (score is 0..100).
_APPROVE_THRESHOLD: float = 60.0
_REFER_THRESHOLD: float = 40.0

# Simulated geographic risk adjustment keyed on postal prefix. This models the
# proxy-discrimination risk that arises when geography leaks into scoring.
_HIGH_RISK_POSTAL_PREFIXES: frozenset[str] = frozenset({"101", "112", "606", "900"})
_LOW_RISK_POSTAL_PREFIXES: frozenset[str] = frozenset({"200", "941", "331"})


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _postal_geo_adjustment(postal_code: str) -> float:
    """Deterministic geography-based score adjustment (the proxy under test)."""
    prefix = str(postal_code or "").strip()[:3]
    if prefix in _HIGH_RISK_POSTAL_PREFIXES:
        return -14.0
    if prefix in _LOW_RISK_POSTAL_PREFIXES:
        return 6.0
    return 0.0


def _classify(score: float) -> str:
    if score >= _APPROVE_THRESHOLD:
        return "approve"
    if score >= _REFER_THRESHOLD:
        return "refer"
    return "decline"


def _base_risk_score(financials: dict[str, Any]) -> float:
    """Pure deterministic creditworthiness score from financial ratios."""
    income = _as_float(financials.get("annual_income"))
    debt = _as_float(financials.get("existing_debt"))
    requested = _as_float(financials.get("requested_amount"))
    credit_score = _as_float(financials.get("credit_score"), 600.0)

    dti = (debt / income) if income > 0 else 1.0
    lti = (requested / income) if income > 0 else 1.0

    # Credit component (up to 50 points).
    credit_component = max(0.0, min(1.0, (credit_score - 300.0) / (850.0 - 300.0))) * 50.0
    # Debt-to-income component (up to 30 points, better when DTI low).
    dti_component = max(0.0, 1.0 - dti) * 30.0
    # Loan-to-income component (up to 20 points, penalizes large asks).
    lti_component = max(0.0, 1.0 - (lti / 0.5)) * 20.0

    return round(credit_component + dti_component + lti_component, 4)


def evaluate_counterfactual_sensitivity(safe_case: dict[str, Any]) -> CounterfactualResult:
    """Evaluate whether removing postal geography flips the decision.

    Scores the case twice - once WITH the postal geography adjustment applied
    and once WITHOUT it. If the discrete decision (approve/refer/decline) changes
    between the two runs, the outcome is deterministically flagged as sensitive
    to the protected geographic proxy. No LLM is involved.
    """
    financials = safe_case.get("financials", {}) if isinstance(safe_case, dict) else {}
    postal_code = ""
    applicant = safe_case.get("applicant", {}) if isinstance(safe_case, dict) else {}
    if isinstance(applicant, dict):
        postal_code = str(applicant.get("postal_code", "") or "")
    if not postal_code:
        postal_code = str(safe_case.get("postal_code", "") or "")

    base = _base_risk_score(financials)
    geo_adjust = _postal_geo_adjustment(postal_code)

    baseline_score = round(max(0.0, min(100.0, base + geo_adjust)), 4)  # geography included
    counterfactual_score = round(max(0.0, min(100.0, base)), 4)          # geography removed

    baseline_decision = _classify(baseline_score)
    counterfactual_decision = _classify(counterfactual_score)
    flipped = baseline_decision != counterfactual_decision

    if flipped:
        rationale = (
            f"Decision changed from '{counterfactual_decision}' to '{baseline_decision}' "
            f"solely because postal geography ({postal_code[:3]}xxx) applied a "
            f"{geo_adjust:+.1f} point adjustment. Outcome is sensitive to a protected proxy."
        )
    else:
        rationale = (
            f"Postal geography adjustment of {geo_adjust:+.1f} points did not change the "
            f"'{baseline_decision}' outcome. Decision is stable under counterfactual removal."
        )

    return CounterfactualResult(
        sensitive_attribute="postal_geography",
        baseline_decision=baseline_decision,
        counterfactual_decision=counterfactual_decision,
        baseline_score=baseline_score,
        counterfactual_score=counterfactual_score,
        score_delta=round(baseline_score - counterfactual_score, 4),
        outcome_flipped=flipped,
        threshold_band={"approve": _APPROVE_THRESHOLD, "refer": _REFER_THRESHOLD},
        rationale=rationale,
    )
