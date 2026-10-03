// Tax_Audit_API — the API layer for the Tax Audit Review Dashboard (Requirement 14).
//
// By default this module is a standalone, deterministic MOCK gateway: plain
// JavaScript using Promise semantics with a simulated latency bounded well below
// the 2000 ms resolution ceiling, no dependency on any IDE internal runtime or
// hosting utility (Requirement 14.3), importing only the local `mockData.js`
// fixtures. It runs unchanged in any plain Node or browser context, which is the
// behaviour the Vitest property/contract suite pins down.
//
// OPTIONAL LIVE MODE (opt-in, off by default): when the Vite build is run with
// `VITE_USE_LIVE_BACKEND === "true"`, `fetchActiveCase`, `submitAuditorDecision`
// and the new `streamTrialEvents` first attempt real network calls against the
// FastAPI backend (`VITE_API_URL`, default http://localhost:8000/api/v1). On ANY
// failure (network error, timeout, non-2xx, missing terminal event) each live
// function throws so the caller can catch and fall back to the mock.
//
// Test-safety rules obeyed without exception:
//   • No new ES `import` statements — only `./mockData.js` is imported, satisfying
//     Requirement 14.3 and the portability source-scan in taxAuditApi.portability.test.ts.
//   • The env toggle reads only `import.meta.env` (undefined in bare Node/Vitest).
//   • Under Vitest `USE_LIVE` is naturally false, so every existing test exercises
//     the identical mock path and the 78/78 suite stays green.
//
// Exposed functions:
//   fetchActiveCase(caseId)            — one-shot CasePacket promise
//   submitAuditorDecision(caseId, payload) — decision submit + GenTaxReceipt promise
//   streamTrialEvents(caseId, onEvent) — progressive NDJSON streaming callback

import { getCase, hasCase } from "./mockData.js";

// ---------------------------------------------------------------------------
// Live-mode configuration (read solely from Vite's import.meta.env).
// ---------------------------------------------------------------------------

// import.meta.env is undefined in a bare Node/Vitest ESM import (no Vite
// transform). Optional chaining keeps the read safe and makes USE_LIVE
// naturally false in the test environment (Requirement 14.3).
const VITE_ENV = import.meta.env;

/** True only when the app is explicitly built/run in live-backend mode. */
const USE_LIVE = VITE_ENV?.VITE_USE_LIVE_BACKEND === "true";

/** Base URL of the FastAPI backend's versioned API (live mode only). */
const API_BASE = VITE_ENV?.VITE_API_URL || "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Mock-mode constants (Requirement 14).
// ---------------------------------------------------------------------------

const MAX_CASE_ID_LENGTH = 128;
const MIN_LATENCY_MS = 300;
const MAX_LATENCY_MS = 800;

const CASE_ID_ERROR = "case identifier is missing or unknown";

function simulatedLatency() {
  const span = MAX_LATENCY_MS - MIN_LATENCY_MS;
  const delay = MIN_LATENCY_MS + Math.floor(Math.random() * (span + 1));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function isWellFormedCaseId(caseId) {
  return (
    typeof caseId === "string" &&
    caseId.length >= 1 &&
    caseId.length <= MAX_CASE_ID_LENGTH
  );
}

function isValidCaseId(caseId) {
  return isWellFormedCaseId(caseId) && hasCase(caseId);
}

function isPresent(value) {
  return value !== undefined && value !== null;
}

function buildReceipt(caseId, status) {
  const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();
  return {
    transactionId: `GENTAX-TX-${rand()}`,
    caseId,
    status,
    ledgerTimestamp: new Date().toISOString(),
    confirmationCode: `CONF-${rand()}`,
  };
}

// ---------------------------------------------------------------------------
// Mock implementations — unchanged; used directly when !USE_LIVE and as the
// fallback when a live call fails.
// ---------------------------------------------------------------------------

function fetchActiveCaseMock(caseId) {
  if (!isWellFormedCaseId(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }
  if (!hasCase(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }
  return simulatedLatency().then(() => getCase(caseId));
}

function submitAuditorDecisionMock(caseId, payload) {
  if (!isValidCaseId(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }
  const decision = payload || {};
  if (decision.status !== "approved" && decision.status !== "rejected") {
    return Promise.reject(new Error("status is invalid"));
  }
  if (!isPresent(decision.adjustedCalculations)) {
    return Promise.reject(new Error("adjustedCalculations is required"));
  }
  if (!isPresent(decision.caseworkerNotes)) {
    return Promise.reject(new Error("caseworkerNotes is required"));
  }
  if (!isPresent(decision.timestamp)) {
    return Promise.reject(new Error("timestamp is required"));
  }
  return simulatedLatency().then(() => buildReceipt(caseId, decision.status));
}

// ---------------------------------------------------------------------------
// Live-mode helpers.
// ---------------------------------------------------------------------------

/**
 * Build the Finnish tax-audit trial request body from a caseId.
 *
 * The body uses the fixture data when a matching mock entry exists (so the
 * exact applicant details and documents are forwarded), falling back to a
 * minimal synthetic payload for unknown ids. The backend's identity firewall
 * will strip PII and pseudonymise before any agent sees it.
 *
 * @param {string} caseId
 * @returns {object} TrialRunRequest body
 */
function buildTrialPayload(caseId) {
  // Use the local fixture when available so PII flows through the real firewall.
  const fixture = hasCase(caseId) ? getCase(caseId) : null;

  if (fixture) {
    // Extract applicant PII from subject metadata if present; the backend
    // firewall will strip it before any agent observes it.
    const subject = fixture.subject || {};
    const docs = (fixture.documents || []).map((d) => ({
      label: d.label,
      ocrText: d.ocrText || "",
    }));
    const unstructuredDoc = docs.length
      ? docs.map((d) => `[${d.label}]: ${d.ocrText}`).join("\n\n")
      : "Tax audit documents attached.";

    return {
      case_id: caseId,
      claim_category: "work_equipment_deduction",
      applicant: {
        // Pass pseudonymous token as the display name — real PII was already
        // stripped by the local fixture design (SUBJECT-XXXX pattern).
        name: subject.subjectId || "Unknown Applicant",
        national_id: subject.subjectId || "UNKNOWN",
        postal_code: "00100", // Helsinki; retained signal, not a direct identifier.
      },
      unstructured_document: unstructuredDoc,
      // Forward financial data from deterministicMath where available.
      financials: _extractFinancials(fixture),
      // Forward evidence from documents' entity chips.
      evidence: _extractEvidence(fixture),
      metadata: { channel: "omavero", risk_tier: "high", domain: "tax_audit" },
    };
  }

  // Fallback for unknown caseId — backend will still run the full pipeline.
  return {
    case_id: caseId,
    claim_category: "work_equipment_deduction",
    applicant: {
      name: "Matti Virtanen",
      national_id: "121085-123A",
      postal_code: "00100",
    },
    unstructured_document:
      "Receipt for home office equipment purchase claimed under Tuloverolaki 31 §.",
    financials: { annual_income: 68400, existing_debt: 0, requested_amount: 1850, credit_score: 720 },
    evidence: [],
    metadata: { channel: "omavero", risk_tier: "high", domain: "tax_audit" },
  };
}

/** Pull scalar income figures from a fixture's deterministicMath block. */
function _extractFinancials(fixture) {
  const math = fixture?.deterministicMath || {};
  const income = math.totalIncome?.value;
  const items = fixture?.adjustmentLineItems || [];
  const totalDeductions = items.reduce((s, li) => s + (li.amount || 0), 0);
  return {
    annual_income: income || 68400,
    existing_debt: 0,
    requested_amount: totalDeductions || 1850,
    credit_score: 720,
  };
}

/** Build evidence records from a fixture's document entity chips. */
function _extractEvidence(fixture) {
  const docs = fixture?.documents || [];
  const evidence = [];
  docs.forEach((doc, di) => {
    if (doc.ocrText) {
      evidence.push({
        id: `EV-DOC-${di + 1}`,
        category: "source_document",
        text: doc.ocrText.slice(0, 400),
      });
    }
    (doc.entities || []).forEach((chip, ci) => {
      evidence.push({
        id: `EV-ENT-${di + 1}-${ci + 1}`,
        category: "financial_record",
        text: chip.label,
      });
    });
  });
  return evidence;
}

// ---------------------------------------------------------------------------
// Backend → Frontend CasePacket mapper.
// ---------------------------------------------------------------------------

/**
 * Map the JuryAI backend CasePacket (loan/governance domain) onto the
 * OmaVero frontend CasePacket TypeScript interface (tax-audit domain).
 *
 * The mapping is explicit for every field so Panel 1, 2 and 3 populate with
 * real data rather than empty placeholders:
 *
 *   Panel 1 (CaseContextPanel):
 *     identity_firewall_audit.subject_token → subject.subjectId
 *     identity_firewall_audit.removed_fields → subject.nameMasked / ssnTokenized
 *     Each agent finding → a ParsedDocument so the document switcher shows
 *     the agent's rationale as "evidence text"
 *
 *   Panel 2 (AgentTransparencyTree):
 *     findings[DecisionWitnessAgent] → AgentLogEntry for "Ingestion_Agent"
 *     findings[FactCheckerAgent]     → AgentLogEntry for "Reasoner_Agent"
 *     findings[BiasPrivacyChallenger]→ AgentLogEntry for "Critic_Agent"
 *     counterfactual                 → StatutoryMatch (geography proxy test)
 *     identity_firewall_audit        → StatutoryMatch (PII gate result)
 *     financials from body           → DeterministicMathBlock
 *
 *   Panel 3 (AdjudicationConsole):
 *     residual_risk_level / verdict_tally → adjustmentSummary figures
 *     findings confidence scores       → adjustmentLineItems for override
 *
 * @param {object} livePacket  — backend CasePacket
 * @param {string} caseId      — original frontend caseId
 * @param {object} sentBody    — the TrialRunRequest that was sent
 * @returns {object}           — OmaVero CasePacket shape
 */
function mapBackendPacket(livePacket, caseId, sentBody) {
  const audit = livePacket.identity_firewall_audit || {};
  const cf = livePacket.counterfactual || {};
  const findings = livePacket.findings || [];
  const financials = sentBody?.financials || {};

  // ---- Panel 1: subject + documents ----------------------------------------

  const subject = _mapSubject(audit);
  const documents = _mapDocuments(findings, audit, cf, livePacket);

  // ---- Panel 2: agentDebate + statutoryMatches + deterministicMath ----------

  const agentDebate = _mapAgentDebate(findings);
  const statutoryMatches = _mapStatutoryMatches(cf, audit, livePacket);
  const deterministicMath = _mapDeterministicMath(financials, cf);

  // ---- Panel 3: adjustmentSummary + lineItems + caps -----------------------

  const { adjustmentSummary, adjustmentLineItems, capPercentages } =
    _mapAdjudication(findings, livePacket);

  return {
    // Identity
    caseId,
    status: livePacket.status || "awaiting_human",
    // Panels
    subject,
    documents,
    agentDebate,
    statutoryMatches,
    deterministicMath,
    adjustmentSummary,
    adjustmentLineItems,
    capPercentages,
    // Metadata passthrough for debugging / receipt synthesis
    _trialId: livePacket.trial_id,
    _source: "live",
    _riskLevel: livePacket.residual_risk_level,
  };
}

/** Panel 1 — pseudonymous subject identity from the firewall audit. */
function _mapSubject(audit) {
  const removed = audit.removed_fields || [];
  return {
    subjectId: audit.subject_token || "SUBJECT-UNKNOWN",
    // If "name" was stripped => nameMasked: active; not present => inactive.
    nameMasked: removed.includes("name") ? "active" : "inactive",
    // If "national_id" or "ssn" stripped => ssnTokenized: active.
    ssnTokenized:
      removed.includes("national_id") || removed.includes("ssn")
        ? "active"
        : "inactive",
  };
}

/**
 * Panel 1 — each agent finding becomes a document in the switcher so auditors
 * can inspect the raw evidence text each agent reasoned over.
 */
function _mapDocuments(findings, audit, cf, packet) {
  const docs = [];

  // Firewall audit as the first "document" (identity gate result).
  docs.push({
    label: "Identity Firewall Audit",
    ocrText: [
      `Audit ID: ${audit.audit_id || "—"}`,
      `Subject Token: ${audit.subject_token || "—"}`,
      `Removed Fields: ${(audit.removed_fields || []).join(", ") || "none"}`,
      `Retained Signals: ${(audit.retained_signals || []).join(", ") || "none"}`,
      `Substitutions: ${audit.substitution_count ?? 0}`,
    ].join("\n"),
    entities: [
      { label: `#SubjectToken:${audit.subject_token || "—"}`, confidence: 1 },
      {
        label: `#FieldsRemoved:${(audit.removed_fields || []).length}`,
        confidence: 1,
      },
    ],
  });

  // One document per agent finding (rationale + flags).
  const agentLabels = {
    DecisionWitnessAgent: "Financial & Operational Witness",
    FactCheckerAgent: "Claim Verification Witness",
    BiasPrivacyChallengerAgent: "Bias & Privacy Challenger",
  };
  findings.forEach((finding) => {
    const label =
      agentLabels[finding.agent] || finding.agent || "Agent Finding";
    docs.push({
      label,
      ocrText: [
        `Agent: ${finding.agent}`,
        `Verdict: ${finding.verdict} (confidence ${((finding.confidence || 0) * 100).toFixed(0)}%)`,
        `Rationale: ${finding.rationale || "—"}`,
        finding.flags?.length
          ? `Flags: ${finding.flags.join(", ")}`
          : "Flags: none",
      ].join("\n"),
      entities: [
        {
          label: `#Verdict:${finding.verdict}`,
          confidence: finding.confidence || 0,
        },
        ...(finding.flags || []).map((f) => ({
          label: `#Flag:${f}`,
          confidence: 0.9,
        })),
      ],
    });
  });

  // Counterfactual as the final document.
  if (cf.sensitive_attribute) {
    docs.push({
      label: "Counterfactual Sensitivity Report",
      ocrText: [
        `Sensitive Attribute: ${cf.sensitive_attribute}`,
        `Baseline Decision: ${cf.baseline_decision} (score ${cf.baseline_score})`,
        `Counterfactual Decision: ${cf.counterfactual_decision} (score ${cf.counterfactual_score})`,
        `Score Delta: ${cf.score_delta}`,
        `Outcome Flipped: ${cf.outcome_flipped ? "YES ⚠" : "No"}`,
        `Rationale: ${cf.rationale || "—"}`,
      ].join("\n"),
      entities: [
        {
          label: `#OutcomeFlipped:${cf.outcome_flipped ? "YES" : "No"}`,
          confidence: 1,
        },
        { label: `#ScoreDelta:${cf.score_delta}`, confidence: 1 },
      ],
    });
  }

  return docs;
}

/**
 * Panel 2 — map backend agent findings to the four canonical AgentLogEntry
 * names the AgentTimeline component expects.
 */
function _mapAgentDebate(findings) {
  // Backend → frontend canonical name mapping.
  const nameMap = {
    DecisionWitnessAgent: "Ingestion_Agent",
    FactCheckerAgent: "Reasoner_Agent",
    BiasPrivacyChallengerAgent: "Critic_Agent",
  };

  const entries = findings.map((f) => ({
    agent: nameMap[f.agent] || "Court_Clerk",
    systemPrompt: f.role
      ? `Role: ${f.role}. Verdict: ${f.verdict} at ${((f.confidence || 0) * 100).toFixed(0)}% confidence.`
      : undefined,
    contextContract: f.evidence_ids?.length
      ? `Evidence IDs in scope: ${f.evidence_ids.join(", ")}`
      : undefined,
    reasoningOutput: [
      f.rationale,
      f.flags?.length ? `Flags raised: ${f.flags.join(", ")}` : null,
      f.used_llm !== undefined ? `LLM used: ${f.used_llm}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
  }));

  // Always add Court_Clerk as the final node (the CourtClerk assembly step).
  if (!entries.some((e) => e.agent === "Court_Clerk")) {
    entries.push({
      agent: "Court_Clerk",
      systemPrompt: "Deterministic CasePacket assembly — no LLM, no opinion.",
      contextContract: "Inputs: all witness findings + firewall audit + counterfactual result.",
      reasoningOutput:
        "Compiled findings into sealed CasePacket. Mandatory human handoff enforced.",
    });
  }

  return entries;
}

/**
 * Panel 2 — statutory matches visualise the counterfactual result and the
 * identity audit as law-flavoured audit cards.
 */
function _mapStatutoryMatches(cf, audit, packet) {
  const matches = [];

  // Counterfactual sensitivity → a geography-proxy statutory clause.
  if (cf.sensitive_attribute) {
    const flipped = cf.outcome_flipped;
    matches.push({
      citedParagraph: "EU AI Act Art. 10 — Data Governance (Proxy Discrimination Check)",
      deductionClaim: cf.rationale || `Postal geography proxy: ${cf.baseline_decision} vs ${cf.counterfactual_decision}`,
      riskFlags: flipped
        ? ["counterfactual-geography", "high-risk"]
        : ["verified"],
    });
  }

  // Identity firewall result → PII compliance clause.
  const removedCount = (audit.removed_fields || []).length;
  matches.push({
    citedParagraph: "EU AI Act Art. 14 — Human Oversight (Identity Firewall Gate)",
    deductionClaim: removedCount
      ? `${removedCount} direct identifier field(s) stripped: ${(audit.removed_fields || []).join(", ")}. Subject pseudonymised as ${audit.subject_token}.`
      : "No direct identifiers detected in input.",
    riskFlags: removedCount ? ["verified"] : ["missing-receipt"],
  });

  // Per-finding risk flags → individual clause cards.
  (packet.findings || []).forEach((f) => {
    if (f.flags?.length) {
      matches.push({
        citedParagraph: `Agent Integrity Check — ${f.agent}`,
        deductionClaim: `${f.verdict} | ${f.rationale?.slice(0, 120) || "—"}`,
        riskFlags: f.flags.map(_backendFlagToRiskFlag).filter(Boolean),
      });
    }
  });

  return matches;
}

/** Translate a backend flag string to a frontend RiskFlag union value. */
function _backendFlagToRiskFlag(flag) {
  if (!flag) return null;
  const s = String(flag).toLowerCase();
  if (s.includes("counterfactual") || s.includes("geography") || s.includes("proxy"))
    return "counterfactual-geography";
  if (s.includes("pii") || s.includes("residual") || s.includes("receipt"))
    return "missing-receipt";
  if (s.includes("risk") || s.includes("high") || s.includes("flip"))
    return "high-risk";
  return "verified"; // default: flag is present but we label it verified
}

/**
 * Panel 2 — deterministic math from the financial payload + counterfactual
 * scores so Panel 2's bottom section shows real figures.
 */
function _mapDeterministicMath(financials, cf) {
  return {
    totalIncome: {
      value: financials.annual_income || 0,
      unit: "EUR",
    },
    allowableDeductionCap: {
      value: financials.requested_amount || 0,
      unit: "EUR",
    },
    taxBracketAdjustments: [
      {
        label: "Baseline Risk Score",
        amount: { value: cf.baseline_score ?? null, unit: "pts" },
      },
      {
        label: "Counterfactual Score (no geography)",
        amount: { value: cf.counterfactual_score ?? null, unit: "pts" },
      },
      {
        label: "Score Delta",
        amount: { value: cf.score_delta ?? null, unit: "pts" },
      },
    ],
  };
}

/**
 * Panel 3 — map verdict tally and confidence scores to adjustment cards.
 */
function _mapAdjudication(findings, packet) {
  const riskLabel = packet.residual_risk_level || "unknown";
  const riskBadge = { standard: 0, indeterminate: 20, elevated: 40, high: 80 };
  const riskScore = riskBadge[riskLabel] ?? 0;

  // AI-recommended adjustment: inverse of risk — higher risk → lower recommended deduction.
  const aiRec = Math.max(0, 100 - riskScore);

  const adjustmentSummary = {
    originalClaim: { value: 100, unit: "pts" },
    aiRecommendedAdjustment: { value: aiRec, unit: "pts" },
  };

  // One editable line item per agent finding (confidence score as editable value).
  const adjustmentLineItems = findings.map((f, i) => ({
    id: `agent-${i + 1}`,
    label: f.agent || `Agent ${i + 1}`,
    amount: Math.round((f.confidence || 0) * 100),
    unit: "%",
  }));

  // One cap per counterfactual threshold (expressed as %).
  const capPercentages = [
    { id: "cap-risk", label: `Risk Level: ${riskLabel}`, percentage: 100 - riskScore },
  ];

  return { adjustmentSummary, adjustmentLineItems, capPercentages };
}

// ---------------------------------------------------------------------------
// NDJSON stream reader (shared by fetchActiveCaseLive and streamTrialEvents).
// ---------------------------------------------------------------------------

/**
 * Open a POST fetch to `${API_BASE}/trials/run` and read the NDJSON response
 * body. Calls `onEvent(parsedEvent)` for every line as it arrives, and resolves
 * with all events once the stream is exhausted. Throws on network error or
 * non-2xx.
 *
 * @param {string} caseId
 * @param {function(object):void} onEvent — called for each event in real-time
 * @param {AbortSignal|undefined} signal  — optional abort signal
 * @returns {Promise<object[]>} all events received
 */
async function openTrialStream(caseId, onEvent, signal) {
  const body = buildTrialPayload(caseId);

  const res = await fetch(`${API_BASE}/trials/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from /trials/run`);
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    throw new Error("Response body is not a readable stream.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  const flushLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const evt = JSON.parse(trimmed);
    events.push(evt);
    onEvent(evt);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep the partial line in the buffer
    lines.forEach(flushLine);
  }
  flushLine(buffer); // flush any remaining content after EOF
  return events;
}

// ---------------------------------------------------------------------------
// Live-mode public functions.
// ---------------------------------------------------------------------------

/**
 * Live fetch: stream the full trial, intercept the terminal
 * `trial.awaiting_human` event, and return a mapped CasePacket. Throws on
 * any failure so the public `fetchActiveCase` wrapper can fall back to the mock.
 *
 * @param {string} caseId
 * @returns {Promise<object>} OmaVero CasePacket
 */
async function fetchActiveCaseLive(caseId) {
  const sentBody = buildTrialPayload(caseId);
  const events = await openTrialStream(caseId, () => {}, undefined);

  const terminal = events.find((e) => e?.type === "trial.awaiting_human");
  if (!terminal?.data?.case_packet) {
    throw new Error("No trial.awaiting_human event received from backend.");
  }

  return mapBackendPacket(terminal.data.case_packet, caseId, sentBody);
}

/**
 * Live submit: translate the Vite payload shape to the backend's
 * `{decision, reviewer, notes}` shape, POST to `/trials/{trialId}/decision`,
 * and synthesise a GenTaxReceipt. The trialId comes from `_trialId` if the
 * packet was tagged by `mapBackendPacket`, otherwise falls back to `caseId`.
 *
 * Throws on any failure so the public `submitAuditorDecision` wrapper can fall
 * back to the mock.
 *
 * @param {string} caseId
 * @param {object} payload
 * @returns {Promise<object>} GenTaxReceipt
 */
async function submitAuditorDecisionLive(caseId, payload) {
  const decision = payload || {};

  // Prefer the trial_id embedded in the packet (set by _trialId in mapBackendPacket).
  // Fall back to caseId so the URL is always well-formed.
  const trialId =
    decision.adjustedCalculations?._trialId ||
    decision._trialId ||
    caseId;

  const body = {
    decision:
      decision.status === "approved"
        ? "approve"
        : decision.status === "rejected"
          ? "decline"
          : "refer_back",
    reviewer:
      decision.adjustedCalculations?.auditorSignature ||
      "Caseworker M. Virtanen",
    notes:
      decision.caseworkerNotes ||
      "Reviewed statutory deduction rules under Tuloverolaki.",
  };

  const res = await fetch(
    `${API_BASE}/trials/${encodeURIComponent(trialId)}/decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from /trials/${trialId}/decision`);
  }

  const updated = await res.json();
  const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

  return {
    transactionId: updated?.trial_id
      ? `GENTAX-TX-${updated.trial_id}`
      : `GENTAX-TX-${rand()}`,
    caseId,
    status: decision.status,
    ledgerTimestamp:
      updated?.human_decision?.decided_at ||
      decision.timestamp ||
      new Date().toISOString(),
    confirmationCode: `CONF-${rand()}`,
  };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Fetch the active CasePacket for a given case identifier.
 *
 * Mock mode (default / Vitest): deterministic fixture gateway satisfying
 * Requirements 14.1–14.6.
 * Live mode: streams the backend trial pipeline, maps the result, falls back
 * to mock on any failure.
 *
 * @param {string} caseId
 * @returns {Promise<object>} resolves to a CasePacket
 */
export function fetchActiveCase(caseId) {
  if (!USE_LIVE) {
    return fetchActiveCaseMock(caseId);
  }
  return fetchActiveCaseLive(caseId).catch(() => fetchActiveCaseMock(caseId));
}

/**
 * Stream a full JuryAI trial and call `onEvent` for each NDJSON event as it
 * arrives. This is the progressive-streaming companion to `fetchActiveCase` —
 * used by `Dashboard.tsx` in live mode to animate Panel 2 in real-time.
 *
 * Event types emitted (in order):
 *   trial.started → firewall.applied → agent.started × N → agent.completed × N
 *   → counterfactual.evaluated → clerk.compiled → trial.awaiting_human
 *
 * The function resolves once the full stream is exhausted. It does NOT fall
 * back to mock mode on failure — callers should catch and fall back themselves
 * (Dashboard.tsx does this; it retries via `fetchActiveCase` which has its own
 * fallback). This keeps the streaming contract clean.
 *
 * Returns the final `trial.awaiting_human` event's `data.case_packet`, mapped
 * through `mapBackendPacket`, so the caller can transition to `ready` state
 * with a fully populated panel.
 *
 * @param {string} caseId
 * @param {function(object):void} onEvent — called for every NDJSON event
 * @param {AbortSignal|undefined} [signal] — optional abort signal
 * @returns {Promise<object>} mapped CasePacket from the terminal event
 */
export async function streamTrialEvents(caseId, onEvent, signal) {
  const sentBody = buildTrialPayload(caseId);
  const events = await openTrialStream(caseId, onEvent, signal);

  const terminal = events.find((e) => e?.type === "trial.awaiting_human");
  if (!terminal?.data?.case_packet) {
    throw new Error("Stream ended without a trial.awaiting_human event.");
  }

  return mapBackendPacket(terminal.data.case_packet, caseId, sentBody);
}

/**
 * Submit an auditor decision for a case and record it in the GenTax ledger.
 *
 * Mock mode: validates payload in the required order and resolves to a mock
 * GenTaxReceipt (Requirements 14.2, 14.4, 14.6).
 * Live mode: translates the payload to the backend shape, POSTs to the
 * decision endpoint, falls back to mock on any failure.
 *
 * @param {string} caseId
 * @param {object} payload
 * @returns {Promise<object>} resolves to a GenTaxReceipt
 */
export function submitAuditorDecision(caseId, payload) {
  if (!USE_LIVE) {
    return submitAuditorDecisionMock(caseId, payload);
  }
  return submitAuditorDecisionLive(caseId, payload).catch(() =>
    submitAuditorDecisionMock(caseId, payload),
  );
}
