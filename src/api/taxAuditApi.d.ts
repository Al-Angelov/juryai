// Ambient type declarations for the plain-JS Tax_Audit_API module
// (taxAuditApi.js). The runtime module stays plain JavaScript with no IDE
// runtime coupling (Requirement 14.3); this co-located `.d.ts` supplies the
// public contract's types so TypeScript consumers (including the API tests)
// see real return shapes instead of `object`.
//
// A `.d.ts` sitting next to `taxAuditApi.js` is picked up as that module's
// type declarations, taking precedence over the inferred JS types without
// altering the JavaScript source.

import type { CasePacket } from "../types/casePacket";
import type { GenTaxReceipt } from "../types/decision";

/**
 * Fetch the active CasePacket for a given case identifier.
 *
 * Rejects (Requirement 14.5) when `caseId` is empty, exceeds 128 characters,
 * or does not correspond to a known case. Resolves (Requirement 14.1) to a
 * complete CasePacket within the simulated latency ceiling.
 */
export function fetchActiveCase(caseId: string): Promise<CasePacket>;

/**
 * Submit an auditor decision for a case and record it in the mocked GenTax
 * ledger. `payload` is intentionally typed as `unknown` because the runtime
 * validates its shape and the tests exercise both valid and malformed payloads
 * (Requirements 14.2, 14.4, 14.6). Resolves to a GenTaxReceipt on success.
 */
export function submitAuditorDecision(
  caseId: string,
  payload: unknown,
): Promise<GenTaxReceipt>;

/**
 * Stream a full JuryAI trial, calling `onEvent` for each NDJSON event as it
 * arrives. Resolves to a mapped CasePacket derived from the terminal
 * `trial.awaiting_human` event once the stream is exhausted.
 *
 * Only active when `VITE_USE_LIVE_BACKEND === "true"`. Throws on network
 * failure so callers can fall back to `fetchActiveCase`.
 *
 * @param caseId   The case identifier to trial-run.
 * @param onEvent  Callback invoked for every parsed NDJSON event.
 * @param signal   Optional AbortSignal to cancel the in-flight stream.
 */
export function streamTrialEvents(
  caseId: string,
  onEvent: (event: { type: string; data?: Record<string, unknown> }) => void,
  signal?: AbortSignal,
): Promise<CasePacket>;
