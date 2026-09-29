// Example test for the StatutoryMatchList empty state (task 7.9).
//
// Requirement 6.4: when there are no statutory matches, the list renders the
// "no statutory matches" message instead of any match cards. This asserts the
// message is shown for an empty match array and that no list items render.

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import {
  StatutoryMatchList,
  STATUTORY_EMPTY_MESSAGE,
} from "./AgentTransparencyTree.tsx";

describe("StatutoryMatchList empty state", () => {
  it("renders the no-statutory-matches message and no list items when empty", () => {
    // _Requirements: 6.4_
    render(<StatutoryMatchList matches={[]} />);

    // The empty-state message is shown in a role="status" element.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(STATUTORY_EMPTY_MESSAGE);

    // No statutory match cards (list items) are rendered.
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
