// Property-based test for the AdjustmentTable's editable input surface.
//
// Feature: tax-audit-dashboard, Property 10: Adjustment table renders one
// editable input per line item and cap.
//
// Validates: Requirements 10.1
//
// The AdjustmentTable renders the editable numeric grid at the center of the
// Adjudication_Console. Requirement 10.1 requires exactly one editable input
// per deduction line item AND one per cap percentage. This property generates
// arbitrary sets of line items and cap percentages and asserts that the number
// of rendered editable text inputs equals `lineItems.length +
// capPercentages.length`, and that every input is editable (not disabled).
//
// The inputs are present synchronously on first render — the 200 ms trailing
// debounce only governs the downstream recalculation, not the input surface —
// so we render and query immediately, with no timer advance. `cleanup()` runs
// in a `finally` so the debounce timer is torn down between property runs.

import { render, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { AdjustmentTable } from "./AdjudicationConsole.tsx";
import type {
  AdjustmentLineItem,
  CapPercentage,
  DeterministicMathBlock,
} from "../types/casePacket.ts";

describe("AdjustmentTable editable input surface (Property 10)", () => {
  // A line item WITHOUT its id — the id is injected from the array index below
  // to guarantee uniqueness (and thus stable React keys) regardless of what
  // labels/amounts fast-check picks.
  const lineItemBodyArb: fc.Arbitrary<Omit<AdjustmentLineItem, "id">> =
    fc.record({
      label: fc.string(),
      amount: fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }),
      unit: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    });

  // A cap percentage WITHOUT its id — same id-injection strategy as above.
  const capBodyArb: fc.Arbitrary<Omit<CapPercentage, "id">> = fc.record({
    label: fc.string(),
    percentage: fc.double({
      min: 0,
      max: 100,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  });

  // Minimal read-only deterministic math — the recalculation is not exercised
  // by this property; the table only needs a well-formed block to render.
  const deterministicMath: DeterministicMathBlock = {
    totalIncome: { value: 0, unit: "EUR" },
    allowableDeductionCap: { value: 0, unit: "EUR" },
    taxBracketAdjustments: [],
  };

  // Feature: tax-audit-dashboard, Property 10: Adjustment table renders one editable input per line item and cap
  it("renders exactly one editable input per line item and per cap percentage", () => {
    fc.assert(
      fc.property(
        fc.array(lineItemBodyArb, { maxLength: 12 }),
        fc.array(capBodyArb, { maxLength: 12 }),
        (lineItemBodies, capBodies) => {
          // Inject unique ids from the index so React keys never collide even
          // when labels/amounts repeat (Req 10.1 is about one input per item,
          // not about distinct labels).
          const lineItems: AdjustmentLineItem[] = lineItemBodies.map(
            (body, i) => ({ ...body, id: `li-${i}` }),
          );
          const capPercentages: CapPercentage[] = capBodies.map((body, i) => ({
            ...body,
            id: `cap-${i}`,
          }));

          const { container } = render(
            <AdjustmentTable
              lineItems={lineItems}
              capPercentages={capPercentages}
              deterministicMath={deterministicMath}
              initialNetTaxOwed={0}
            />,
          );

          try {
            const inputs = Array.from(container.querySelectorAll("input"));

            // Exactly one editable input per line item and one per cap (Req 10.1).
            expect(inputs).toHaveLength(
              lineItems.length + capPercentages.length,
            );

            // Every input must be editable, i.e. not disabled (Req 10.1).
            for (const input of inputs) {
              expect(input.disabled).toBe(false);
            }
          } finally {
            // Unmount after each run so the debounce timer is cleared and no DOM
            // state accumulates across property iterations.
            cleanup();
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
