// Property-based test for AdjustmentSummary's exact value rendering.
//
// Feature: tax-audit-dashboard, Property 5: Adjustment summary values are shown
// exactly and never re-derived.
//
// Validates: Requirements 9.1, 9.2
//
// The AdjustmentSummary renders three cards: Original Claim, AI Recommended
// Adjustment, and Final Auditor Balance. The Original Claim and AI Recommended
// Adjustment values must be shown EXACTLY as provided, with no client-side
// re-derivation (Req 9.1, 9.2). We import `formatMonetaryValue` and use it as
// the single source of truth: if the component re-derived or reformatted the
// numbers, the rendered card text would diverge from this string and the
// assertion would fail.

import { render, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { AdjustmentSummary } from "./AdjudicationConsole.tsx";
import { formatMonetaryValue } from "../lib/format.ts";
import type {
  AdjustmentSummary as AdjustmentSummaryData,
  MonetaryValue,
} from "../types/casePacket.ts";

describe("AdjustmentSummary exact value rendering (Property 5)", () => {
  // A MonetaryValue with a finite numeric value and a unit string. Both are
  // always present so every summary value has a concrete formatted string to
  // match against (the absent-value placeholder path is Property 7 / task 9.4).
  const monetaryValueArb: fc.Arbitrary<MonetaryValue> = fc.record({
    value: fc.double({ noNaN: true, noDefaultInfinity: true }),
    unit: fc.string({ minLength: 1 }),
  });

  const summaryArb: fc.Arbitrary<AdjustmentSummaryData> = fc.record({
    originalClaim: monetaryValueArb,
    aiRecommendedAdjustment: monetaryValueArb,
  });

  /**
   * Find the card container whose title text equals `title` and return the text
   * of its `.tabular-nums` value cell. The Card renders the title in its own
   * element and the value in a `.tabular-nums` span, so we locate the card by
   * walking up from the matching title to the nearest ancestor that also holds
   * a `.tabular-nums` cell.
   */
  function valueForCardTitle(
    container: HTMLElement,
    title: string,
  ): string | null {
    const titleNode = Array.from(container.querySelectorAll("*")).find(
      (node) =>
        node.children.length === 0 && node.textContent?.trim() === title,
    );
    if (!titleNode) return null;

    // Walk up to the card container that also contains the value cell.
    let card: Element | null = titleNode.parentElement;
    while (card && card !== container) {
      const valueCell = card.querySelector(".tabular-nums");
      if (valueCell) return valueCell.textContent;
      card = card.parentElement;
    }
    return null;
  }

  // Feature: tax-audit-dashboard, Property 5: Adjustment summary values are shown exactly and never re-derived
  it("renders Original Claim and AI Recommended Adjustment exactly as formatMonetaryValue produces", () => {
    fc.assert(
      fc.property(summaryArb, (summary) => {
        const { container } = render(<AdjustmentSummary summary={summary} />);

        try {
          // Source-of-truth strings: exactly what formatMonetaryValue yields for
          // the two provided values (Req 9.1, 9.2). If the component re-derived
          // the numbers, its output would not equal these strings.
          const expectedOriginalClaim = formatMonetaryValue(
            summary.originalClaim,
          );
          const expectedAiRecommended = formatMonetaryValue(
            summary.aiRecommendedAdjustment,
          );

          // The Original Claim card shows exactly the formatted Original Claim.
          expect(valueForCardTitle(container, "Original Claim")).toBe(
            expectedOriginalClaim,
          );

          // The AI Recommended Adjustment card shows exactly the formatted value.
          expect(
            valueForCardTitle(container, "AI Recommended Adjustment"),
          ).toBe(expectedAiRecommended);

          // Both source-of-truth strings must be present among the rendered
          // value cells — a stronger cross-check that no re-derivation occurred.
          const renderedValues = Array.from(
            container.querySelectorAll(".tabular-nums"),
          ).map((node) => node.textContent);
          expect(renderedValues).toContain(expectedOriginalClaim);
          expect(renderedValues).toContain(expectedAiRecommended);
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
