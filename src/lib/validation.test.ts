import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateLineItem, validateCap, isValid } from "./validation";

// Feature: tax-audit-dashboard, Property 9: Out-of-range values are excluded from recalculation
//
// Validates: Requirements 10.4, 10.5
//
// A deduction line item below 0 is classified "negative" with behavior
// "exclude" (Req 10.5). A cap percentage outside the inclusive range 0–100 is
// classified "out-of-range" with behavior "exclude" (Req 10.4). Values that
// are excluded are not usable in the recalculation (they are not "valid"), so
// isValid must be false for them. The inclusive boundaries 0 and 100 are
// accepted for a cap, and a non-negative line item is valid.
describe("Property 9: out-of-range and negative values are excluded", () => {
  it("marks negatives/out-of-range as invalid+excluded and accepts valid values and boundaries", () => {
    fc.assert(
      fc.property(
        // A strictly-negative line-item value.
        fc.double({ min: -1e9, max: -1e-6, noNaN: true, noDefaultInfinity: true }),
        // A valid non-negative line-item value.
        fc.double({ min: 0, max: 1e9, noNaN: true, noDefaultInfinity: true }),
        // A cap value strictly below the range (< 0).
        fc.double({ min: -1e9, max: -1e-6, noNaN: true, noDefaultInfinity: true }),
        // A cap value strictly above the range (> 100).
        fc.double({ min: 100 + 1e-6, max: 1e9, noNaN: true, noDefaultInfinity: true }),
        // A valid in-range cap value.
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (negativeItem, validItem, capBelow, capAbove, validCap) => {
          // Negative line item -> "negative" / "exclude" / not valid.
          const negResult = validateLineItem(String(negativeItem));
          expect(negResult.kind).toBe("negative");
          expect(negResult.behavior).toBe("exclude");
          expect(isValid(negResult)).toBe(false);

          // Non-negative line item -> valid / include.
          const validItemResult = validateLineItem(String(validItem));
          expect(validItemResult.kind).toBe("valid");
          expect(validItemResult.behavior).toBe("include");
          expect(isValid(validItemResult)).toBe(true);

          // Cap below range -> "out-of-range" / "exclude" / not valid.
          const capBelowResult = validateCap(String(capBelow));
          expect(capBelowResult.kind).toBe("out-of-range");
          expect(capBelowResult.behavior).toBe("exclude");
          expect(isValid(capBelowResult)).toBe(false);

          // Cap above range -> "out-of-range" / "exclude" / not valid.
          const capAboveResult = validateCap(String(capAbove));
          expect(capAboveResult.kind).toBe("out-of-range");
          expect(capAboveResult.behavior).toBe("exclude");
          expect(isValid(capAboveResult)).toBe(false);

          // In-range cap -> valid / include.
          const validCapResult = validateCap(String(validCap));
          expect(validCapResult.kind).toBe("valid");
          expect(validCapResult.behavior).toBe("include");
          expect(isValid(validCapResult)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );

    // Boundaries 0 and 100 are accepted for a cap percentage (inclusive range).
    expect(validateCap("0").kind).toBe("valid");
    expect(validateCap("100").kind).toBe("valid");
    // 0 is also a valid line-item value.
    expect(validateLineItem("0").kind).toBe("valid");
  });
});
