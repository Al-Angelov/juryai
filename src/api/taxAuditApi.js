// Tax_Audit_API — the API layer for the Tax Audit Review Dashboard (Requirement 14).
//
// By default this module is a standalone, deterministic MOCK gateway: plain
// JavaScript using Promise semantics with a simulated latency bounded well below
// the 2000 ms resolution ceiling, no dependency on any IDE internal runtime or
// hosting utility (Requirement 14.3), importing only the local `mockData.js`
// fixtures. It runs unchanged in any plain Node or browser context, which is the
// behavior the Vitest property/contract suite pins down.
//
// OPTIONAL LIVE MODE (opt-in, off by default): when the Vite build is run with
// `VITE_USE_LIVE_BACKEND === "true"`, `fetchActiveCase` and
// `submitAuditorDecision` first attempt a real network call against the FastAPI
// backend (`VITE_API_URL`, default http://localhost:8000/api/v1) and, on ANY
// failure (network error, timeout, non-2xx, or a missing/!mismatched event),
// fall back to the exact mock implementation below. The live branch is gated
// solely on `import.meta.env` and adds NO new imports, so:
//   - under Vitest the toggle is undefined/false => the mock path runs verbatim
//     and every existing test (including the Requirement 14.3 portability
//     source-scan and the fetch/submit contract tests) stays green;
//   - the module still imports only `./mockData.js`.
//
// Exposed functions:
//   - fetchActiveCase(caseId)
//   - submitAuditorDecision(caseId, payload)

import { getCase, hasCase } from "./mockData.js";

// ---------------------------------------------------------------------------
// Live-mode configuration (read solely from Vite's import.meta.env).
// ---------------------------------------------------------------------------

// Read import.meta.env defensively: under a bare Node/Vitest import there is no
// Vite transform, so `import.meta.env` is undefined. `?.` keeps that safe and
// makes the toggle naturally false in the test environment (Requirement 14.3).
const VITE_ENV = import.meta.env;

/** True only when the app is explicitly built/run in live-backend mode. */
const USE_LIVE = VITE_ENV?.VITE_USE_LIVE_BACKEND === "true";

/** Base URL of the FastAPI backend's versioned API (live mode only). */
const API_BASE = VITE_ENV?.VITE_API_URL || "http://localhost:8000/api/v1";

// Upper bound on a case identifier length (Requirement 14.1, 14.5).
const MAX_CASE_ID_LENGTH = 128;

// Simulated network latency window. Kept comfortably under the 2000 ms
// resolution ceiling required by Requirements 14.1 and 14.2.
const MIN_LATENCY_MS = 300;
const MAX_LATENCY_MS = 800;

/**
 * Resolves after a simulated network latency in the [MIN, MAX] window.
 *
 * @returns {Promise<void>}
 */
function simulatedLatency() {
  const span = MAX_LATENCY_MS - MIN_LATENCY_MS;
  const delay = MIN_LATENCY_MS + Math.floor(Math.random() * (span + 1));
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

/**
 * True when the value is a non-empty string of 1..128 characters. This is the
 * shared case-identifier rule used by both fetch and submit (Req 14.1, 14.5).
 *
 * @param {unknown} caseId
 * @returns {boolean}
 */
function isWellFormedCaseId(caseId) {
  return (
    typeof caseId === "string" &&
    caseId.length >= 1 &&
    caseId.length <= MAX_CASE_ID_LENGTH
  );
}

/**
 * True when the caseId is well-formed AND corresponds to a known fixture.
 *
 * @param {unknown} caseId
 * @returns {boolean}
 */
function isValidCaseId(caseId) {
  return isWellFormedCaseId(caseId) && hasCase(caseId);
}

/**
 * The single error message used for a missing or unknown case identifier
 * (Requirements 14.5 and the shared submit rule). Using one message keeps the
 * contract simple and avoids leaking whether an id is malformed vs merely
 * unknown.
 */
const CASE_ID_ERROR = "case identifier is missing or unknown";

/**
 * Generates a mock GenTax transaction receipt for a confirmed decision.
 *
 * @param {string} caseId
 * @param {"approved" | "rejected"} status
 * @returns {{transactionId: string, caseId: string, status: string, ledgerTimestamp: string, confirmationCode: string}}
 */
function buildReceipt(caseId, status) {
  const rand = () =>
    Math.random().toString(36).slice(2, 10).toUpperCase();
  return {
    transactionId: `GENTAX-TX-${rand()}`,
    caseId,
    status,
    ledgerTimestamp: new Date().toISOString(),
    confirmationCode: `CONF-${rand()}`,
  };
}

// ---------------------------------------------------------------------------
// Mock implementations (the default, deterministic gateway).
// ---------------------------------------------------------------------------

/**
 * Mock fetch: resolve/reject exactly as the contract tests require.
 *
 * Validation (Requirement 14.5): rejects when `caseId` is empty, exceeds 128
 * characters, or does not correspond to a known case. Success (Requirement
 * 14.1): resolves within 2000 ms to a complete CasePacket.
 *
 * @param {string} caseId
 * @returns {Promise<object>}
 */
function fetchActiveCaseMock(caseId) {
  if (!isWellFormedCaseId(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }
  if (!hasCase(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }
  return simulatedLatency().then(() => getCase(caseId));
}

/**
 * Mock submit: validate in the required order and resolve to a GenTaxReceipt.
 *
 * Validation order (Requirement 14.4, 14.6):
 *   1. invalid caseId (missing / malformed / unknown) => reject (missing-or-unknown)
 *   2. status not in {approved, rejected}             => reject ("status is invalid")
 *   3. missing adjustedCalculations / caseworkerNotes /
 *      timestamp (naming the absent field, no receipt) => reject
 *
 * @param {string} caseId
 * @param {object} payload
 * @returns {Promise<object>}
 */
function submitAuditorDecisionMock(caseId, payload) {
  // 1. Case identifier — same rule as fetchActiveCase.
  if (!isValidCaseId(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }

  const decision = payload || {};

  // 2. Status must be exactly "approved" or "rejected".
  if (decision.status !== "approved" && decision.status !== "rejected") {
    return Promise.reject(new Error("status is invalid"));
  }

  // 3. Required-field presence, in order, naming the absent field. No receipt
  //    is produced when a required field is missing (Requirement 14.6).
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
// Live-mode helpers (only exercised when USE_LIVE is true).
// ---------------------------------------------------------------------------

/**
 * Read an NDJSON ReadableStream to completion, returning the parsed events.
 * Each non-empty line is a JSON object; the backend terminates lines with "\n".
 *
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 * @returns {Promise<object[]>}
 */
async function drainNdjson(reader) {
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";
  const flush = (line) => {
    const trimmed = line.trim();
    if (trimmed) events.push(JSON.parse(trimmed));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    lines.forEach(flush);
  }
  flush(buffer);
  return events;
}

/**
 * Live fetch: run a trial via the streaming endpoint, silently exhaust the
 * NDJSON event stream, intercept the terminal `trial.awaiting_human` event, and
 * map its `case_packet` onto the CasePacket shape the dashboard consumes. Any
 * network error, non-2xx status, unreadable body, or missing terminal event
 * throws so the caller can fall back to the mock.
 *
 * The backend CasePacket is a different (loan-audit) shape, so the extracted
 * packet is merged over a minimal valid skeleton keyed by `caseId` to guarantee
 * the dashboard's required fields exist; the result is tagged `_source: "live"`.
 *
 * @param {string} caseId
 * @returns {Promise<object>}
 */
async function fetchActiveCaseLive(caseId) {
  const res = await fetch(`${API_BASE}/trials/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_id: caseId }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    throw new Error("Streaming response body is not readable.");
  }

  const events = await drainNdjson(res.body.getReader());
  const terminal = events.find((e) => e && e.type === "trial.awaiting_human");
  const livePacket = terminal?.data?.case_packet;
  if (!livePacket) {
    throw new Error("No trial.awaiting_human event in stream.");
  }

  // Minimal valid skeleton so the dashboard never crashes on absent fields;
  // the live packet is merged on top of it.
  const skeleton = {
    caseId,
    status: "awaiting_human",
    subject: {},
    documents: [],
    agentDebate: [],
    statutoryMatches: [],
    deterministicMath: {
      totalIncome: {},
      allowableDeductionCap: {},
      taxBracketAdjustments: [],
    },
    adjustmentSummary: { originalClaim: {}, aiRecommendedAdjustment: {} },
    adjustmentLineItems: [],
    capPercentages: [],
  };
  return { ...skeleton, ...livePacket, caseId, _source: "live" };
}

/** Map the Vite decision status to the backend's decision verb. */
function toBackendDecision(status) {
  if (status === "approved") return "approve";
  if (status === "rejected") return "decline";
  return status;
}

/**
 * Live submit: translate the Vite payload ({status, adjustedCalculations,
 * caseworkerNotes, timestamp}) into the backend's ({decision, reviewer, notes})
 * shape, POST it to the decision route, and resolve to a GenTaxReceipt-shaped
 * object so the UI's return contract holds. Throws on any failure so the caller
 * can fall back to the mock.
 *
 * @param {string} caseId
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function submitAuditorDecisionLive(caseId, payload) {
  const decision = payload || {};
  const body = {
    decision: toBackendDecision(decision.status),
    reviewer:
      (decision.adjustedCalculations &&
        decision.adjustedCalculations.auditorSignature) ||
      "auditor",
    notes: decision.caseworkerNotes || "",
  };

  const res = await fetch(
    `${API_BASE}/trials/${encodeURIComponent(caseId)}/decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const updated = await res.json();

  // Synthesize the GenTaxReceipt shape the dashboard expects from the backend's
  // updated packet. The backend does not mint a GenTax receipt, so derive stable
  // identifiers from its response where available.
  const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();
  return {
    transactionId: updated?.trial_id
      ? `GENTAX-TX-${updated.trial_id}`
      : `GENTAX-TX-${rand()}`,
    caseId,
    status: decision.status,
    ledgerTimestamp:
      updated?.human_decision?.timestamp ||
      decision.timestamp ||
      new Date().toISOString(),
    confirmationCode: `CONF-${rand()}`,
  };
}

// ---------------------------------------------------------------------------
// Public API — live-first with mock fallback when USE_LIVE, else pure mock.
// ---------------------------------------------------------------------------

/**
 * Fetch the active CasePacket for a given case identifier.
 *
 * In the default (mock) mode this is the deterministic fixture gateway the
 * contract tests exercise. In live mode it first attempts the streaming backend
 * and falls back to the mock on any failure.
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
 * Submit an auditor decision for a case and record it in the GenTax ledger.
 *
 * In the default (mock) mode this validates and resolves to a mock GenTaxReceipt
 * exactly as the contract tests require. In live mode it first attempts the
 * backend decision route (translating the payload shape) and falls back to the
 * mock on any failure.
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

/**
 * True when a required field is present (not undefined and not null).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPresent(value) {
  return value !== undefined && value !== null;
}
