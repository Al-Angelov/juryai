import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatConfidence, UNAVAILABLE } from "./format.ts";

// Feature: tax-audit-dashboard, Property 26: Confidence formatting is a clamped whole percent
//
// Validates: Requirements 4.3, 4.5
//
// For arbitrary finite numeric confidences, the formatted output must be a whole
// percent in the inclusive range [0, 100] followed by "%" (Requirement 4.3). An
// absent confidence must yield the shared unavailable indicator (Requirement 4.5).
describe("formatConfidence — Property 26: clamped whole percent", () => {
  it("formats any finite confidence as an integer in [0,100] followed by %", () => {
    fc.assert(
      fc.property(
        // Cover both representations the CasePacket may use: fractions in [0,1]
        // and percentages in [0,100], plus out-of-range values that must clamp.
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (confidence) => {
          const result = formatConfidence(confidence);

          // Output is a run of digits immediately followed by a single "%".
          expect(result).toMatch(/^\d+%$/);

          // The parsed integer lies within the clamped inclusive range.
          const parsed = Number.parseInt(result.slice(0, -1), 10);
          expect(Number.isInteger(parsed)).toBe(true);
          expect(parsed).toBeGreaterThanOrEqual(0);
          expect(parsed).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns the unavailable indicator for absent confidence", () => {
    expect(formatConfidence(undefined)).toBe(UNAVAILABLE);
    expect(formatConfidence(null)).toBe(UNAVAILABLE);
  });
});
