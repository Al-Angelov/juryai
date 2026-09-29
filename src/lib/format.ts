// Percent and currency/value formatting helpers for the Tax Audit Review Dashboard.
//
// These are pure functions with no dependency on React or the DOM so they can be
// unit- and property-tested in isolation (Property 26). They cover:
//   - confidence formatting: normalize -> clamp [0,100] -> round -> append "%"
//     (Requirements 4.3, 4.5)
//   - value + unit rendering for deterministic and monetary values, rendered
//     exactly as provided, with an unavailable indicator when the value is absent
//     (Requirements 8.3, 9.1, 9.2)
//
// A single shared UNAVAILABLE indicator is exported and used consistently for
// every "value is absent" path (Requirements 4.5, 8.4, 9.5).

import type { DeterministicValue, MonetaryValue } from "../types/casePacket.ts";

/**
 * Shared indicator rendered wherever a value is unavailable/absent in the
 * CasePacket. Used consistently across confidence, deterministic, and monetary
 * value rendering (Requirements 4.5, 8.4, 9.5).
 */
export const UNAVAILABLE = "—";

/**
 * Format a confidence score as a whole-percent string with a trailing "%".
 *
 * Confidence in the CasePacket may be expressed either as a fraction in [0, 1]
 * or as a percentage in [0, 100]. Values at or below 1 are treated as a
 * fraction and scaled by 100 before clamping (per the task normalization note).
 * The result is clamped to the inclusive range [0, 100] and rounded to the
 * nearest whole percent (Requirement 4.3).
 *
 * When the confidence is absent (undefined) or not a finite number, the shared
 * UNAVAILABLE indicator is returned instead of a percentage (Requirement 4.5).
 */
export function formatConfidence(confidence: number | undefined | null): string {
  if (confidence === undefined || confidence === null || !Number.isFinite(confidence)) {
    return UNAVAILABLE;
  }

  // Normalize: a value in [0, 1] is treated as a fraction and scaled to a percent.
  const asPercent = confidence <= 1 ? confidence * 100 : confidence;

  // Clamp into [0, 100], then round to the nearest whole percent.
  const clamped = Math.min(100, Math.max(0, asPercent));
  const whole = Math.round(clamped);

  return `${whole}%`;
}

/**
 * Render a numeric value together with its unit exactly as provided, without any
 * re-derivation or reformatting of the numeric value (Requirements 8.3, 9.1, 9.2).
 *
 * When the value is absent, the shared UNAVAILABLE indicator is returned. A unit
 * without a value is treated as unavailable, since there is no value to render.
 * When a unit is present it is appended after a single space; when absent, only
 * the numeric value is rendered.
 */
export function formatValueWithUnit(
  value: number | undefined | null,
  unit?: string,
): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return UNAVAILABLE;
  }

  const trimmedUnit = unit?.trim();
  return trimmedUnit ? `${value} ${trimmedUnit}` : `${value}`;
}

/**
 * Render a DeterministicValue (value + unit) exactly as provided, or the shared
 * UNAVAILABLE indicator when the value is absent (Requirements 8.3, 8.4).
 */
export function formatDeterministicValue(dv: DeterministicValue | undefined | null): string {
  if (!dv) {
    return UNAVAILABLE;
  }
  return formatValueWithUnit(dv.value, dv.unit);
}

/**
 * Render a MonetaryValue (value + unit) exactly as provided, or the shared
 * UNAVAILABLE indicator when the value is absent (Requirements 9.1, 9.2, 9.5).
 */
export function formatMonetaryValue(mv: MonetaryValue | undefined | null): string {
  if (!mv) {
    return UNAVAILABLE;
  }
  return formatValueWithUnit(mv.value, mv.unit);
}
