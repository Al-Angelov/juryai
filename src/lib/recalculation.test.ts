import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { recalculateNetTax } from "./recalculation";
import type {
  DeterministicValue,
  DeterministicMathBlock,
  AdjustmentLineItem,
  CapPercentage,
} from "../types/casePacket";

// Arbitraries for valid recalculation inputs.
//
// A "valid" deterministic value has a finite numeric `value` and a `unit`
// string (both optional in the type, but we generate present + finite figures
// to model the authoritative backend calculations the recalculation reads).

const finiteMoney = fc.double({
  min: -1_000_000,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

const deterministicValueArb: fc.Arbitrary<DeterministicValue> = fc.record({
  value: finiteMoney,
  unit: fc.constantFrom("EUR", "USD", "%"),
});

const mathArb: fc.Arbitrary<DeterministicMathBlock> = fc.record({
  totalIncome: deterministicValueArb,
  allowableDeductionCap: deterministicValueArb.map((v) => ({
    // caps model a non-negative ceiling
    value: Math.abs(v.value ?? 0),
    unit: v.unit,
  })),
  taxBracketAdjustments: fc.array(
    fc.record({
      label: fc.string(),
      amount: deterministicValueArb,
    }),
    { maxLength: 6 }
  ),
});

// Valid line items: amount >= 0.
const lineItemArb: fc.Arbitrary<AdjustmentLineItem> = fc.record({
  id: fc.uuid(),
  label: fc.string(),
  amount: fc.double({
    min: 0,
    max: 1_000_000,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  unit: fc.constantFrom("EUR", "USD"),
});

// Valid caps: percentage in [0, 100] inclusive.
const capArb: fc.Arbitrary<CapPercentage> = fc.record({
  id: fc.uuid(),
  label: fc.string(),
  percentage: fc.double({
    min: 0,
    max: 100,
    noNaN: true,
    noDefaultInfinity: true,
  }),
});

// Feature: tax-audit-dashboard, Property 1: Net-tax recalculation is deterministic
// Validates: Requirements 10.2, 9.4
describe("recalculateNetTax — Property 1: determinism", () => {
  it("yields identical results for two evaluations on identical inputs", () => {
    fc.assert(
      fc.property(
        mathArb,
        fc.array(lineItemArb, { maxLength: 10 }),
        fc.array(capArb, { maxLength: 5 }),
        (math, validLineItems, validCaps) => {
          const first = recalculateNetTax(math, validLineItems, validCaps);
          const second = recalculateNetTax(math, validLineItems, validCaps);
          expect(second).toBe(first);
        }
      ),
      { numRuns: 200 }
    );
  });
});
