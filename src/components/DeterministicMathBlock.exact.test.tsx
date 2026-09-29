// Property-based test for DeterministicMathBlock's exact value rendering.
//
// Feature: tax-audit-dashboard, Property 3: Deterministic math values are
// displayed exactly and never re-derived.
//
// Validates: Requirements 8.1, 8.3
//
// The component must display, for every deterministic value (total income,
// allowable deduction cap, and each tax-bracket adjustment), EXACTLY the string
// that `formatDeterministicValue` produces. We import `formatDeterministicValue`
// and use it as the single source of truth: if the component re-derived or
// reformatted the numbers, the rendered text would diverge from this string and
// the assertion would fail. We also assert the block is read-only (no editable
// controls) per Req 8.1.

import { render, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { DeterministicMathBlock } from "./AgentTransparencyTree.tsx";
import { formatDeterministicValue } from "../lib/format.ts";
import type {
  DeterministicMathBlock as DeterministicMathBlockData,
  DeterministicValue,
} from "../types/casePacket.ts";

describe("DeterministicMathBlock exact value rendering (Property 3)", () => {
  // A DeterministicValue with a finite numeric value and a unit string. Both
  // are always present here so every value has a concrete formatted string to
  // match against (the absent-value placeholder path is Property 4 / task 7.12).
  const deterministicValueArb: fc.Arbitrary<DeterministicValue> = fc.record({
    value: fc.double({ noNaN: true, noDefaultInfinity: true }),
    unit: fc.string({ minLength: 1 }),
  });

  const mathArb: fc.Arbitrary<DeterministicMathBlockData> = fc.record({
    totalIncome: deterministicValueArb,
    allowableDeductionCap: deterministicValueArb,
    taxBracketAdjustments: fc.array(
      fc.record({
        label: fc.string({ minLength: 1 }),
        amount: deterministicValueArb,
      }),
      { maxLength: 6 },
    ),
  });

  // Feature: tax-audit-dashboard, Property 3: Deterministic math values are displayed exactly and never re-derived
  it("renders every deterministic value exactly as formatDeterministicValue produces, with no editable controls", () => {
    fc.assert(
      fc.property(mathArb, (math) => {
        const { container } = render(<DeterministicMathBlock math={math} />);

        try {
          // The source-of-truth strings: exactly what formatDeterministicValue
          // yields for each value the block renders (Req 8.3). If the component
          // re-derived the numbers, its output would not equal these strings.
          const expectedStrings = [
            formatDeterministicValue(math.totalIncome),
            formatDeterministicValue(math.allowableDeductionCap),
            ...math.taxBracketAdjustments.map((adj) =>
              formatDeterministicValue(adj.amount),
            ),
          ];

          // The rendered value cells (the second <span> in each row), read as a
          // multiset so duplicate formatted values are accounted for and order
          // does not matter.
          const list = container.querySelector(
            '[aria-label="Deterministic Backend Calculations"]',
          );
          expect(list).not.toBeNull();

          const renderedValues = Array.from(
            list!.querySelectorAll(".tabular-nums"),
          )
            .map((node) => node.textContent)
            .sort();

          expect(renderedValues).toEqual([...expectedStrings].sort());

          // Read-only: the block exposes no editable/interactive control (Req 8.1).
          expect(
            container.querySelectorAll("input,button,textarea,select").length,
          ).toBe(0);
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
