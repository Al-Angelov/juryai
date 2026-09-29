// Property-based test for DeterministicMathBlock's missing-value placeholder.
//
// Feature: tax-audit-dashboard, Property 4: Missing deterministic math values
// render a placeholder.
//
// Validates: Requirements 8.4
//
// Every deterministic value (total income, allowable deduction cap, and each
// tax-bracket adjustment amount) is EITHER present (a finite value + unit) OR
// absent (an empty `{}` whose `value` is undefined). For every absent value the
// row's value cell must show the shared UNAVAILABLE indicator, and the number
// of UNAVAILABLE cells must equal the number of absent values. Present values
// render exactly the `formatDeterministicValue` string. We use
// `formatDeterministicValue` and `UNAVAILABLE` as the single source of truth.

import { render, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { DeterministicMathBlock } from "./AgentTransparencyTree.tsx";
import { formatDeterministicValue, UNAVAILABLE } from "../lib/format.ts";
import type {
  DeterministicMathBlock as DeterministicMathBlockData,
  DeterministicValue,
} from "../types/casePacket.ts";

describe("DeterministicMathBlock missing-value placeholders (Property 4)", () => {
  // A DeterministicValue that is EITHER present (finite value + unit) OR absent
  // (`{}`, i.e. `value` undefined). The absent branch is the placeholder path
  // this property exercises (Req 8.4).
  const deterministicValueArb: fc.Arbitrary<DeterministicValue> = fc.oneof(
    fc.record({
      value: fc.double({ noNaN: true, noDefaultInfinity: true }),
      unit: fc.string({ minLength: 1 }),
    }),
    fc.constant({} as DeterministicValue),
  );

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

  // A value is "absent" when formatDeterministicValue falls back to UNAVAILABLE,
  // which is exactly the placeholder condition under test.
  const isAbsent = (dv: DeterministicValue): boolean =>
    formatDeterministicValue(dv) === UNAVAILABLE;

  // Feature: tax-audit-dashboard, Property 4: Missing deterministic math values render a placeholder
  it("renders the UNAVAILABLE indicator for every absent value, once per absent value", () => {
    fc.assert(
      fc.property(mathArb, (math) => {
        const { container } = render(<DeterministicMathBlock math={math} />);

        try {
          const allValues: DeterministicValue[] = [
            math.totalIncome,
            math.allowableDeductionCap,
            ...math.taxBracketAdjustments.map((adj) => adj.amount),
          ];

          // Expected: one string per value, exactly what the formatter yields.
          const expectedStrings = allValues.map((dv) =>
            formatDeterministicValue(dv),
          );
          const expectedAbsentCount = allValues.filter(isAbsent).length;

          // The rendered value cells (the value <span> in each row).
          const list = container.querySelector(
            '[aria-label="Deterministic Backend Calculations"]',
          );
          expect(list).not.toBeNull();

          const renderedValues = Array.from(
            list!.querySelectorAll(".tabular-nums"),
          ).map((node) => node.textContent ?? "");

          // Every value cell matches its formatter output (present values show
          // their formatted string; absent values show UNAVAILABLE).
          expect([...renderedValues].sort()).toEqual(
            [...expectedStrings].sort(),
          );

          // The count of UNAVAILABLE cells equals the number of absent values.
          const renderedUnavailableCount = renderedValues.filter(
            (text) => text === UNAVAILABLE,
          ).length;
          expect(renderedUnavailableCount).toBe(expectedAbsentCount);
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
