// Example (non-property) tests for the recalculation timing bounds of the
// Adjudication_Console (task 9.7).
//
// These cover two timing acceptance criteria that the debounced client-side
// recalculation must satisfy:
//   - 10.2: a valid line-item / cap edit updates the net tax owed within 500 ms.
//   - 9.4:  the recomputed Final Auditor Balance is reflected within 1 s.
//
// The recalculation is a trailing debounce of RECALCULATION_DEBOUNCE_MS (200 ms)
// — comfortably inside both bounds. Rather than depend on wall-clock time, we
// drive Vitest fake timers and advance them by the requirement bound (500 ms /
// 1000 ms). Because the debounce fires at 200 ms, advancing to the bound is
// sufficient for the recalculation to have completed AND proves the update lands
// within the required window: if the debounce were ever longer than the bound,
// advancing only to the bound would leave the value unchanged and the assertion
// would fail. All timer advances and the state updates they trigger are wrapped
// in act().

import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

import {
  AdjustmentTable,
  AdjudicationConsole,
  RECALCULATION_DEBOUNCE_MS,
} from "./AdjudicationConsole.tsx";
import { formatMonetaryValue } from "../lib/format.ts";
import type { AdjustedCalculations } from "../types/decision.ts";
import type {
  AdjustmentLineItem,
  AdjustmentSummary as AdjustmentSummaryData,
  CapPercentage,
  DeterministicMathBlock,
} from "../types/casePacket.ts";

// A deterministic math block chosen so a change in the single line item produces
// a directly predictable change in net tax:
//   grossDeductions  = sum(line item amounts)
//   effectiveCap     = allowableDeductionCap (no caps applied)  = 500
//   allowedDeduction = min(grossDeductions, 500)
//   taxableIncome    = max(0, 1000 - allowedDeduction)
//   netTax           = taxableIncome (no bracket adjustments)
//
//   amount 100 -> allowedDeduction 100 -> taxableIncome 900 -> netTax 900
//   amount 200 -> allowedDeduction 200 -> taxableIncome 800 -> netTax 800
const deterministicMath: DeterministicMathBlock = {
  totalIncome: { value: 1000, unit: "EUR" },
  allowableDeductionCap: { value: 500, unit: "EUR" },
  taxBracketAdjustments: [],
};

const INITIAL_AMOUNT = 100;
const CHANGED_AMOUNT = 200;
const INITIAL_NET_TAX = 900; // netTax when amount = 100
const CHANGED_NET_TAX = 800; // netTax when amount = 200

function makeLineItems(): AdjustmentLineItem[] {
  return [
    { id: "li-1", label: "Home Office Deduction", amount: INITIAL_AMOUNT, unit: "EUR" },
  ];
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Adjudication_Console recalculation timing bounds", () => {
  it("updates net tax owed within 500 ms of a valid line-item change (Req 10.2)", () => {
    vi.useFakeTimers();

    // Capture every reported recalculation so we can assert the updated value.
    const calls: AdjustedCalculations[] = [];
    const onAdjustedCalculationsChange = (calc: AdjustedCalculations) => {
      calls.push(calc);
    };

    render(
      <AdjustmentTable
        lineItems={makeLineItems()}
        capPercentages={[]}
        deterministicMath={deterministicMath}
        initialNetTaxOwed={INITIAL_NET_TAX}
        balanceUnit="EUR"
        onAdjustedCalculationsChange={onAdjustedCalculationsChange}
      />,
    );

    // Flush the mount debounce tick so the baseline recalculation is reported
    // and the displayed value reflects the seeded net tax.
    act(() => {
      vi.advanceTimersByTime(RECALCULATION_DEBOUNCE_MS);
    });

    const netTaxDisplay = screen.getByLabelText("Net Tax Owed");
    expect(netTaxDisplay).toHaveTextContent(
      formatMonetaryValue({ value: INITIAL_NET_TAX, unit: "EUR" }),
    );

    const callsBeforeEdit = calls.length;

    // Change the line item to a new valid number.
    const input = screen.getByLabelText("Home Office Deduction (EUR)");
    act(() => {
      fireEvent.change(input, { target: { value: String(CHANGED_AMOUNT) } });
    });

    // Advance to the 500 ms recalculation bound (Req 10.2). Because the debounce
    // is 200 ms, the trailing recalculation fires well inside this window.
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // A new recalculation was reported carrying the updated net tax.
    expect(calls.length).toBeGreaterThan(callsBeforeEdit);
    const latest = calls[calls.length - 1];
    expect(latest.netTaxOwed).toBe(CHANGED_NET_TAX);

    // And the displayed Net Tax Owed value updated within the same window.
    expect(netTaxDisplay).toHaveTextContent(
      formatMonetaryValue({ value: CHANGED_NET_TAX, unit: "EUR" }),
    );
  });

  it("updates net tax owed within exactly the debounce interval of a valid change (Req 10.2)", () => {
    vi.useFakeTimers();

    render(
      <AdjustmentTable
        lineItems={makeLineItems()}
        capPercentages={[]}
        deterministicMath={deterministicMath}
        initialNetTaxOwed={INITIAL_NET_TAX}
        balanceUnit="EUR"
      />,
    );

    act(() => {
      vi.advanceTimersByTime(RECALCULATION_DEBOUNCE_MS);
    });

    const netTaxDisplay = screen.getByLabelText("Net Tax Owed");
    const input = screen.getByLabelText("Home Office Deduction (EUR)");
    act(() => {
      fireEvent.change(input, { target: { value: String(CHANGED_AMOUNT) } });
    });

    // Advancing exactly RECALCULATION_DEBOUNCE_MS (200 ms << 500 ms) is enough
    // for the trailing recalculation to fire and the display to update.
    act(() => {
      vi.advanceTimersByTime(RECALCULATION_DEBOUNCE_MS);
    });

    expect(netTaxDisplay).toHaveTextContent(
      formatMonetaryValue({ value: CHANGED_NET_TAX, unit: "EUR" }),
    );
  });

  it("reflects the recomputed Final Auditor Balance within 1 s of a valid change (Req 9.4)", () => {
    vi.useFakeTimers();

    const adjustmentSummary: AdjustmentSummaryData = {
      originalClaim: { value: 950, unit: "EUR" },
      // The Final Auditor Balance card initializes to the AI recommendation
      // (Req 9.3); seeding the table's net tax to the same value keeps the card
      // aligned before any edit.
      aiRecommendedAdjustment: { value: INITIAL_NET_TAX, unit: "EUR" },
    };
    const adjustmentLineItems = makeLineItems();
    const capPercentages: CapPercentage[] = [];

    render(
      <AdjudicationConsole
        adjustmentSummary={adjustmentSummary}
        adjustmentLineItems={adjustmentLineItems}
        capPercentages={capPercentages}
        deterministicMath={deterministicMath}
      />,
    );

    // Flush the mount debounce so the balance settles at the seeded value.
    act(() => {
      vi.advanceTimersByTime(RECALCULATION_DEBOUNCE_MS);
    });

    // Locate the Final Auditor Balance card value cell.
    const balanceTitle = screen.getByText("Final Auditor Balance");
    const balanceCard = balanceTitle.parentElement as HTMLElement;
    expect(balanceCard).not.toBeNull();
    expect(balanceCard).toHaveTextContent(
      formatMonetaryValue({ value: INITIAL_NET_TAX, unit: "EUR" }),
    );

    // Change the line item to a new valid number.
    const input = screen.getByLabelText("Home Office Deduction (EUR)");
    act(() => {
      fireEvent.change(input, { target: { value: String(CHANGED_AMOUNT) } });
    });

    // Advance to the 1 s Final Auditor Balance bound (Req 9.4). The 200 ms
    // debounce fires well within this window.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The Final Auditor Balance card reflects the recomputed balance.
    expect(balanceCard).toHaveTextContent(
      formatMonetaryValue({ value: CHANGED_NET_TAX, unit: "EUR" }),
    );
  });
});
