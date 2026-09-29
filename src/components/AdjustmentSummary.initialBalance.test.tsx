// Property-based test for AdjustmentSummary Final Auditor Balance initialization.
//
// Feature: tax-audit-dashboard, Property 6: Final Auditor Balance initializes to
// the AI recommendation.
//
// Validates: Requirements 9.3

import { render, screen, within, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { AdjustmentSummary } from "./AdjudicationConsole.tsx";
import { formatMonetaryValue } from "../lib/format.ts";
import type { AdjustmentSummary as AdjustmentSummaryData } from "../types/casePacket.ts";

describe("AdjustmentSummary Final Auditor Balance initialization (Property 6)", () => {
  // Feature: tax-audit-dashboard, Property 6: Final Auditor Balance initializes to the AI recommendation
  it("initializes the Final Auditor Balance card to the AI Recommended Adjustment when no finalAuditorBalance is supplied", () => {
    // A finite monetary value (value + optional unit) rendered exactly as-is by
    // formatMonetaryValue.
    const monetaryArb = fc.record({
      value: fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
      unit: fc.option(fc.string({ minLength: 1, maxLength: 5 }), { nil: undefined }),
    });

    // Generate a summary whose originalClaim differs from aiRecommendedAdjustment
    // where possible, so asserting the balance equals the AI recommendation (and
    // not the original claim) is meaningful.
    const summaryArb: fc.Arbitrary<AdjustmentSummaryData> = fc
      .tuple(monetaryArb, monetaryArb)
      .map(([originalClaim, aiRecommendedAdjustment]) => {
        // If the two happen to render identically, nudge the original claim so
        // the assertion distinguishes the two values.
        if (
          formatMonetaryValue(originalClaim) ===
          formatMonetaryValue(aiRecommendedAdjustment)
        ) {
          return {
            originalClaim: {
              ...originalClaim,
              value: (originalClaim.value ?? 0) + 1,
            },
            aiRecommendedAdjustment,
          };
        }
        return { originalClaim, aiRecommendedAdjustment };
      });

    fc.assert(
      fc.property(summaryArb, (summary) => {
        // Render WITHOUT passing finalAuditorBalance so the card falls back to
        // the AI Recommended Adjustment (Req 9.3).
        render(<AdjustmentSummary summary={summary} />);

        try {
          // Locate the Final Auditor Balance card by its title text, then read
          // the value from the card container (the title's parent div holds both
          // the header and the value body).
          const title = screen.getByText("Final Auditor Balance");
          const card = title.parentElement as HTMLElement;
          expect(card).not.toBeNull();

          const expected = formatMonetaryValue(summary.aiRecommendedAdjustment);

          // The value cell renders formatMonetaryValue(aiRecommendedAdjustment)
          // verbatim; read it within the card scope so we don't match the other
          // summary cards.
          expect(within(card).getByText(expected)).toBeInTheDocument();
        } finally {
          // RTL auto-cleanup runs between tests, not between property iterations;
          // unmount after each run so DOM state never accumulates.
          cleanup();
        }
      }),
      { numRuns: 150 },
    );
  });
});
