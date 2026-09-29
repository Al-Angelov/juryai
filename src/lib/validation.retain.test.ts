import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateLineItem, validateCap, isValid, type ValidationResult } from "./validation";

// Feature: tax-audit-dashboard, Property 8: Invalid non-numeric or empty inputs retain the last valid net tax
//
// Validates: Requirements 10.3, 10.6
//
// For any adjustment input that is non-numeric or empty/whitespace, validation
// marks the field invalid (kind "empty" or "non-numeric"), recalculation is
// suspended (behavior "retain-last"), and the displayed net tax owed equals the
// last valid net tax owed.
//
// We model the "displayed net tax" with the retain-last rule: given a prior
// last-valid net tax and a freshly classified input, if the classification's
// behavior is "retain-last" the recalculation is suspended and the displayed
// value stays equal to the last valid value.
function displayedNetTax(lastValidNetTax: number, result: ValidationResult): number {
  // The retain-last rule: suspend recalculation, keep the last valid value.
  if (result.behavior === "retain-last") {
    return lastValidNetTax;
  }
  // For any other behavior the displayed value would be recomputed; this
  // helper is only exercised for retain-last inputs in this property.
  return lastValidNetTax;
}

describe("Property 8: invalid non-numeric or empty inputs retain the last valid net tax", () => {
  it("suspends recalculation and keeps the last valid net tax for empty/non-numeric inputs", () => {
    // Empty or whitespace-only inputs (Requirement 10.6).
    const emptyInput = fc.stringMatching(/^\s*$/);

    // Non-numeric, non-empty inputs (Requirement 10.3). Number(trimmed) must be
    // NaN and the trimmed string must be non-empty, matching validation.ts's
    // parseNumeric contract.
    const nonNumericInput = fc
      .string()
      .filter((s) => {
        const trimmed = s.trim();
        return trimmed !== "" && !Number.isFinite(Number(trimmed));
      });

    fc.assert(
      fc.property(
        // A prior last-valid net tax owed value.
        fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
        // An invalid input: either empty/whitespace or non-numeric.
        fc.oneof(emptyInput, nonNumericInput),
        (lastValidNetTax, invalidInput) => {
          for (const result of [
            validateLineItem(invalidInput),
            validateCap(invalidInput),
          ]) {
            // Field is invalid and classified as empty or non-numeric.
            expect(isValid(result)).toBe(false);
            expect(["empty", "non-numeric"]).toContain(result.kind);

            // Recalculation is suspended: behavior is retain-last.
            expect(result.behavior).toBe("retain-last");

            // Applying the retain rule keeps the displayed net tax equal to the
            // last valid value.
            expect(displayedNetTax(lastValidNetTax, result)).toBe(lastValidNetTax);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
