import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { canReject } from "./decision.ts";

// Feature: tax-audit-dashboard, Property 13: Reject gating predicate
//
// Validates: Requirements 12.3
//
// The Reject control is a binding action gated in state: it is enabled if and
// only if the trimmed rationale is non-empty AND no submission is in flight.
// This property generates rationale strings that are empty, whitespace-only, or
// non-empty (with and without surrounding whitespace) together with an
// arbitrary `submitting` flag, and asserts canReject agrees exactly with the
// reference predicate `rationale.trim().length > 0 && !submitting`.

/**
 * Rationale strings spanning the equivalence classes that drive gating:
 * empty, whitespace-only, arbitrary text, and arbitrary text padded with
 * leading/trailing whitespace (so trimming is exercised in both directions).
 */
const whitespaceArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), { maxLength: 8 })
  .map((chars) => chars.join(""));

const rationaleArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  whitespaceArb,
  fc.string(),
  fc
    .tuple(whitespaceArb, fc.string(), whitespaceArb)
    .map(([lead, body, trail]) => lead + body + trail),
);

describe("canReject — Property 13: Reject gating predicate", () => {
  it("is enabled iff trimmed rationale is non-empty and not submitting", () => {
    fc.assert(
      fc.property(rationaleArb, fc.boolean(), (rationale, submitting) => {
        const expected = rationale.trim().length > 0 && !submitting;
        expect(canReject({ rationale, submitting })).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });
});
