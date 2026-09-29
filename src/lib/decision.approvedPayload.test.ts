import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildApprovedDecision } from "./decision.ts";
import type {
  AdjustmentLineItem,
  CapPercentage,
} from "../types/casePacket.ts";
import type { AdjustedCalculations } from "../types/decision.ts";

// Feature: tax-audit-dashboard, Property 12: Approved payload completeness
//
// Validates: Requirements 11.4, 13.3
//
// For any valid approve state — an AdjustedCalculations snapshot (editable line
// items, cap percentages, and the client-recalculated net tax / final auditor
// balance), caseworker notes, an auditor signature, and a Compliance_Confirmation
// boolean — the payload assembled by buildApprovedDecision must be complete:
//
//   1. status is the discriminant "approved".
//   2. adjustedCalculations is carried through unchanged (deep-equal to input).
//   3. caseworkerNotes and auditorSignature are carried through verbatim.
//   4. complianceConfirmation is present as a boolean (Article 14 certification,
//      Requirement 13.3).
//   5. timestamp is a non-empty string; when the caller omits it, it defaults to
//      a valid ISO 8601 instant parseable by Date (Requirement 11.4).

/** Valid line item: finite, non-negative amount (Requirement 10.5). */
const lineItemArb: fc.Arbitrary<AdjustmentLineItem> = fc.record({
  id: fc.uuid(),
  label: fc.string(),
  amount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  unit: fc.constant("EUR"),
});

/** Valid cap: percentage within the inclusive range [0, 100] (Requirement 10.4). */
const capArb: fc.Arbitrary<CapPercentage> = fc.record({
  id: fc.uuid(),
  label: fc.string(),
  percentage: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
});

const adjustedCalculationsArb: fc.Arbitrary<AdjustedCalculations> = fc.record({
  lineItems: fc.array(lineItemArb, { maxLength: 12 }),
  capPercentages: fc.array(capArb, { maxLength: 6 }),
  netTaxOwed: fc.double({ min: 0, max: 5_000_000, noNaN: true, noDefaultInfinity: true }),
  finalAuditorBalance: fc.double({
    min: -1_000_000,
    max: 1_000_000,
    noNaN: true,
    noDefaultInfinity: true,
  }),
});

/** Optional ISO 8601 timestamp; `undefined` exercises the default-to-now branch. */
const timestampArb: fc.Arbitrary<string | undefined> = fc.option(
  fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  { nil: undefined },
);

describe("buildApprovedDecision — Property 12: approved payload completeness", () => {
  it("produces a complete approved payload for any valid approve state", () => {
    fc.assert(
      fc.property(
        adjustedCalculationsArb,
        fc.string(),
        fc.string(),
        fc.boolean(),
        timestampArb,
        (
          adjustedCalculations,
          caseworkerNotes,
          auditorSignature,
          complianceConfirmation,
          timestamp,
        ) => {
          const payload = buildApprovedDecision({
            adjustedCalculations,
            caseworkerNotes,
            auditorSignature,
            complianceConfirmation,
            timestamp,
          });

          // 1. Discriminant.
          expect(payload.status).toBe("approved");

          // 2. Adjusted calculations carried through unchanged.
          expect(payload.adjustedCalculations).toEqual(adjustedCalculations);

          // 3. Notes and signature carried through verbatim.
          expect(payload.caseworkerNotes).toBe(caseworkerNotes);
          expect(payload.auditorSignature).toBe(auditorSignature);

          // 4. Compliance confirmation present as a boolean.
          expect(typeof payload.complianceConfirmation).toBe("boolean");
          expect(payload.complianceConfirmation).toBe(complianceConfirmation);

          // 5. Non-empty timestamp; a valid ISO instant when defaulted.
          expect(typeof payload.timestamp).toBe("string");
          expect(payload.timestamp.length).toBeGreaterThan(0);
          const parsed = new Date(payload.timestamp);
          expect(Number.isNaN(parsed.getTime())).toBe(false);
          if (timestamp !== undefined) {
            expect(payload.timestamp).toBe(timestamp);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
