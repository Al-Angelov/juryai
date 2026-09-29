// Pure decision helpers for the Adjudication_Console's DecisionActions.
//
// This module holds the fail-safe gating predicates and the Auditor_Decision
// payload builders. Everything here is a pure function with no React or DOM
// dependency, so the gating rules and payload shapes can be unit- and
// property-tested directly, independent of any component. Gating is enforced in
// state (not just visually) per the design's "Fail-safe gating of binding
// actions" goal.
//
// Approve gating (Requirements 11.3, 11.7, 13.2):
//   enabled iff trimmed signature is non-empty AND compliance is checked AND
//   no submission is in flight.
//
// Reject gating (Requirements 12.3):
//   enabled iff the rationale (trimmed) is non-empty AND no submission is in
//   flight.
//
// Rationale validity (Requirements 12.2, 12.4):
//   the trimmed rationale length must be in the inclusive range 1..2000.
//
// Payload builders (Requirements 11.4, 13.3, 12.4):
//   assemble the discriminated `AuditorDecisionApproved` / `AuditorDecisionRejected`
//   payloads with all required fields, defaulting the timestamp to the current
//   time (ISO 8601) when the caller does not supply one.
//
// _Requirements: 11.3, 11.4, 11.7, 12.2, 12.3, 12.4, 13.2, 13.3_

import type {
  AdjustedCalculations,
  AuditorDecisionApproved,
  AuditorDecisionRejected,
} from "../types/decision";

/** Maximum accepted rationale length, in trimmed characters (Requirement 12.2). */
export const RATIONALE_MAX_LENGTH = 2000;

/** Minimum accepted rationale length, in trimmed characters (Requirement 12.2). */
export const RATIONALE_MIN_LENGTH = 1;

/**
 * Whether a rejection rationale is valid: its trimmed length must fall within
 * the inclusive range `[1, 2000]`. A rationale that is empty or contains only
 * whitespace is invalid, as is one that exceeds 2,000 characters after
 * trimming.
 *
 * Trimming is applied before measuring so that leading/trailing whitespace
 * neither satisfies the non-empty requirement nor counts toward the maximum.
 *
 * _Requirements: 12.2, 12.4_
 */
export function isRationaleValid(rationale: string): boolean {
  const length = rationale.trim().length;
  return length >= RATIONALE_MIN_LENGTH && length <= RATIONALE_MAX_LENGTH;
}

/** Inputs to the Approve gating predicate. */
export interface CanApproveInput {
  /** Raw auditor signature field value (trimmed before evaluation). */
  signature: string;
  /** Whether the Article 14 Compliance_Confirmation checkbox is checked. */
  complianceConfirmed: boolean;
  /** Whether an Auditor_Decision submission is currently in flight. */
  submitting: boolean;
}

/**
 * Whether the Approve control should be enabled. Approve is a binding action,
 * so it is gated: the trimmed signature must be non-empty, the Article 14
 * compliance certification must be checked, and no submission may be in flight.
 *
 * Because the control is disabled whenever compliance is unchecked, an approved
 * submission cannot be initiated without the Article 14 certification.
 *
 * _Requirements: 11.3, 11.7, 13.2_
 */
export function canApprove({
  signature,
  complianceConfirmed,
  submitting,
}: CanApproveInput): boolean {
  return signature.trim().length > 0 && complianceConfirmed && !submitting;
}

/** Inputs to the Reject gating predicate. */
export interface CanRejectInput {
  /** Raw rationale field value (trimmed before evaluation). */
  rationale: string;
  /** Whether an Auditor_Decision submission is currently in flight. */
  submitting: boolean;
}

/**
 * Whether the Reject control should be enabled. Reject requires a mandatory,
 * documented rationale, so it is gated: the trimmed rationale must be non-empty
 * and no submission may be in flight.
 *
 * _Requirements: 12.3_
 */
export function canReject({ rationale, submitting }: CanRejectInput): boolean {
  return rationale.trim().length > 0 && !submitting;
}

/** Inputs to the approved-decision payload builder. */
export interface BuildApprovedDecisionInput {
  adjustedCalculations: AdjustedCalculations;
  caseworkerNotes: string;
  auditorSignature: string;
  complianceConfirmation: boolean;
  /** ISO 8601 timestamp; defaults to the current time when omitted. */
  timestamp?: string;
}

/**
 * Build an approved Auditor_Decision payload. The payload always includes the
 * status `approved`, the adjusted calculations, the caseworker notes, the
 * entered auditor signature, the Compliance_Confirmation state as a boolean,
 * and a timestamp. When no timestamp is supplied it defaults to the current
 * time as an ISO 8601 string.
 *
 * _Requirements: 11.4, 13.3_
 */
export function buildApprovedDecision({
  adjustedCalculations,
  caseworkerNotes,
  auditorSignature,
  complianceConfirmation,
  timestamp,
}: BuildApprovedDecisionInput): AuditorDecisionApproved {
  return {
    status: "approved",
    adjustedCalculations,
    caseworkerNotes,
    auditorSignature,
    complianceConfirmation,
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

/** Inputs to the rejected-decision payload builder. */
export interface BuildRejectedDecisionInput {
  rationale: string;
  adjustedCalculations: AdjustedCalculations;
  caseworkerNotes: string;
  /** ISO 8601 timestamp; defaults to the current time when omitted. */
  timestamp?: string;
}

/**
 * Build a rejected Auditor_Decision payload. The payload always includes the
 * status `rejected`, the rationale, the adjusted calculations, the caseworker
 * notes, and a timestamp. When no timestamp is supplied it defaults to the
 * current time as an ISO 8601 string.
 *
 * This builder assembles the payload as given; callers gate submission on
 * `isRationaleValid` / `canReject` before invoking it.
 *
 * _Requirements: 12.4_
 */
export function buildRejectedDecision({
  rationale,
  adjustedCalculations,
  caseworkerNotes,
  timestamp,
}: BuildRejectedDecisionInput): AuditorDecisionRejected {
  return {
    status: "rejected",
    rationale,
    adjustedCalculations,
    caseworkerNotes,
    timestamp: timestamp ?? new Date().toISOString(),
  };
}
