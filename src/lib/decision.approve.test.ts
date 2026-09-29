import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { canApprove } from "./decision.ts";

// Feature: tax-audit-dashboard, Property 11: Approve gating predicate
//
// Validates: Requirements 11.3, 11.7, 13.2
//
// For any combination of signature text, compliance-checkbox state, and
// submission-in-flight state, the Approve control is enabled if and only if the
// trimmed signature is non-empty AND the compliance checkbox is checked AND no
// submission is in flight.

/**
 * Signature generator spanning the relevant input space: empty strings,
 * whitespace-only strings (which must trim to empty), and arbitrary strings
 * (which may or may not be non-empty after trimming).
 */
const signatureArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  // Whitespace-only strings: spaces, tabs, newlines.
  fc
    .array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 8 })
    .map((chars) => chars.join("")),
  // Arbitrary strings, including ones with leading/trailing whitespace.
  fc.string(),
);

describe("canApprove — Property 11: Approve gating predicate", () => {
  it("is enabled iff trimmed signature non-empty AND compliance checked AND not submitting", () => {
    fc.assert(
      fc.property(
        signatureArb,
        fc.boolean(),
        fc.boolean(),
        (signature, complianceConfirmed, submitting) => {
          const expected =
            signature.trim().length > 0 && complianceConfirmed && !submitting;

          expect(canApprove({ signature, complianceConfirmed, submitting })).toBe(
            expected,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
