// Client-side net-tax recalculation for the Adjudication_Console.
//
// This module is the ONLY place net tax owed is computed on the client. It is a
// pure function with no React dependency, which is why the universal
// correctness properties (Properties 1, 2) target it directly.
//
// The deterministic math values (total income, allowable deduction cap, tax
// bracket adjustments) are authoritative backend calculations. They are
// consumed here as READ-ONLY inputs and are NEVER re-derived (Requirement 8.3).
// The auditor's valid line-item and cap edits are the only client-controlled
// inputs.
//
// Algorithm (from design "Client-Side Net-Tax Recalculation"):
//
//   grossDeductions  = sum(validLineItems.amount)            // each >= 0
//   effectiveCap     = applyCaps(allowableDeductionCap, validCaps)
//   allowedDeduction = min(grossDeductions, effectiveCap)    // never exceeds cap
//   taxableIncome    = max(0, totalIncome - allowedDeduction)
//   netTax           = applyBrackets(taxableIncome, taxBracketAdjustments)
//   return round2(max(0, netTax))
//
// _Requirements: 9.4, 10.2, 8.3_

import type {
  DeterministicMathBlock,
  DeterministicValue,
  AdjustmentLineItem,
  CapPercentage,
} from "../types/casePacket";

/**
 * Read a possibly-absent deterministic value as a number.
 *
 * Absent deterministic values (`undefined` value, or a value that is not a
 * finite number) are treated as `0` for the purposes of the math. This is a
 * documented modeling choice: a missing backend figure contributes nothing to
 * the computation rather than propagating `NaN` through the result. The
 * deterministic value itself is never re-derived — it is only read.
 */
function readDeterministic(v: DeterministicValue | undefined): number {
  const n = v?.value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Round a number to two decimal places (currency precision).
 *
 * Uses a scaled round to avoid returning values with floating-point noise such
 * as `123.45000000000002`.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Apply the auditor's valid cap percentages to the deterministic allowable
 * deduction cap, returning the effective cap in currency units.
 *
 * Rule (documented, deterministic): each cap percentage is interpreted as a
 * fraction (`percentage / 100`) that scales the deduction cap. When multiple
 * caps are present, the MOST RESTRICTIVE combination is applied by taking the
 * PRODUCT of all cap fractions. Because every valid cap fraction lies in
 * `[0, 1]` (valid caps are constrained to the inclusive range 0–100 by
 * `validation.ts`), the product is monotonically non-increasing in the number
 * of caps and never exceeds the base cap. This guarantees the effective cap is
 * always in `[0, allowableDeductionCap]`, which in turn guarantees
 * `allowedDeduction <= allowableDeductionCap` (Property 2).
 *
 * With no caps present, the effective cap is the full deterministic cap
 * (empty product = 1).
 *
 * @param allowableDeductionCap the read-only deterministic cap value
 * @param validCaps auditor-edited cap percentages already validated to `[0,100]`
 * @returns the effective cap in currency units, never negative
 */
export function applyCaps(
  allowableDeductionCap: DeterministicValue | undefined,
  validCaps: readonly CapPercentage[]
): number {
  const baseCap = readDeterministic(allowableDeductionCap);

  // Empty product = 1 => no caps leaves the base cap unchanged.
  const combinedFraction = validCaps.reduce((fraction, cap) => {
    const pct = Number.isFinite(cap.percentage) ? cap.percentage : 100;
    // Clamp defensively to [0, 100]; validation.ts already enforces this range.
    const clamped = Math.min(100, Math.max(0, pct));
    return fraction * (clamped / 100);
  }, 1);

  return Math.max(0, baseCap * combinedFraction);
}

/**
 * Apply the deterministic tax-bracket adjustments to the taxable income,
 * returning the net tax before the final non-negativity clamp.
 *
 * Rule (documented, deterministic): the bracket adjustments are additive
 * offsets applied to the taxable income. The net tax is the taxable income
 * plus the sum of all bracket adjustment amounts. Adjustments can be positive
 * (surcharge) or negative (credit); their order does not affect the result, so
 * the computation is deterministic and independent of input ordering.
 *
 * Absent bracket adjustment amounts contribute `0` (see `readDeterministic`).
 * The bracket amounts are read-only and are never re-derived.
 *
 * @param taxableIncome the (already non-negative) taxable income
 * @param taxBracketAdjustments the read-only deterministic bracket adjustments
 * @returns the net tax prior to the final `max(0, ...)` clamp
 */
export function applyBrackets(
  taxableIncome: number,
  taxBracketAdjustments: DeterministicMathBlock["taxBracketAdjustments"]
): number {
  const adjustmentTotal = (taxBracketAdjustments ?? []).reduce(
    (sum, adj) => sum + readDeterministic(adj.amount),
    0
  );
  return taxableIncome + adjustmentTotal;
}

/**
 * Recalculate the net tax owed from the read-only deterministic math and the
 * auditor's valid line items and cap percentages.
 *
 * This is the single client entry point for net-tax recalculation. Callers are
 * responsible for passing only VALID inputs: line items with `amount >= 0` and
 * caps with `percentage` in `[0, 100]`. Invalid inputs are filtered out (or the
 * recalculation suspended) upstream by `validation.ts` per the requirements.
 *
 * The function is pure and deterministic: identical inputs always yield an
 * identical result (Property 1), and the returned net tax is always `>= 0`
 * with the allowed deduction never exceeding the deterministic cap (Property 2).
 *
 * @param math read-only deterministic math block (never re-derived here)
 * @param validLineItems auditor-edited valid deduction line items (each >= 0)
 * @param validCaps auditor-edited valid cap percentages (each in [0, 100])
 * @returns the net tax owed, rounded to two decimals and clamped to `>= 0`
 */
export function recalculateNetTax(
  math: DeterministicMathBlock,
  validLineItems: readonly AdjustmentLineItem[],
  validCaps: readonly CapPercentage[]
): number {
  const grossDeductions = validLineItems.reduce(
    (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
    0
  );

  const effectiveCap = applyCaps(math.allowableDeductionCap, validCaps);

  const allowedDeduction = Math.min(grossDeductions, effectiveCap);

  const totalIncome = readDeterministic(math.totalIncome);
  const taxableIncome = Math.max(0, totalIncome - allowedDeduction);

  const netTax = applyBrackets(taxableIncome, math.taxBracketAdjustments);

  return round2(Math.max(0, netTax));
}
