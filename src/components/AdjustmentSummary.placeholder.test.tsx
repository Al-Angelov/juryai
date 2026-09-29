// Property-based test for AdjustmentSummary's missing-value placeholders.
//
// Feature: tax-audit-dashboard, Property 7: Missing summary values render a placeholder
//
// Validates: Requirements 9.5
//
// The AdjustmentSummary renders an "Original Claim" card and an "AI Recommended
// Adjustment" card. Each of these values may be present (a finite numeric value
// with a unit) or absent (an empty MonetaryValue whose `value` is undefined).
// When a value is absent, its card must show the shared UNAVAILABLE indicator;
// when present, its card must show exactly what `formatMonetaryValue` produces
// (which, for a finite value, is never the UNAVAILABLE indicator).
//
// We scope every assertion to a single card by locating that card via its title
// text and reading only the value cell inside it. This keeps the two cards
// independent and side-steps the Final Auditor Balance card, which defaults to
// the AI Recommended Adjustment and therefore also shows UNAVAILABLE whenever
// that value is absent.

import { render, cleanup, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { AdjustmentSummary } from "./AdjudicationConsole.tsx";
import { formatMonetaryValue, UNAVAILABLE } from "../lib/format.ts";
import type {
  AdjustmentSummary as AdjustmentSummaryData,
  MonetaryValue,
} from "../types/casePacket.ts";

describe("AdjustmentSummary missing-value placeholders (Property 7)", () => {
  // A MonetaryValue that is EITHER present (finite value + unit) OR absent (an
  // empty object, so `value` is undefined and the placeholder path is taken).
  const monetaryArb: fc.Arbitrary<MonetaryValue> = fc.oneof(
    fc.record({
      value: fc.double({ noNaN: true, noDefaultInfinity: true }),
      unit: fc.string({ minLength: 1 }),
    }),
    fc.constant<MonetaryValue>({}),
  );

  const summaryArb: fc.Arbitrary<AdjustmentSummaryData> = fc.record({
    originalClaim: monetaryArb,
    aiRecommendedAdjustment: monetaryArb,
  });

  /**
   * Read the value cell text of the summary card identified by `title`. The
   * title text node is inside the Card container (a `.rounded-lg` div); the
   * value is rendered in the card's `.tabular-nums` cell.
   */
  function cardValueText(title: string): string {
    const titleNode = screen.getByText(title);
    const card = titleNode.closest(".rounded-lg");
    expect(card).not.toBeNull();
    const valueCell = card!.querySelector(".tabular-nums");
    expect(valueCell).not.toBeNull();
    return valueCell!.textContent ?? "";
  }

  /** Per-card assertion: absent => UNAVAILABLE, present => exact formatting. */
  function assertCard(title: string, value: MonetaryValue): void {
    const rendered = cardValueText(title);
    if (value.value === undefined) {
      expect(rendered).toBe(UNAVAILABLE);
    } else {
      const expected = formatMonetaryValue(value);
      // A finite value never formats to the placeholder.
      expect(expected).not.toBe(UNAVAILABLE);
      expect(rendered).toBe(expected);
    }
  }

  // Feature: tax-audit-dashboard, Property 7: Missing summary values render a placeholder
  it("shows the unavailable placeholder for each absent summary value and the exact value otherwise", () => {
    fc.assert(
      fc.property(summaryArb, (summary) => {
        render(<AdjustmentSummary summary={summary} />);

        try {
          assertCard("Original Claim", summary.originalClaim);
          assertCard("AI Recommended Adjustment", summary.aiRecommendedAdjustment);
        } finally {
          // RTL auto-cleanup runs between tests, not between property
          // iterations; unmount after each run so DOM state never accumulates.
          cleanup();
        }
      }),
      { numRuns: 150 },
    );
  });
});
