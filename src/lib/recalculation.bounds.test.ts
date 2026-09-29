import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { recalculateNetTax, applyCaps } from "./recalculation.ts";
import type {
  DeterministicMathBlock,
  DeterministicValue,
  AdjustmentLineItem,
  CapPercentage,
} from "../types/casePacket.ts";

// Feature: tax-audit-dashboard, Property 2: Allowed deduction never exceeds the deterministic cap
//
// Validates: Requirements 10.2, 8.3
//
// For read-only deterministic math plus VALID auditor inputs (line items with
// amount >= 0 and caps with percentage in [0, 100]), the recalculation must
// respect two universal bounds:
//
//   1. The allowed deduction — min(sum(lineItems), applyCaps(cap, caps)) — never
//      exceeds the effective cap, which in turn never exceeds the base
//      deterministic allowable deduction cap (the value is read as-is, never
//      re-derived — Requirement 8.3).
//   2. The net tax owed returned by recalculateNetTax is always >= 0
//      (Requirement 10.2).

/** A finite deterministic value; the `value` field may be absent. */
const deterministicValueArb = (
  min: number,
  max: number,
): fc.Arbitrary<DeterministicValue> =>
  fc.record({
    value: fc.option(fc.double({ min, max, noNaN: true, noDefaultInfinity: true }), {
      nil: undefined,
    }),
    unit: fc.constant("EUR"),
  });

/** Valid line item: amount is a finite, non-negative number (Requirement 10.5). */
const lineItemArb: fc.Arbitrary<AdjustmentLineItem> = fc.record({
  id: fc.uuid(),
  label: fc.string(),
  amount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  unit: fc.constant("EUR"),
});

/** Valid cap: percentage is within the inclusive range [0, 100] (Requirement 10.4). */
const capArb: fc.Arbitrary<CapPercentage> = fc.record({
  id: fc.uuid(),
  label: fc.string(),
  percentage: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
});

const mathArb: fc.Arbitrary<DeterministicMathBlock> = fc.record({
  totalIncome: deterministicValueArb(0, 5_000_000),
  allowableDeductionCap: deterministicValueArb(0, 1_000_000),
  taxBracketAdjustments: fc.array(
    fc.record({
      label: fc.string(),
      amount: deterministicValueArb(-500_000, 500_000),
    }),
    { maxLength: 6 },
  ),
});

describe("recalculateNetTax — Property 2: cap and non-negativity bounds", () => {
  it("keeps allowed deduction within the deterministic cap and net tax >= 0", () => {
    fc.assert(
      fc.property(
        mathArb,
        fc.array(lineItemArb, { maxLength: 12 }),
        fc.array(capArb, { maxLength: 6 }),
        (math, validLineItems, validCaps) => {
          const baseCap =
            typeof math.allowableDeductionCap.value === "number" &&
            Number.isFinite(math.allowableDeductionCap.value)
              ? math.allowableDeductionCap.value
              : 0;

          const effectiveCap = applyCaps(math.allowableDeductionCap, validCaps);
          const grossDeductions = validLineItems.reduce(
            (sum, item) => sum + item.amount,
            0,
          );
          const allowedDeduction = Math.min(grossDeductions, effectiveCap);

          // Effective cap never exceeds the base deterministic cap and is never
          // negative — the cap fractions in [0,1] can only shrink it.
          expect(effectiveCap).toBeGreaterThanOrEqual(0);
          expect(effectiveCap).toBeLessThanOrEqual(baseCap + 1e-9);

          // Allowed deduction never exceeds the effective cap (nor the base cap).
          expect(allowedDeduction).toBeLessThanOrEqual(effectiveCap + 1e-9);
          expect(allowedDeduction).toBeLessThanOrEqual(baseCap + 1e-9);

          // Net tax owed is always non-negative.
          const netTax = recalculateNetTax(math, validLineItems, validCaps);
          expect(netTax).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
