import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildRejectedDecision,
  isRationaleValid,
  RATIONALE_MIN_LENGTH,
  RATIONALE_MAX_LENGTH,
} from "./decision";
import type { AdjustedCalculations } from "../types/decision";
import type {
  AdjustmentLineItem,
  CapPercentage,
} from "../types/casePacket";

// Arbitraries for a valid reject state.

// A rationale whose trimmed length lands in the inclusive range [1, 2000]. We
// build it from a non-whitespace core so trimming can never empty it, then pad
// so the trimmed length spans the whole accepted band.
const validRationaleArb: fc.Arbitrary<string> = fc
  .string({ minLength: RATIONALE_MIN_LENGTH, maxLength: RATIONALE_MAX_LENGTH })
  .map((s) => s.replace(/\s/g, "."))
  .filter((s) => {
    const len = s.trim().length;
    return len >= RATIONALE_MIN_LENGTH && len <= RATIONALE_MAX_LENGTH;
  });

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

const money = fc.double({
  min: -1_000_000,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

const adjustedCalculationsArb: fc.Arbitrary<AdjustedCalculations> = fc.record({
  lineItems: fc.array(lineItemArb, { maxLength: 10 }),
  capPercentages: fc.array(capArb, { maxLength: 5 }),
  netTaxOwed: money,
  finalAuditorBalance: money,
});

const caseworkerNotesArb: fc.Arbitrary<string> = fc.string({ maxLength: 500 });

/** True iff `s` is a valid ISO 8601 timestamp that round-trips through Date. */
function isValidIsoTimestamp(s: string): boolean {
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString() === s;
}

// Feature: tax-audit-dashboard, Property 14: Rejected payload completeness and rationale bounds
// Validates: Requirements 12.2, 12.4
describe("buildRejectedDecision / isRationaleValid — Property 14: rejected payload completeness and rationale bounds", () => {
  it("produces a complete rejected payload and accepts rationale only for trimmed length 1..2000", () => {
    fc.assert(
      fc.property(
        validRationaleArb,
        adjustedCalculationsArb,
        caseworkerNotesArb,
        // Length of an all-whitespace string (never valid).
        fc.nat({ max: 50 }),
        // Overflow amount pushing trimmed length beyond RATIONALE_MAX_LENGTH.
        fc.integer({ min: 1, max: 200 }),
        (
          rationale,
          adjustedCalculations,
          caseworkerNotes,
          whitespaceLen,
          overflow
        ) => {
          // Part A: payload completeness.
          const payload = buildRejectedDecision({
            rationale,
            adjustedCalculations,
            caseworkerNotes,
          });

          expect(payload.status).toBe("rejected");
          expect(payload.rationale).toBe(rationale);
          expect(payload.caseworkerNotes).toBe(caseworkerNotes);
          expect(payload.adjustedCalculations).toEqual(adjustedCalculations);
          expect(isValidIsoTimestamp(payload.timestamp)).toBe(true);

          // Part B: rationale bounds.
          // Valid: the generated rationale trims into [1, 2000].
          expect(isRationaleValid(rationale)).toBe(true);

          // Invalid: empty / whitespace-only trims to length 0.
          const whitespaceOnly = " ".repeat(whitespaceLen);
          expect(isRationaleValid("")).toBe(false);
          expect(isRationaleValid(whitespaceOnly)).toBe(false);

          // Invalid: trimmed length strictly greater than the maximum.
          const tooLong = "a".repeat(RATIONALE_MAX_LENGTH + overflow);
          expect(tooLong.trim().length).toBeGreaterThan(RATIONALE_MAX_LENGTH);
          expect(isRationaleValid(tooLong)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});
