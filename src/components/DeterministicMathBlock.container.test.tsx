// Example test for DeterministicMathBlock's container structure.
//
// Feature: tax-audit-dashboard, task 7.13: the deterministic math block renders
// a labeled, bordered container identified as deterministic backend calculations.
//
// Validates: Requirements 8.2
//
// Unlike the property test (Property 3, task 7.11) which checks the exact values,
// this example test focuses on the *structure* of the container: the block must
// carry the DETERMINISTIC_BLOCK_LABEL text (so it is labeled), expose an element
// whose accessible name is that label, and sit inside a bordered container.

import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";

import {
  DeterministicMathBlock,
  DETERMINISTIC_BLOCK_LABEL,
} from "./AgentTransparencyTree.tsx";
import type { DeterministicMathBlock as DeterministicMathBlockData } from "../types/casePacket.ts";

const math: DeterministicMathBlockData = {
  totalIncome: { value: 1000, unit: "EUR" },
  allowableDeductionCap: { value: 500, unit: "EUR" },
  taxBracketAdjustments: [
    { label: "State tax", amount: { value: 200, unit: "EUR" } },
  ],
};

describe("DeterministicMathBlock container structure (Req 8.2)", () => {
  afterEach(cleanup);

  it("renders a labeled container identified as deterministic backend calculations", () => {
    render(<DeterministicMathBlock math={math} />);

    // The container is labeled: the human-readable label text is present.
    expect(screen.getByText(DETERMINISTIC_BLOCK_LABEL)).toBeInTheDocument();

    // An element carries the label as its accessible name (aria-label on the dl).
    const labeled = document.querySelector(
      `[aria-label="${DETERMINISTIC_BLOCK_LABEL}"]`,
    );
    expect(labeled).not.toBeNull();
  });

  it("renders the block inside a bordered container", () => {
    const { container } = render(<DeterministicMathBlock math={math} />);

    // Find the labeled inner list, then walk up to the nearest ancestor whose
    // className carries a border class (the bordered Card wrapper, Req 8.2).
    const labeled = container.querySelector(
      `[aria-label="${DETERMINISTIC_BLOCK_LABEL}"]`,
    );
    expect(labeled).not.toBeNull();

    const borderedAncestor = labeled!.closest('[class*="border"]');
    expect(borderedAncestor).not.toBeNull();
  });
});
