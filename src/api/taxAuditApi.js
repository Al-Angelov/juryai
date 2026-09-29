// Tax_Audit_API — the standalone mocked API layer for the Tax Audit Review
// Dashboard (Requirement 14).
//
// This module is plain JavaScript using Promise semantics with a simulated
// latency bounded well below the 2000 ms resolution ceiling. It has NO
// dependency on any IDE internal runtime or hosting utility (Requirement 14.3):
// it relies only on standard `Promise`, `setTimeout`, `Math`, and `Date`, plus
// the local `mockData.js` fixtures. It can be imported and run in any plain
// Node or browser context.
//
// Exposed functions:
//   - fetchActiveCase(caseId)
//   - submitAuditorDecision(caseId, payload)

import { getCase, hasCase } from "./mockData.js";

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

/**
 * Fetch the active CasePacket for a given case identifier.
 *
 * Validation (Requirement 14.5): rejects when `caseId` is empty, exceeds 128
 * characters, or does not correspond to a known case; the rejection carries an
 * Error whose message indicates the identifier is missing or unknown.
 *
 * Success (Requirement 14.1): resolves within 2000 ms (simulated latency
 * ~300–800 ms) to a complete CasePacket.
 *
 * @param {string} caseId
 * @returns {Promise<object>} resolves to a CasePacket
 */
export function fetchActiveCase(caseId) {
  if (!isWellFormedCaseId(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }
  if (!hasCase(caseId)) {
    return Promise.reject(new Error(CASE_ID_ERROR));
  }
  return simulatedLatency().then(() => getCase(caseId));
}

/**
 * Submit an auditor decision for a case and record it in the (mocked) GenTax
 * ledger.
 *
 * Validation order (Requirement 14.4, 14.6) — enforced exactly as specified:
 *   1. invalid caseId (missing / malformed / unknown)      => reject (missing-or-unknown)
 *   2. status not in {approved, rejected}                  => reject ("status is invalid")
 *   3. missing adjustedCalculations / caseworkerNotes /
 *      timestamp (naming the absent field, no receipt)     => reject
 *
 * Status is validated before required-field presence, so an invalid status is
 * reported as such even when other fields are also missing.
 *
 * Success (Requirement 14.2): resolves within 2000 ms to a GenTaxReceipt.
 *
 * @param {string} caseId
 * @param {object} payload
 * @returns {Promise<object>} resolves to a GenTaxReceipt
 */
export function submitAuditorDecision(caseId, payload) {
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

/**
 * True when a required field is present (not undefined and not null).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPresent(value) {
  return value !== undefined && value !== null;
}
