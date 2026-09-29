// Example (non-property) tests for the EntityChipList tooltip timing and the
// empty-entities state (task 6.10).
//
// These cover two acceptance criteria of Requirement 4:
//   - 4.2: focusing/hovering an entity chip surfaces its tooltip within 200 ms.
//     The shared Tooltip primitive wraps Radix's tooltip with a default
//     `delayDuration` of 0 ms, so the content opens promptly on hover/focus.
//   - 4.4: an empty entity list renders the "no entities" message and no chips.
//
// Radix renders tooltip content in a portal and shows it on both pointer hover
// and keyboard focus. Rather than driving Radix's internal open/close timers
// with fake timers (which is brittle across versions), this test uses
// user-event with real timers and asserts the tooltip content appears at or
// before the 200 ms bound via `findByTestId` with a 200 ms timeout.

import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect } from "vitest";

import {
  EntityChipList,
  NO_ENTITIES_MESSAGE,
} from "./CaseContextPanel.tsx";
import type { EntityChip } from "../types/casePacket.ts";

afterEach(cleanup);

describe("EntityChipList tooltip timing and empty state", () => {
  it("surfaces the entity tooltip (label + formatted confidence) within 200 ms of hover (Req 4.2)", async () => {
    const user = userEvent.setup();

    const entity: EntityChip = { label: "Acme Corp", confidence: 0.92 };
    render(<EntityChipList entities={[entity]} />);

    // Before any interaction the tooltip content is not mounted.
    expect(screen.queryByTestId("entity-chip-tooltip")).toBeNull();

    const chip = screen.getByTestId("entity-chip");
    await user.hover(chip);

    // Because the Tooltip's delayDuration defaults to 0 ms, the content should
    // appear at or before the 200 ms bound (Req 4.2). Radix may render the
    // content in more than one node (visible + a11y), so assert at least one.
    const tooltip = await screen.findByTestId(
      "entity-chip-tooltip",
      {},
      { timeout: 200 },
    );
    expect(tooltip).toBeInTheDocument();

    // The tooltip shows the entity label and the confidence as a whole percent.
    const tooltips = screen.getAllByTestId("entity-chip-tooltip");
    expect(tooltips.some((node) => node.textContent?.includes("Acme Corp"))).toBe(
      true,
    );
    expect(tooltips.some((node) => node.textContent?.includes("92%"))).toBe(
      true,
    );
  });

  it("shows the 'no entities' message and renders no chips when the entity list is empty (Req 4.4)", () => {
    render(<EntityChipList entities={[]} />);

    const message = screen.getByTestId("entity-chip-empty-message");
    expect(message).toHaveTextContent(NO_ENTITIES_MESSAGE);

    // No entity chips are rendered for an empty list.
    expect(screen.queryAllByTestId("entity-chip")).toHaveLength(0);
    // And there is no chip-list container either.
    expect(screen.queryByTestId("entity-chip-list")).toBeNull();
  });
});
